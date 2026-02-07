/**
 * Route utilities for calculating points and distances along navigation routes
 */

/**
 * Calculate distance between two points using Haversine formula (in meters)
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} - Distance in meters
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // Convert to meters
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate intermediate point between two coordinates
 * @param {Object} point1 - First point {lat, lng}
 * @param {Object} point2 - Second point {lat, lng}
 * @param {number} fraction - Position between points (0 = point1, 1 = point2)
 * @returns {Object} - Interpolated point {lat, lng}
 */
export function interpolatePoint(point1, point2, fraction) {
  const lat = point1.lat + (point2.lat - point1.lat) * fraction;
  const lng = point1.lng + (point2.lng - point1.lng) * fraction;
  return { lat, lng };
}

/**
 * Generate evenly spaced points along a route
 * @param {Object} route - Route object {origin, destination, waypoints}
 * @param {number} maxDistanceBetweenPoints - Max distance between points in meters (default: 50000m = 50km)
 * @returns {Array} - Array of points {lat, lng, segmentIndex}
 */
export function generateRoutePoints(route, maxDistanceBetweenPoints = 50000) {
  const points = [];

  // Build array of all stops including origin, waypoints, and destination
  const allStops = [
    route.origin,
    ...(route.waypoints || []),
    route.destination
  ];

  console.log(`Generating route points for ${allStops.length} stops`);

  // Generate points along each segment
  for (let i = 0; i < allStops.length - 1; i++) {
    const start = allStops[i];
    const end = allStops[i + 1];

    const segmentDistance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
    console.log(`  Segment ${i}: ${start.name || 'Stop'} → ${end.name || 'Stop'} (${(segmentDistance / 1000).toFixed(1)}km)`);

    // Calculate number of points needed for this segment
    const numPoints = Math.max(2, Math.ceil(segmentDistance / maxDistanceBetweenPoints));

    // Generate points along this segment
    for (let j = 0; j < numPoints; j++) {
      const fraction = j / (numPoints - 1);
      const point = interpolatePoint(start, end, fraction);
      points.push({
        ...point,
        segmentIndex: i,
        segmentFraction: fraction
      });
    }
  }

  console.log(`Generated ${points.length} search points along route`);
  return points;
}

/**
 * Calculate the minimum distance from a point to a line segment
 * @param {Object} point - Point to measure from {lat, lng}
 * @param {Object} lineStart - Start of line segment {lat, lng}
 * @param {Object} lineEnd - End of line segment {lat, lng}
 * @returns {number} - Minimum distance in meters
 */
export function distanceToLineSegment(point, lineStart, lineEnd) {
  // Convert to Cartesian coordinates (approximation for small distances)
  const px = point.lng;
  const py = point.lat;
  const x1 = lineStart.lng;
  const y1 = lineStart.lat;
  const x2 = lineEnd.lng;
  const y2 = lineEnd.lat;

  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let closestLat, closestLng;

  if (param < 0) {
    closestLat = y1;
    closestLng = x1;
  } else if (param > 1) {
    closestLat = y2;
    closestLng = x2;
  } else {
    closestLat = y1 + param * D;
    closestLng = x1 + param * C;
  }

  return calculateDistance(point.lat, point.lng, closestLat, closestLng);
}

/**
 * Calculate minimum distance from a point to any segment of the route
 * @param {Object} point - Point {lat, lng}
 * @param {Object} route - Route object {origin, destination, waypoints}
 * @returns {number} - Minimum distance to route in meters
 */
export function distanceToRoute(point, route) {
  const allStops = [
    route.origin,
    ...(route.waypoints || []),
    route.destination
  ];

  let minDistance = Infinity;

  // Check distance to each segment
  for (let i = 0; i < allStops.length - 1; i++) {
    const distance = distanceToLineSegment(point, allStops[i], allStops[i + 1]);
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
}

/**
 * Get a descriptive location along the route
 * @param {number} segmentIndex - Which segment of the route
 * @param {number} segmentFraction - Position within segment (0-1)
 * @param {Object} route - Route object
 * @returns {string} - Description like "Between A and B"
 */
export function getRouteLocationDescription(segmentIndex, segmentFraction, route) {
  const allStops = [
    route.origin,
    ...(route.waypoints || []),
    route.destination
  ];

  if (segmentIndex >= 0 && segmentIndex < allStops.length - 1) {
    const start = allStops[segmentIndex];
    const end = allStops[segmentIndex + 1];

    const startName = start.name || `Stop ${segmentIndex + 1}`;
    const endName = end.name || `Stop ${segmentIndex + 2}`;

    if (segmentFraction < 0.2) {
      return `Near ${startName}`;
    } else if (segmentFraction > 0.8) {
      return `Near ${endName}`;
    } else {
      return `Between ${startName} and ${endName}`;
    }
  }

  return 'Along route';
}
