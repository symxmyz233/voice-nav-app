import { getDatabase } from '../db/database.js';

export function saveRoute(userId, routeName, stops) {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO saved_routes (user_id, route_name, stops_json)
    VALUES (?, ?, ?)
  `).run(
    userId,
    routeName,
    JSON.stringify(stops)
  );

  console.log(`Saved route "${routeName}" for user ${userId}`);
  return result.lastInsertRowid;
}

export function getSavedRoutes(userId) {
  const db = getDatabase();

  return db.prepare(`
    SELECT id, route_name, stops_json, created_at, last_used
    FROM saved_routes
    WHERE user_id = ?
    ORDER BY last_used DESC, created_at DESC
  `).all(userId);
}

export function getSavedRouteById(routeId, userId) {
  const db = getDatabase();

  return db.prepare(`
    SELECT id, route_name, stops_json, created_at, last_used
    FROM saved_routes
    WHERE id = ? AND user_id = ?
  `).get(routeId, userId);
}

export function updateSavedRoute(routeId, userId, routeName, stops) {
  const db = getDatabase();

  const result = db.prepare(`
    UPDATE saved_routes
    SET route_name = ?, stops_json = ?, last_used = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(routeName, JSON.stringify(stops), routeId, userId);

  return result.changes > 0;
}

export function updateRouteLastUsed(routeId, userId) {
  const db = getDatabase();

  const result = db.prepare(`
    UPDATE saved_routes
    SET last_used = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(routeId, userId);

  return result.changes > 0;
}

export function deleteSavedRoute(routeId, userId) {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM saved_routes
    WHERE id = ? AND user_id = ?
  `).run(routeId, userId);

  return result.changes > 0;
}
