import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractStopsFromAudio } from '../services/gemini.js';
import { getMultiStopRoute } from '../services/maps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOICE_BUFFER_DIR = path.resolve(__dirname, '../../voice_buffer');

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

    // Save audio to voice_buffer/ named by waypoints
    fs.mkdirSync(VOICE_BUFFER_DIR, { recursive: true });
    const waypoints = geminiResult.stops.map(s => s.original.replace(/[\/\\:*?"<>|]/g, '_')).join(', ');
    const bufferFilename = `[${waypoints}].mp3`;
    const bufferPath = path.join(VOICE_BUFFER_DIR, bufferFilename);
    fs.writeFile(bufferPath, req.file.buffer, (err) => {
      if (err) console.error('Failed to save voice buffer:', err);
      else console.log('Saved voice buffer:', bufferPath);
    });

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
      transcript: geminiResult.transcript || null,
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

export default router;
