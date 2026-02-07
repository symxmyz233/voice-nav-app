import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractStopsFromAudio } from '../services/gemini.js';
import { getMultiStopRoute } from '../services/maps.js';
import { findNearbyCoffeeShops } from '../services/placeService.js';
import { recommendCoffeeShops, formatShopForDisplay } from '../utils/coffeeShopRecommender.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOICE_BUFFER_DIR = path.resolve(__dirname, '../../voice_buffer');
const ROUTE_CACHE_PATH = path.resolve(__dirname, '../../route_cache.json');

const router = express.Router();

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

    console.log('Processing with Gemini...');

    // Step 1: Extract stops from audio using Gemini
    let geminiResult;
    try {
      geminiResult = await extractStopsFromAudio(
        req.file.buffer,
        req.file.mimetype
      );
      console.log('Gemini response:', geminiResult);
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

    // Step 2: Get route from Google Maps
    console.log('Getting route from Google Maps...');
    const routeData = await getMultiStopRoute(geminiResult.stops);

    const result = {
      success: true,
      transcript: geminiResult.transcript || null,
      extractedStops: geminiResult.stops,
      route: routeData,
      warnings: routeData.warnings || []
    };

    // Cache the route data to disk
    fs.writeFile(ROUTE_CACHE_PATH, JSON.stringify(result.route), (err) => {
      if (err) console.error('Failed to cache route:', err);
      else console.log('Cached route to', ROUTE_CACHE_PATH);
    });

    res.json(result);
  } catch (error) {
    console.error('Error processing voice:', error);
    res.status(500).json({
      error: error.message || 'Failed to process voice input'
    });
  }
});

/**
 * POST /api/route
 * Get route for manually specified stops
 */
router.post('/route', async (req, res) => {
  try {
    const { stops } = req.body;

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({
        error: 'At least 2 stops are required'
      });
    }

    const routeData = await getMultiStopRoute(stops);

    res.json({
      success: true,
      route: routeData
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
router.get('/last-route', (req, res) => {
  try {
    if (!fs.existsSync(ROUTE_CACHE_PATH)) {
      return res.json({ success: true, route: null });
    }
    const data = fs.readFileSync(ROUTE_CACHE_PATH, 'utf-8');
    res.json({ success: true, route: JSON.parse(data) });
  } catch (error) {
    console.error('Error reading route cache:', error);
    res.json({ success: true, route: null });
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
