import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getHistory, getHistoryById, deleteHistory, getRecentDestinations } from '../services/historyService.js';

const router = express.Router();

// Get user's history
router.get('/', requireAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const history = getHistory(req.userId, limit, offset);

    res.json({
      success: true,
      history: history.map(item => ({
        id: item.id,
        actionType: item.action_type,
        transcript: item.transcript,
        stops: JSON.parse(item.stops_json),
        route: JSON.parse(item.route_data_json),
        createdAt: item.created_at
      }))
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Get recent destinations
router.get('/recent-destinations', requireAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const destinations = getRecentDestinations(req.userId, limit);

    res.json({
      success: true,
      destinations
    });
  } catch (error) {
    console.error('Get recent destinations error:', error);
    res.status(500).json({ error: 'Failed to get recent destinations' });
  }
});

// Get specific history item
router.get('/:id', requireAuth, (req, res) => {
  try {
    const historyId = parseInt(req.params.id);
    const item = getHistoryById(historyId, req.userId);

    if (!item) {
      return res.status(404).json({ error: 'History item not found' });
    }

    res.json({
      success: true,
      history: {
        id: item.id,
        actionType: item.action_type,
        transcript: item.transcript,
        stops: JSON.parse(item.stops_json),
        route: JSON.parse(item.route_data_json),
        createdAt: item.created_at
      }
    });
  } catch (error) {
    console.error('Get history item error:', error);
    res.status(500).json({ error: 'Failed to get history item' });
  }
});

// Delete history item
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const historyId = parseInt(req.params.id);
    const deleted = deleteHistory(historyId, req.userId);

    if (!deleted) {
      return res.status(404).json({ error: 'History item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete history error:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

export default router;
