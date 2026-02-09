/**
 * Semantic coffee shop placement along a route.
 *
 * When the user's preference is explicit ("near_origin", "near_destination"),
 * we honour it directly. When it is ambiguous ("midpoint" or absent), we use
 * route duration to decide the best placement:
 *
 *   Short  (<15 min) → near the START (grab-and-go)
 *   Medium (15-45 min) → MIDPOINT (50 % into route)
 *   Long   (>45 min) → MIDPOINT biased toward 33-50 % (natural break)
 */

/**
 * Resolve a Gemini preference string + route data into a concrete
 * { fraction, insertLabel } that tells us WHERE along the route to search.
 *
 * @param {string|null} preference  – e.g. "midpoint", "near_origin", "midpoint:starbucks"
 * @param {Object}      route       – routeData with .totals.duration.value (seconds) and .stops[]
 * @returns {{ fraction: number, label: string, brand: string|null }}
 *   fraction  0 → origin, 1 → destination
 */
export function resolvePlacement(preference, route) {
  const raw = preference || 'midpoint';
  const parts = raw.split(':');
  const location = parts[0];          // "midpoint" | "near_origin" | "near_destination"
  const brand = parts[1] || null;     // e.g. "starbucks" or null

  // Explicit user intent – honour directly
  if (location === 'near_origin') {
    return { fraction: 0.1, label: 'near your start', brand };
  }
  if (location === 'near_destination') {
    return { fraction: 0.9, label: 'near your destination', brand };
  }

  // Ambiguous / "midpoint" – refine with route duration
  const durationSec = route?.totals?.duration?.value || 0;
  const durationMin = durationSec / 60;

  if (durationMin < 15) {
    // Short route: grab coffee early so it doesn't dominate the trip
    return { fraction: 0.15, label: 'near the start (short route)', brand };
  }
  if (durationMin > 45) {
    // Long route: natural break at ~33 %
    return { fraction: 0.33, label: 'about a third of the way', brand };
  }
  // Medium route: classic midpoint
  return { fraction: 0.5, label: 'midpoint', brand };
}

/**
 * Interpolate a point along the straight-line path between origin and destination
 * at a given fraction (0 → origin, 1 → destination).
 *
 * If the route has intermediate waypoints we walk the stop list proportionally
 * so the fraction better matches the actual path.
 */
export function interpolateRoutePoint(stops, fraction) {
  if (!stops || stops.length < 2) return null;

  if (fraction <= 0) return { lat: stops[0].lat, lng: stops[0].lng };
  if (fraction >= 1) {
    const last = stops[stops.length - 1];
    return { lat: last.lat, lng: last.lng };
  }

  // Walk segment-by-segment using straight-line distances
  const segLengths = [];
  let totalLen = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const d = haversineKm(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng);
    segLengths.push(d);
    totalLen += d;
  }

  const targetDist = fraction * totalLen;
  let accumulated = 0;

  for (let i = 0; i < segLengths.length; i++) {
    if (accumulated + segLengths[i] >= targetDist) {
      const segFrac = (targetDist - accumulated) / segLengths[i];
      return {
        lat: stops[i].lat + (stops[i + 1].lat - stops[i].lat) * segFrac,
        lng: stops[i].lng + (stops[i + 1].lng - stops[i].lng) * segFrac,
      };
    }
    accumulated += segLengths[i];
  }

  // Fallback
  const last = stops[stops.length - 1];
  return { lat: last.lat, lng: last.lng };
}

/**
 * Determine which stop-index a new waypoint at `point` should be inserted AFTER.
 * Returns the index so that `stops.splice(index, 0, newStop)` puts it in the
 * best position to minimise detour.
 */
export function bestInsertionIndex(stops, point) {
  let bestIdx = 1;
  let bestCost = Infinity;

  for (let i = 0; i < stops.length - 1; i++) {
    // Cost = detour added by detouring through `point` instead of going directly
    const directDist = haversineKm(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng);
    const detourDist =
      haversineKm(stops[i].lat, stops[i].lng, point.lat, point.lng) +
      haversineKm(point.lat, point.lng, stops[i + 1].lat, stops[i + 1].lng);
    const cost = detourDist - directDist;

    if (cost < bestCost) {
      bestCost = cost;
      bestIdx = i + 1;
    }
  }

  return bestIdx;
}

// ── helpers ──────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
