import express from 'express';
import multer from 'multer';
import { extractStopsFromAudio } from '../services/gemini.js';
import { getMultiStopRoute } from '../services/maps.js';
import { findNearbyCoffeeShops } from '../services/placeService.js';
import { recommendCoffeeShops, formatShopForDisplay } from '../utils/coffeeShopRecommender.js';

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

    if (geminiResult.error || !geminiResult.stops || geminiResult.stops.length === 0) {
      return res.status(400).json({
        error: geminiResult.error || 'No locations found in audio'
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

    // Return combined result
    res.json({
      success: true,
      extractedStops: geminiResult.stops,
      route: routeData,
      warnings: routeData.warnings || []
    });
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
