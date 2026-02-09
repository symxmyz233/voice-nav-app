import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { saveRoute, getSavedRoutes, getSavedRouteById, updateSavedRoute, updateRouteLastUsed, deleteSavedRoute } from '../services/routeService.js';

const router = express.Router();

// Get all saved routes for user
router.get('/', requireAuth, (req, res) => {
  try {
    const routes = getSavedRoutes(req.userId);

    res.json({
      success: true,
      routes: routes.map(route => ({
        id: route.id,
        routeName: route.route_name,
        stops: JSON.parse(route.stops_json),
        createdAt: route.created_at,
        lastUsed: route.last_used
      }))
    });
  } catch (error) {
    console.error('Get saved routes error:', error);
    res.status(500).json({ error: 'Failed to get saved routes' });
  }
});

// Save current route
router.post('/', requireAuth, (req, res) => {
  try {
    const { routeName, stops } = req.body;

    if (!routeName || typeof routeName !== 'string' || routeName.trim().length === 0) {
      return res.status(400).json({ error: 'Route name is required' });
    }

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({ error: 'At least 2 stops are required' });
    }

    const routeId = saveRoute(req.userId, routeName.trim(), stops);

    res.json({
      success: true,
      routeId
    });
  } catch (error) {
    console.error('Save route error:', error);
    res.status(500).json({ error: 'Failed to save route' });
  }
});

// Get specific saved route
router.get('/:id', requireAuth, (req, res) => {
  try {
    const routeId = parseInt(req.params.id);
    const route = getSavedRouteById(routeId, req.userId);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Update last used
    updateRouteLastUsed(routeId, req.userId);

    res.json({
      success: true,
      route: {
        id: route.id,
        routeName: route.route_name,
        stops: JSON.parse(route.stops_json),
        createdAt: route.created_at,
        lastUsed: route.last_used
      }
    });
  } catch (error) {
    console.error('Get saved route error:', error);
    res.status(500).json({ error: 'Failed to get route' });
  }
});

// Update saved route
router.put('/:id', requireAuth, (req, res) => {
  try {
    const routeId = parseInt(req.params.id);
    const { routeName, stops } = req.body;

    if (!routeName || typeof routeName !== 'string' || routeName.trim().length === 0) {
      return res.status(400).json({ error: 'Route name is required' });
    }

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({ error: 'At least 2 stops are required' });
    }

    const updated = updateSavedRoute(routeId, req.userId, routeName.trim(), stops);

    if (!updated) {
      return res.status(404).json({ error: 'Route not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update route error:', error);
    res.status(500).json({ error: 'Failed to update route' });
  }
});

// Delete saved route
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const routeId = parseInt(req.params.id);
    const deleted = deleteSavedRoute(routeId, req.userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Route not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete route error:', error);
    res.status(500).json({ error: 'Failed to delete route' });
  }
});

export default router;
