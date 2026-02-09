import { getDatabase } from '../db/database.js';

export function saveToHistory(userId, actionType, transcript, stops, routeData) {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO history (user_id, action_type, transcript, stops_json, route_data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    actionType || 'new_route',
    transcript || null,
    JSON.stringify(stops),
    JSON.stringify(routeData)
  );

  console.log(`Saved route to history for user ${userId}, action: ${actionType}`);
  return result.lastInsertRowid;
}

export function getHistory(userId, limit = 50, offset = 0) {
  const db = getDatabase();

  return db.prepare(`
    SELECT id, action_type, transcript, stops_json, route_data_json, created_at
    FROM history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

export function getHistoryById(historyId, userId) {
  const db = getDatabase();

  return db.prepare(`
    SELECT id, action_type, transcript, stops_json, route_data_json, created_at
    FROM history
    WHERE id = ? AND user_id = ?
  `).get(historyId, userId);
}

export function deleteHistory(historyId, userId) {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM history
    WHERE id = ? AND user_id = ?
  `).run(historyId, userId);

  return result.changes > 0;
}

export function getRecentDestinations(userId, limit = 10) {
  const db = getDatabase();

  // Get recent routes - use route_data_json to get properly geocoded names
  const history = db.prepare(`
    SELECT route_data_json, created_at
    FROM history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(userId);

  const destinations = new Map();

  for (const item of history) {
    try {
      const route = JSON.parse(item.route_data_json);
      if (!route.stops || route.stops.length === 0) continue;

      // Extract ALL stops from the route (origin, waypoints, destination)
      for (const stop of route.stops) {
        // Skip if no coordinates
        if (!stop.lat || !stop.lng) continue;

        // Use coordinates as unique key
        const key = `${stop.lat},${stop.lng}`;

        // Only add if not already in map
        if (!destinations.has(key)) {
          // Determine display name based on type
          let displayName = 'Unknown';

          if (stop.type === 'landmark' || stop.type === 'partial') {
            // For landmarks, use the name (e.g., "Manhattan", "Starbucks")
            displayName = stop.name || stop.original || stop.searchQuery;
          } else if (stop.type === 'full_address') {
            // For addresses, try to extract business/building name or use street name
            const name = stop.name || '';
            const parts = name.split(/[,\s]+/);
            // Use first part if it's not a number (likely a business/building name)
            if (parts[0] && isNaN(parts[0])) {
              displayName = parts[0];
            } else if (parts.length > 1) {
              // Use street name (e.g., "40 Wyckoff Avenue" -> "Wyckoff")
              displayName = parts[1] || name;
            } else {
              displayName = name;
            }
          } else {
            // Fallback to name or original
            displayName = stop.name || stop.original || stop.searchQuery;
          }

          // Clean up the display name
          displayName = displayName.trim();
          if (displayName.length > 30) {
            displayName = displayName.substring(0, 30) + '...';
          }

          destinations.set(key, {
            name: displayName,
            lat: stop.lat,
            lng: stop.lng,
            formattedAddress: stop.formattedAddress,
            placeId: stop.placeId,
            type: stop.type,
            lastUsed: item.created_at
          });

          // Stop if we have enough unique places
          if (destinations.size >= limit) break;
        }
      }

      if (destinations.size >= limit) break;
    } catch (error) {
      console.error('Error parsing route_data_json:', error);
    }
  }

  return Array.from(destinations.values());
}
