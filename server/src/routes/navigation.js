import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractStopsFromAudio } from '../services/gemini.js';
import { getMultiStopRoute } from '../services/maps.js';
import { isValidEmail, sendRouteEmail } from '../services/email.js';
import { findNearbyCoffeeShops } from '../services/placeService.js';
import { recommendCoffeeShops, formatShopForDisplay } from '../utils/coffeeShopRecommender.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOICE_BUFFER_DIR = path.resolve(__dirname, '../../voice_buffer');
const ROUTE_CACHE_PATH = path.resolve(__dirname, '../../route_cache.json');
const ROUTE_CACHE_VERSION = 1;

const router = express.Router();

function sanitizeStopsForCache(stops = []) {
  return stops.map((stop) => {
    if (typeof stop === 'string') return stop;
    return stop?.searchQuery || stop?.original || String(stop);
  });
}

async function writeRouteCache(route, source, stops = [], transcript = null) {
  const payload = {
    version: ROUTE_CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    source,
    stops: sanitizeStopsForCache(stops),
    route,
    transcript: transcript || null
  };

  const tempPath = `${ROUTE_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
  await fs.promises.rename(tempPath, ROUTE_CACHE_PATH);
  return payload;
}

function normalizeCachePayload(raw) {
  // Backward compatibility: legacy file stored route object directly.
  if (raw && raw.route) {
    return {
      version: raw.version || ROUTE_CACHE_VERSION,
      updatedAt: raw.updatedAt || null,
      source: raw.source || 'unknown',
      stops: Array.isArray(raw.stops) ? raw.stops : [],
      route: raw.route,
      transcript: raw.transcript || null
    };
  }

  return {
    version: ROUTE_CACHE_VERSION,
    updatedAt: null,
    source: 'legacy',
    stops: [],
    route: raw || null,
    transcript: null
  };
}

async function readRouteCache() {
  try {
    const data = await fs.promises.readFile(ROUTE_CACHE_PATH, 'utf-8');
    return normalizeCachePayload(JSON.parse(data));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function normalizeLocationHint(value) {
  if (!value || typeof value !== 'object') return null;

  const lat = Number(value.lat);
  const lng = Number(value.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function normalizeStopsForConfirmation(stops = []) {
  return stops.map((stop) => {
    if (typeof stop === 'string') {
      return {
        name: stop,
        original: stop,
        searchQuery: stop,
        confidence: 1
      };
    }

    const fallbackName = stop?.name || stop?.original || stop?.searchQuery || 'Unknown stop';
    return {
      ...stop,
      name: fallbackName,
      original: stop?.original || fallbackName,
      searchQuery: stop?.searchQuery || stop?.original || fallbackName,
      confidence: typeof stop?.confidence === 'number' ? stop.confidence : 1
    };
  });
}

function sanitizeConfirmationStopIndexes(indexes, stopCount) {
  if (!Array.isArray(indexes)) return [];

  const deduped = [];
  const seen = new Set();

  indexes.forEach((rawIndex) => {
    const index = Number(rawIndex);
    if (!Number.isInteger(index)) return;
    if (index < 0 || index >= stopCount) return;
    if (seen.has(index)) return;
    seen.add(index);
    deduped.push(index);
  });

  return deduped;
}

function findConfirmationStopIndexes(stops = [], confidenceThreshold = null) {
  const indexes = [];

  stops.forEach((stop, index) => {
    const needsConfirmation = Boolean(stop?.needsConfirmation);
    const lowConfidence = (
      typeof confidenceThreshold === 'number' &&
      typeof stop?.confidence === 'number' &&
      stop.confidence < confidenceThreshold
    );

    if (needsConfirmation || lowConfidence) {
      indexes.push(index);
    }
  });

  return indexes;
}

// Configure multer for audio file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

/**
 * POST /api/process-voice
 * Process voice input and return navigation route
 */
router.post('/process-voice', upload.single('audio'), async (req, res) => {
  console.log('=== /api/process-voice called ===');
  try {
    if (!req.file) {
      console.log('No file received');
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('Received audio file:', {
      mimetype: req.file.mimetype,
      size: req.file.size,
      originalname: req.file.originalname
    });

    // Parse current route from request body if provided
    let currentRoute = null;
    if (req.body.currentRoute) {
      try {
        currentRoute = JSON.parse(req.body.currentRoute);
        console.log('✅ Current route context provided:', {
          stops: currentRoute.stops?.length || 0,
          stopNames: currentRoute.stops?.map(s => s.name || s.address).join(' → ')
        });
      } catch (e) {
        console.log('❌ Failed to parse currentRoute:', e.message);
      }
    } else {
      console.log('⚠️  No current route context - this will be treated as a new route');
    }

    // Parse user location from request body if provided
    let userLocation = null;
    if (req.body.userLocation) {
      try {
        const parsedLocation = JSON.parse(req.body.userLocation);
        userLocation = normalizeLocationHint(parsedLocation);

        if (userLocation) {
          console.log('✅ User location provided:', {
            lat: userLocation.lat,
            lng: userLocation.lng
          });
        } else {
          console.log('⚠️ User location provided but invalid format:', req.body.userLocation);
        }
      } catch (e) {
        console.log('❌ Failed to parse userLocation:', e.message);
      }
    }

    console.log('Processing with Gemini...');

    // Step 1: Extract stops from audio using Gemini
    let geminiResult;
    try {
      geminiResult = await extractStopsFromAudio(
        req.file.buffer,
        req.file.mimetype,
        currentRoute
      );
      console.log('\n========== GEMINI EXTRACTION RESULT ==========');
      console.log('📝 Transcript:', geminiResult.transcript);
      console.log('🎯 Command type:', geminiResult.commandType);
      console.log('📍 Number of stops extracted:', geminiResult.stops.length);
      console.log('🗺️  Insert position:', JSON.stringify(geminiResult.insertPosition));
      geminiResult.stops.forEach((stop, i) => {
        console.log(`\nStop ${i + 1}:`);
        console.log(`  Original: "${stop.original}"`);
        console.log(`  Type: ${stop.type}`);
        console.log(`  SearchQuery: "${stop.searchQuery}"`);
        console.log(`  BusinessName: ${stop.parsed?.businessName || 'N/A'}`);
        console.log(`  Confidence: ${stop.confidence}`);
      });
      console.log('==============================================\n');
    } catch (geminiError) {
      console.error('Gemini error:', geminiError);
      return res.status(500).json({ error: 'Gemini API error: ' + geminiError.message });
    }

    if (geminiResult.error || !Array.isArray(geminiResult.stops) || geminiResult.stops.length === 0) {
      return res.status(400).json({
        error: geminiResult.error || 'No locations found in audio'
      });
    }

    // Save audio to voice_buffer/ only if it's a new recording (not from buffer)
    if (req.body.from_buffer !== 'true') {
      fs.mkdirSync(VOICE_BUFFER_DIR, { recursive: true });
      const waypoints = geminiResult.stops.map(s => s.original.replace(/[\/\\:*?"<>|]/g, '_')).join(', ');
      const bufferFilename = `[${waypoints}].mp3`;
      const bufferPath = path.join(VOICE_BUFFER_DIR, bufferFilename);
      fs.writeFile(bufferPath, req.file.buffer, (err) => {
        if (err) console.error('Failed to save voice buffer:', err);
        else console.log('Saved voice buffer:', bufferPath);
      });
    }

    // Log extracted stops with their types
    console.log('Extracted stops:');
    geminiResult.stops.forEach((stop, i) => {
      console.log(`  ${i + 1}. [${stop.type}] "${stop.original}" (confidence: ${stop.confidence})`);
    });

    // Step 2: Build final stops array based on command type
    let finalStops = [];
    const commandType = geminiResult.commandType || 'new_route';

    if (commandType === 'new_route') {
      finalStops = geminiResult.stops;

      // Prepend current location when user didn't specify a starting point
      // (e.g., "Go to X", "Go to X with a stop at Y")
      if (geminiResult.needsCurrentLocation) {
        if (userLocation) {
          const currentLocationStop = {
            original: 'Current Location',
            type: 'current_location',
            parsed: {
              streetNumber: null,
              streetName: null,
              city: null,
              state: null,
              country: null,
              postalCode: null,
              landmark: null,
              businessName: null
            },
            searchQuery: `${userLocation.lat},${userLocation.lng}`,
            confidence: 1.0,
            lat: userLocation.lat,
            lng: userLocation.lng
          };
          finalStops = [currentLocationStop, ...finalStops];
          console.log('needsCurrentLocation=true — prepended current location as origin');
        } else {
          return res.status(400).json({
            error: 'This command requires location access. Please enable location services or specify a starting point (e.g. "Navigate from A to B").'
          });
        }
      }

      console.log('Creating new route with', finalStops.length, 'stops');
    } else if (commandType === 'add_stop' || commandType === 'insert_stop') {
      // Modify existing route
      console.log('\n========== ADD/INSERT STOP OPERATION ==========');
      console.log('📋 Current route validation:');
      console.log(`  Has currentRoute: ${!!currentRoute}`);
      console.log(`  Has stops: ${!!currentRoute?.stops}`);
      console.log(`  Stops count: ${currentRoute?.stops?.length || 0}`);

      if (currentRoute?.stops) {
        console.log('  Current route stops:');
        currentRoute.stops.forEach((stop, i) => {
          console.log(`    [${i}] ${stop.name || stop.original} | lat: ${stop.lat}, lng: ${stop.lng}`);
        });
      }

      if (!currentRoute || !currentRoute.stops || currentRoute.stops.length === 0) {
        console.log('❌ No current route found - cannot add stop');
        return res.status(400).json({
          error: 'Cannot add stop - no existing route found. Please create a route first.'
        });
      }

      // Validate: should only have ONE stop for add/insert commands
      if (geminiResult.stops.length === 0) {
        return res.status(400).json({
          error: 'No location found to add/insert'
        });
      }
      if (geminiResult.stops.length > 1) {
        console.warn(`⚠️ Expected 1 stop for ${commandType}, got ${geminiResult.stops.length}. Using first stop only.`);
      }

      const newStop = geminiResult.stops[0]; // Use only the first stop
      console.log('🆕 New stop to add:', {
        original: newStop.original,
        searchQuery: newStop.searchQuery,
        type: newStop.type,
        confidence: newStop.confidence
      });

      console.log('\n========== DUPLICATE CHECK ==========');
      console.log('🆕 New stop to add:', {
        original: newStop.original,
        searchQuery: newStop.searchQuery,
        type: newStop.type
      });
      console.log('📋 Existing stops in route:');
      currentRoute.stops.forEach((s, i) => {
        console.log(`  ${i}: "${s.name || s.original || s.searchQuery}"`);
      });

      // Check for duplicate stops
      const isDuplicate = currentRoute.stops.some(existingStop => {
        const newQuery = (newStop.searchQuery || newStop.original || '').toLowerCase().trim();
        const existingQuery = (existingStop.searchQuery || existingStop.original || existingStop.name || '').toLowerCase().trim();

        // Extract business name for comparison
        const extractBusinessName = (str) => {
          return str.replace(/,?\s+(in|at|near|downtown|edison|new jersey|nj|usa)$/gi, '').trim();
        };

        const newBusiness = extractBusinessName(newQuery);
        const existingBusiness = extractBusinessName(existingQuery);

        // Check for exact match or partial match
        if (newQuery === existingQuery) {
          console.log(`🔍 Duplicate detected: exact match "${newQuery}"`);
          return true;
        }

        if (newBusiness === existingBusiness && newBusiness.length > 3) {
          console.log(`🔍 Duplicate detected: same business "${newBusiness}"`);
          return true;
        }

        // Check if one contains the other (for cases like "Starbucks" vs "Starbucks Edison")
        if (newQuery.length > 5 && existingQuery.length > 5) {
          if (newQuery.includes(existingQuery) || existingQuery.includes(newQuery)) {
            console.log(`🔍 Duplicate detected: partial match "${newQuery}" vs "${existingQuery}"`);
            return true;
          }
        }

        return false;
      });

      if (isDuplicate) {
        console.log('🚫 DUPLICATE DETECTED - Stop already exists in route, skipping');
        console.log('=====================================\n');
        return res.json({
          success: true,
          message: 'This location is already in your route',
          route: currentRoute,
          commandType: 'duplicate_stop'
        });
      }

      console.log('✅ No duplicate found - proceeding to add stop');
      console.log('=====================================\n');

      // Start with existing stops
      finalStops = [...currentRoute.stops];
      const insertPos = geminiResult.insertPosition || { type: 'append' };

      console.log('\n🔧 Modifying route:');
      console.log('  Insert position:', insertPos);
      console.log('  Current stops before insert:', finalStops.length);

      if (insertPos.type === 'append') {
        // Add to end (before final destination)
        finalStops.splice(finalStops.length - 1, 0, newStop);
        console.log(`  ✓ Appended stop before destination (index: ${finalStops.length - 2})`);
      } else if (insertPos.type === 'after' && insertPos.referenceIndex !== null) {
        // Insert after reference stop
        finalStops.splice(insertPos.referenceIndex + 1, 0, newStop);
        console.log(`  ✓ Inserted after stop ${insertPos.referenceIndex} (new index: ${insertPos.referenceIndex + 1})`);
      } else if (insertPos.type === 'before' && insertPos.referenceIndex !== null) {
        // Insert before reference stop
        finalStops.splice(insertPos.referenceIndex, 0, newStop);
        console.log(`  ✓ Inserted before stop ${insertPos.referenceIndex} (new index: ${insertPos.referenceIndex})`);
      } else if (insertPos.type === 'between' && insertPos.referenceIndex !== null && insertPos.referenceIndex2 !== null) {
        // Insert between two stops
        const insertIndex = Math.max(insertPos.referenceIndex, insertPos.referenceIndex2);
        finalStops.splice(insertIndex, 0, newStop);
        console.log(`  ✓ Inserted between stops ${insertPos.referenceIndex} and ${insertPos.referenceIndex2} (new index: ${insertIndex})`);
      } else {
        // Default: append before destination
        finalStops.splice(finalStops.length - 1, 0, newStop);
        console.log(`  ✓ Using default append position (index: ${finalStops.length - 2})`);
      }

      console.log('\n📊 Final stops array after insert:');
      finalStops.forEach((stop, i) => {
        const marker = i === finalStops.length - 1 ? '🏁' : (i === 0 ? '🚩' : '📍');
        console.log(`  ${marker} [${i}] ${stop.original || stop.name} ${stop.searchQuery ? `(query: "${stop.searchQuery}")` : ''}`);
      });
      console.log('==============================================\n');
    } else if (commandType === 'replace_stop') {
      // Replace existing stop
      if (!currentRoute || !currentRoute.stops || currentRoute.stops.length === 0) {
        return res.status(400).json({
          error: 'Cannot replace stop - no existing route found.'
        });
      }

      // Validate: should only have ONE stop for replace commands
      if (geminiResult.stops.length === 0) {
        return res.status(400).json({
          error: 'No location found to replace with'
        });
      }
      if (geminiResult.stops.length > 1) {
        console.warn(`⚠️ Expected 1 stop for ${commandType}, got ${geminiResult.stops.length}. Using first stop only.`);
      }

      finalStops = [...currentRoute.stops];
      const newStop = geminiResult.stops[0]; // Use only the first stop
      const insertPos = geminiResult.insertPosition || {};

      if (insertPos.referenceIndex !== null && insertPos.referenceIndex >= 0 && insertPos.referenceIndex < finalStops.length) {
        finalStops[insertPos.referenceIndex] = newStop;
        console.log(`Replacing stop ${insertPos.referenceIndex}`);
      } else {
        return res.status(400).json({
          error: 'Cannot replace stop - invalid reference index.'
        });
      }
    }

    // Origin and destination can never be via
    if (finalStops.length > 0) finalStops[0].via = false;
    if (finalStops.length > 1) finalStops[finalStops.length - 1].via = false;

    console.log('Final stops array:', finalStops.map(s => s.original || s.searchQuery));

    // Step 2.5: Check confidence levels - if any stop has confidence < 0.9, ask for confirmation
    const CONFIDENCE_THRESHOLD = 0.9;
    const lowConfidenceStops = finalStops.filter(stop =>
      stop.confidence !== undefined && stop.confidence < CONFIDENCE_THRESHOLD
    );
    const lowConfidenceStopIndexes = findConfirmationStopIndexes(finalStops, CONFIDENCE_THRESHOLD);

    if (lowConfidenceStops.length > 0) {
      console.log(`⚠️ Found ${lowConfidenceStops.length} stops with low confidence - requesting user confirmation`);
      return res.json({
        success: true,
        needsConfirmation: true,
        transcript: geminiResult.transcript || null,
        commandType: geminiResult.commandType || 'new_route',
        stops: finalStops,
        confirmationStopIndexes: lowConfidenceStopIndexes,
        lowConfidenceStops: lowConfidenceStops.map(s => s.original),
        message: 'Please confirm the detected addresses before proceeding'
      });
    }

    // Step 3: Get route from Google Maps
    console.log('Getting route from Google Maps...');

    // Build geocoding context with user location and route context
    let geocodingContext = null;

    // Priority 1: User's current location (most accurate for new routes)
    if (userLocation) {
      geocodingContext = {
        userLocation: { lat: userLocation.lat, lng: userLocation.lng }
      };
      console.log(`🎯 Using user location for geocoding: (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})`);
    }

    // Priority 2: Route context for add_stop/insert_stop commands
    if ((commandType === 'add_stop' || commandType === 'insert_stop') && currentRoute?.stops?.length > 0) {
      // Calculate midpoint of current route for better location bias
      const existingStops = currentRoute.stops.filter((s) => {
        const lat = Number(s?.lat);
        const lng = Number(s?.lng);
        return Number.isFinite(lat) && Number.isFinite(lng);
      });
      if (existingStops.length > 0) {
        const avgLat = existingStops.reduce((sum, s) => sum + Number(s.lat), 0) / existingStops.length;
        const avgLng = existingStops.reduce((sum, s) => sum + Number(s.lng), 0) / existingStops.length;

        if (!geocodingContext) {
          geocodingContext = {};
        }
        geocodingContext.routeMidpoint = { lat: avgLat, lng: avgLng };
        geocodingContext.destination = existingStops[existingStops.length - 1];
        console.log(`🎯 Also using route context for geocoding: midpoint (${avgLat.toFixed(4)}, ${avgLng.toFixed(4)})`);
      }
    }

    let routeData;
    try {
      routeData = await getMultiStopRoute(finalStops, geocodingContext);
    } catch (routeError) {
      if (routeError?.code === 'ADDRESS_CONFIRMATION_REQUIRED') {
        console.warn('Address confirmation required before route generation');
        const confirmationStops = normalizeStopsForConfirmation(routeError.confirmationStops || finalStops);
        const confirmationStopIndexes = sanitizeConfirmationStopIndexes(
          routeError.confirmationStopIndexes,
          confirmationStops.length
        );
        const fallbackIndexes = findConfirmationStopIndexes(confirmationStops);
        return res.json({
          success: true,
          needsConfirmation: true,
          transcript: geminiResult.transcript || null,
          commandType: geminiResult.commandType || 'new_route',
          stops: confirmationStops,
          confirmationStopIndexes: confirmationStopIndexes.length > 0
            ? confirmationStopIndexes
            : (fallbackIndexes.length > 0 ? fallbackIndexes : confirmationStops.map((_, index) => index)),
          message: routeError.confirmationReason || 'Please confirm the ambiguous address before continuing'
        });
      }
      throw routeError;
    }

    console.log('\n========== ROUTE CALCULATION COMPLETE ==========');
    console.log('📍 Final route has', routeData.stops?.length || 0, 'stops:');
    if (routeData.stops) {
      routeData.stops.forEach((stop, i) => {
        const marker = i === routeData.stops.length - 1 ? '🏁' : (i === 0 ? '🚩' : '📍');
        console.log(`  ${marker} [${i}] ${stop.name}`);
        console.log(`       Address: ${stop.address}`);
        console.log(`       Coords: (${stop.lat}, ${stop.lng})`);
        console.log(`       Original: "${stop.original}"`);
      });
    }
    console.log('🚗 Total distance:', routeData.totalDistance);
    console.log('⏱️  Total duration:', routeData.totalDuration);
    console.log('===============================================\n');

    const result = {
      success: true,
      transcript: geminiResult.transcript || null,
      commandType: geminiResult.commandType || 'new_route',
      extractedStops: geminiResult.stops,
      insertPosition: geminiResult.insertPosition || null,
      route: routeData,
      warnings: routeData.warnings || []
    };

    try {
      const cacheMeta = await writeRouteCache(routeData, 'process-voice', geminiResult.stops, geminiResult.transcript);
      result.cache = {
        version: cacheMeta.version,
        updatedAt: cacheMeta.updatedAt,
        source: cacheMeta.source
      };
      console.log('Cached route to', ROUTE_CACHE_PATH);
    } catch (cacheError) {
      console.error('Failed to cache route:', cacheError);
    }

    res.json(result);
  } catch (error) {
    console.error('Error processing voice:', error);
    res.status(500).json({
      error: error.message || 'Failed to process voice input'
    });
  }
});

/**
 * POST /api/reconfirm-stop
 * Re-capture a single stop via voice during address confirmation flow
 */
router.post('/reconfirm-stop', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const geminiResult = await extractStopsFromAudio(
      req.file.buffer,
      req.file.mimetype,
      null
    );

    if (geminiResult.error || !Array.isArray(geminiResult.stops) || geminiResult.stops.length === 0) {
      return res.status(400).json({
        error: geminiResult.error || 'No location found in confirmation audio'
      });
    }

    if (geminiResult.stops.length > 1) {
      console.warn(`⚠️ Reconfirm-stop extracted ${geminiResult.stops.length} stops. Using the first one only.`);
    }

    return res.json({
      success: true,
      transcript: geminiResult.transcript || null,
      stop: geminiResult.stops[0]
    });
  } catch (error) {
    console.error('Error reconfirming stop from voice:', error);
    return res.status(500).json({
      error: error.message || 'Failed to reconfirm stop from voice'
    });
  }
});

/**
 * POST /api/route
 * Get route for manually specified stops
 */
router.post('/route', async (req, res) => {
  console.log('\n========== /api/route CALLED ==========');
  try {
    const { stops, transcript } = req.body;

    console.log('📍 Received stops:', stops.length);
    stops.forEach((stop, i) => {
      console.log(`  Stop ${i}:`, {
        name: stop.name || stop.original || stop.searchQuery,
        hasCoords: !!(stop.lat && stop.lng),
        coords: stop.lat && stop.lng ? `${stop.lat}, ${stop.lng}` : 'N/A'
      });
    });

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({
        error: 'At least 2 stops are required'
      });
    }

    console.log('🚗 Calculating route...');
    let routeData;
    try {
      routeData = await getMultiStopRoute(stops);
    } catch (routeError) {
      if (routeError?.code === 'ADDRESS_CONFIRMATION_REQUIRED') {
        console.warn('Address confirmation required before route generation');
        const confirmationStops = normalizeStopsForConfirmation(routeError.confirmationStops || stops);
        const confirmationStopIndexes = sanitizeConfirmationStopIndexes(
          routeError.confirmationStopIndexes,
          confirmationStops.length
        );
        const fallbackIndexes = findConfirmationStopIndexes(confirmationStops);
        return res.json({
          success: true,
          needsConfirmation: true,
          stops: confirmationStops,
          confirmationStopIndexes: confirmationStopIndexes.length > 0
            ? confirmationStopIndexes
            : (fallbackIndexes.length > 0 ? fallbackIndexes : confirmationStops.map((_, index) => index)),
          message: routeError.confirmationReason || 'Please confirm the ambiguous address before continuing'
        });
      }
      throw routeError;
    }
    console.log('✅ Route calculated successfully');
    console.log('======================================\n');
    let cache = null;

    try {
      const cacheMeta = await writeRouteCache(routeData, 'manual-route', stops, transcript);
      cache = {
        version: cacheMeta.version,
        updatedAt: cacheMeta.updatedAt,
        source: cacheMeta.source
      };
      console.log('Cached route to', ROUTE_CACHE_PATH);
    } catch (cacheError) {
      console.error('Failed to cache route:', cacheError);
    }

    res.json({
      success: true,
      route: routeData,
      cache
    });
  } catch (error) {
    console.error('Error getting route:', error);
    res.status(500).json({
      error: error.message || 'Failed to get route'
    });
  }
});

/**
 * GET /api/voice-buffers
 * List all saved voice buffer files
 */
router.get('/voice-buffers', (req, res) => {
  try {
    if (!fs.existsSync(VOICE_BUFFER_DIR)) {
      return res.json({ success: true, buffers: [] });
    }

    const files = fs.readdirSync(VOICE_BUFFER_DIR);
    const buffers = files.map((filename) => {
      const stats = fs.statSync(path.join(VOICE_BUFFER_DIR, filename));
      return { filename, size: stats.size };
    });

    res.json({ success: true, buffers });
  } catch (error) {
    console.error('Error listing voice buffers:', error);
    res.status(500).json({ error: 'Failed to list voice buffers' });
  }
});

/**
 * GET /api/voice-buffers/:filename
 * Serve a specific voice buffer audio file
 */
router.get('/voice-buffers/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(VOICE_BUFFER_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error serving voice buffer:', error);
    res.status(500).json({ error: 'Failed to serve voice buffer' });
  }
});

/**
 * DELETE /api/voice-buffers/:filename
 * Delete a specific voice buffer audio file
 */
router.delete('/voice-buffers/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(VOICE_BUFFER_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting voice buffer:', error);
    res.status(500).json({ error: 'Failed to delete voice buffer' });
  }
});

/**
 * GET /api/last-route
 * Return the most recently generated route from cache
 */
router.get('/last-route', async (req, res) => {
  try {
    const cache = await readRouteCache();
    if (!cache) {
      return res.json({ success: true, route: null, cache: null });
    }

    res.json({
      success: true,
      route: cache.route,
      transcript: cache.transcript || null,
      cache: {
        version: cache.version,
        updatedAt: cache.updatedAt,
        source: cache.source,
        stops: cache.stops
      }
    });
  } catch (error) {
    console.error('Error reading route cache:', error);
    res.json({ success: true, route: null, cache: null });
  }
});

/**
 * POST /api/send-route-email
 * Send the current/generated route to an email with a Google Maps deep link
 */
router.post('/send-route-email', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    let route = req.body?.route || null;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    // Allow clients to omit route and send the last cached route.
    if (!route) {
      const cache = await readRouteCache();
      route = cache?.route || null;
    }

    if (!route) {
      return res.status(400).json({ error: 'No route available to send' });
    }

    const emailResult = await sendRouteEmail({
      toEmail: email,
      route
    });

    res.json({
      success: true,
      message: `Route email sent to ${email}`,
      mapsLink: emailResult.mapsLink,
      messageId: emailResult.messageId
    });
  } catch (error) {
    console.error('Error sending route email:', error);
    res.status(500).json({
      error: error.message || 'Failed to send route email'
    });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'API is working' });
});

/**
 * POST /api/find-coffee-shops
 * Find and recommend coffee shops near a location or along a route
 */
router.post('/find-coffee-shops', async (req, res) => {
  console.log('=== /api/find-coffee-shops called ===');
  console.log('Request body:', req.body);
  console.log('Environment check - GOOGLE_MAPS_API_KEY exists:', !!process.env.GOOGLE_MAPS_API_KEY);

  try {
    const { lat, lng, route, radius = 5000, limit = 5, sortBy = 'score', openNowOnly = false } = req.body;

    let shops;

    // Check if searching along a route or at a specific location
    if (route && route.origin && route.destination) {
      // Route-based search
      console.log('Search type: Along route');
      console.log(`  Origin: ${route.origin.name || 'Unknown'} (${route.origin.lat}, ${route.origin.lng})`);
      console.log(`  Destination: ${route.destination.name || 'Unknown'} (${route.destination.lat}, ${route.destination.lng})`);
      console.log(`  Waypoints: ${route.waypoints?.length || 0}`);
      console.log(`  Search radius: ${radius}m, limit: ${limit}`);

      // Import the route-based search function
      const { findCoffeeShopsAlongRoute } = await import('../services/placeService.js');
      shops = await findCoffeeShopsAlongRoute(route, radius);

    } else if (lat !== undefined && lng !== undefined) {
      // Location-based search (legacy)
      console.log('Search type: Near location');

      // Validate location parameters
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        console.log('Validation failed: lat or lng not a number', { lat, lng, latType: typeof lat, lngType: typeof lng });
        return res.status(400).json({
          error: 'Latitude and longitude must be numbers'
        });
      }

      console.log(`Searching for coffee shops at (${lat}, ${lng}) within ${radius}m`);
      console.log('Search options:', { limit, sortBy, openNowOnly });

      // Search for nearby coffee shops
      shops = await findNearbyCoffeeShops(lat, lng, radius);

    } else {
      console.log('Validation failed: Neither route nor location provided');
      return res.status(400).json({
        error: 'Either route (origin, destination) or location (lat, lng) must be provided'
      });
    }

    if (shops.length === 0) {
      return res.json({
        success: true,
        recommendations: [],
        message: 'No coffee shops found in this area'
      });
    }

    // Get recommendations with context
    let recommendations;
    if (route) {
      // Route-based recommendations - pass route info for distance calculations
      const routeCenter = {
        lat: (route.origin.lat + route.destination.lat) / 2,
        lng: (route.origin.lng + route.destination.lng) / 2
      };
      recommendations = recommendCoffeeShops(shops, routeCenter.lat, routeCenter.lng, {
        limit,
        sortBy,
        openNowOnly,
        route // Pass route for enhanced scoring
      });
    } else {
      // Location-based recommendations
      recommendations = recommendCoffeeShops(shops, lat, lng, {
        limit,
        sortBy,
        openNowOnly
      });
    }

    // Format for display
    const formattedRecommendations = recommendations.map(shop =>
      formatShopForDisplay(shop)
    );

    console.log(`Found ${shops.length} coffee shops, recommending top ${formattedRecommendations.length}`);
    console.log('Sending successful response');

    const responseData = {
      success: true,
      recommendations: formattedRecommendations,
      totalFound: shops.length,
      searchRadius: radius
    };

    // Add appropriate context to response
    if (route) {
      responseData.searchType = 'route';
      responseData.route = {
        origin: route.origin.name || 'Origin',
        destination: route.destination.name || 'Destination'
      };
    } else {
      responseData.searchType = 'location';
      responseData.searchCenter = { lat, lng };
    }

    res.json(responseData);
  } catch (error) {
    console.error('=== Error in /api/find-coffee-shops ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    // Check if it's a Google API error
    if (error.response) {
      console.error('Google API HTTP Status:', error.response.status);
      console.error('Google API Error Data:', error.response.data);
    }

    console.error('=== End Error ===');

    // Send detailed error to client
    res.status(500).json({
      error: error.message || 'Failed to find coffee shops',
      details: error.response?.data || null,
      type: error.constructor.name
    });
  }
});

export default router;
