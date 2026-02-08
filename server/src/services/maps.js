import { Client } from '@googlemaps/google-maps-services-js';

const mapsClient = new Client({});

/**
 * Get the configured routing API ("directions" or "routes")
 */
function getRoutingApi() {
  const api = (process.env.MAPS_ROUTING_API || 'directions').toLowerCase();
  if (api !== 'directions' && api !== 'routes') {
    console.warn(`Unknown MAPS_ROUTING_API value "${api}", falling back to "directions"`);
    return 'directions';
  }
  return api;
}

/**
 * Build the best geocoding query from structured stop info
 * @param {Object} stopInfo - Structured stop info from Gemini
 * @returns {string} - Optimized query string for geocoding
 */
function buildGeocodingQuery(stopInfo) {
  // If it's a simple string (legacy format), return as-is
  if (typeof stopInfo === 'string') {
    return stopInfo;
  }

  const { type, parsed, searchQuery, original } = stopInfo;

  // Use Gemini's optimized searchQuery if available
  if (searchQuery) {
    return searchQuery;
  }

  // Build query based on address type
  if (type === 'landmark' && parsed?.landmark) {
    return parsed.landmark;
  }

  if (type === 'full_address' && parsed) {
    // Build structured query from components
    const components = [
      parsed.streetNumber,
      parsed.streetName,
      parsed.city,
      parsed.state,
      parsed.country
    ].filter(Boolean);

    if (components.length > 0) {
      return components.join(', ');
    }
  }

  if (parsed?.businessName) {
    const parts = [parsed.businessName];
    if (parsed.city) parts.push(parsed.city);
    if (parsed.state) parts.push(parsed.state);
    return parts.join(', ');
  }

  // Fallback to original
  return original || String(stopInfo);
}

/**
 * Validate and geocode an address using Google's Address Validation API.
 * Falls back to Geocoding API for landmarks or when validation fails.
 * @param {string} query - Address string to validate
 * @returns {Promise<Object|null>} - Validated location or null if validation can't handle it
 */
async function validateAddress(query) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const response = await fetch(
    `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: {
          regionCode: 'US',
          addressLines: [query]
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Address Validation API error (${response.status}): ${errorText}`);
    return null;
  }

  const data = await response.json();
  const result = data.result;

  if (!result?.geocode?.location) {
    console.warn(`Address Validation returned no geocode for: "${query}"`);
    return null;
  }

  const verdict = result.verdict || {};

  if (verdict.hasUnconfirmedComponents) {
    console.warn(`Address has unconfirmed components: "${query}"`);
  }
  if (!verdict.addressComplete) {
    console.warn(`Address is incomplete: "${query}"`);
  }

  console.log(`Address Validation verdict for "${query}":`, JSON.stringify(verdict));

  return {
    lat: result.geocode.location.latitude,
    lng: result.geocode.location.longitude,
    formattedAddress: result.address?.formattedAddress || query,
    placeId: result.geocode.placeId || null,
    validationVerdict: {
      addressComplete: verdict.addressComplete ?? null,
      hasUnconfirmedComponents: verdict.hasUnconfirmedComponents ?? false
    }
  };
}

/**
 * Geocode a location using the legacy Geocoding API (fallback).
 * @param {string} query - Address or landmark string
 * @returns {Promise<Object>} - Geocoded location
 */
async function geocodeFallback(query) {
  const response = await mapsClient.geocode({
    params: {
      address: query,
      key: process.env.GOOGLE_MAPS_API_KEY,
      region: 'us',
      language: 'en'
    }
  });

  if (response.data.results.length === 0) {
    throw new Error(`Could not geocode location: ${query}`);
  }

  const result = response.data.results[0];

  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
    placeId: result.place_id
  };
}

/**
 * Geocode a location to coordinates.
 * Uses Address Validation API for best results, falls back to Geocoding API
 * for landmarks or when validation can't produce a result.
 * @param {Object|string} stopInfo - Structured stop info or simple address string
 * @returns {Promise<Object>} - Geocoded location with metadata
 */
export async function geocodeLocation(stopInfo) {
  const query = buildGeocodingQuery(stopInfo);
  const isStructured = typeof stopInfo === 'object';

  console.log(`Geocoding [${isStructured ? stopInfo.type : 'legacy'}]: "${query}"`);

  try {
    // Try Address Validation API first
    const validated = await validateAddress(query);

    if (validated) {
      console.log(`Address Validation succeeded for: "${query}"`);
      return {
        ...validated,
        ...(isStructured && {
          type: stopInfo.type,
          confidence: stopInfo.confidence,
          original: stopInfo.original
        })
      };
    }

    // Fall back to Geocoding API (landmarks, partial addresses, etc.)
    console.log(`Falling back to Geocoding API for: "${query}"`);
    const geocoded = await geocodeFallback(query);

    return {
      ...geocoded,
      ...(isStructured && {
        type: stopInfo.type,
        confidence: stopInfo.confidence,
        original: stopInfo.original
      })
    };
  } catch (error) {
    console.error('Geocoding error for query:', query, error);
    throw error;
  }
}

/**
 * Get route via the legacy Directions API
 */
async function getRouteViaDirectionsApi(origin, destination, waypoints) {
  const directionsParams = {
    origin,
    destination,
    key: process.env.GOOGLE_MAPS_API_KEY,
    mode: 'driving'
  };

  if (waypoints.length > 0) {
    directionsParams.waypoints = waypoints;
  }

  console.log('Directions API params:', JSON.stringify(directionsParams, null, 2));

  const response = await mapsClient.directions({
    params: directionsParams
  });

  if (response.data.routes.length === 0) {
    throw new Error('No route found');
  }

  return response.data;
}

/**
 * Normalize a Directions API response into our standard shape
 */
function normalizeDirectionsResponse(data) {
  const route = data.routes[0];

  const legs = route.legs.map((leg) => ({
    startAddress: leg.start_address,
    endAddress: leg.end_address,
    distance: leg.distance,
    duration: leg.duration,
    steps: leg.steps.map(step => ({
      instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
      distance: step.distance,
      duration: step.duration
    }))
  }));

  const totalDistance = legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const totalDuration = legs.reduce((sum, leg) => sum + leg.duration.value, 0);

  return {
    legs,
    overview_polyline: route.overview_polyline.points,
    bounds: route.bounds,
    totals: {
      distance: {
        value: totalDistance,
        text: `${(totalDistance / 1609.34).toFixed(1)} mi`
      },
      duration: {
        value: totalDuration,
        text: formatDuration(totalDuration)
      }
    }
  };
}

/**
 * Get route via the newer Routes API (routes.googleapis.com)
 * Uses already-geocoded lat/lng so no double-geocoding occurs.
 */
async function getRouteViaRoutesApi(geocodedStops) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const toWaypoint = (stop) => ({
    location: {
      latLng: { latitude: stop.lat, longitude: stop.lng }
    }
  });

  const body = {
    origin: toWaypoint(geocodedStops[0]),
    destination: toWaypoint(geocodedStops[geocodedStops.length - 1]),
    travelMode: 'DRIVE',
    languageCode: 'en-US',
    units: 'IMPERIAL'
  };

  if (geocodedStops.length > 2) {
    body.intermediates = geocodedStops.slice(1, -1).map(toWaypoint);
  }

  console.log('Routes API request body:', JSON.stringify(body, null, 2));

  const fieldMask = [
    'routes.legs.duration',
    'routes.legs.distanceMeters',
    'routes.legs.startLocation',
    'routes.legs.endLocation',
    'routes.legs.steps.navigationInstruction',
    'routes.legs.steps.distanceMeters',
    'routes.legs.steps.staticDuration',
    'routes.legs.localizedValues',
    'routes.polyline',
    'routes.viewport',
    'routes.distanceMeters',
    'routes.duration',
    'routes.localizedValues'
  ].join(',');

  const response = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Routes API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    throw new Error('No route found from Routes API');
  }

  return data;
}

/**
 * Parse a Routes API duration string like "300s" into seconds
 */
function parseDurationString(durationStr) {
  if (!durationStr) return 0;
  const match = String(durationStr).match(/^(\d+)s$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Normalize a Routes API response into our standard shape
 */
function normalizeRoutesResponse(data, geocodedStops) {
  const route = data.routes[0];

  const legs = route.legs.map((leg, index) => {
    const distanceMeters = leg.distanceMeters || 0;
    const durationSeconds = parseDurationString(leg.duration);

    // Use localizedValues if available, otherwise compute fallbacks
    const legLocalized = leg.localizedValues || {};
    const distanceText = legLocalized.distance?.text || `${(distanceMeters / 1609.34).toFixed(1)} mi`;
    const durationText = legLocalized.duration?.text || formatDuration(durationSeconds);

    const steps = (leg.steps || []).map(step => {
      const stepDistMeters = step.distanceMeters || 0;
      const stepDurSeconds = parseDurationString(step.staticDuration);

      return {
        instruction: step.navigationInstruction?.instructions || '',
        distance: {
          value: stepDistMeters,
          text: `${(stepDistMeters / 1609.34).toFixed(1)} mi`
        },
        duration: {
          value: stepDurSeconds,
          text: formatDuration(stepDurSeconds)
        }
      };
    });

    return {
      startAddress: geocodedStops[index]?.formattedAddress || '',
      endAddress: geocodedStops[index + 1]?.formattedAddress || '',
      distance: {
        value: distanceMeters,
        text: distanceText
      },
      duration: {
        value: durationSeconds,
        text: durationText
      },
      steps
    };
  });

  // Polyline
  const overview_polyline = route.polyline?.encodedPolyline || '';

  // Bounds: Routes API uses viewport.low / viewport.high
  let bounds = {};
  if (route.viewport) {
    bounds = {
      southwest: {
        lat: route.viewport.low?.latitude,
        lng: route.viewport.low?.longitude
      },
      northeast: {
        lat: route.viewport.high?.latitude,
        lng: route.viewport.high?.longitude
      }
    };
  }

  const totalDistance = legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const totalDuration = legs.reduce((sum, leg) => sum + leg.duration.value, 0);

  // Use route-level localizedValues if available
  const routeLocalized = route.localizedValues || {};
  const totalDistanceText = routeLocalized.distance?.text || `${(totalDistance / 1609.34).toFixed(1)} mi`;
  const totalDurationText = routeLocalized.duration?.text || formatDuration(totalDuration);

  return {
    legs,
    overview_polyline,
    bounds,
    totals: {
      distance: {
        value: totalDistance,
        text: totalDistanceText
      },
      duration: {
        value: totalDuration,
        text: totalDurationText
      }
    }
  };
}

/**
 * Get directions for a multi-stop route
 * @param {Array} stops - Array of structured stop objects or location strings
 * @returns {Promise<Object>} - Route data including polyline and directions
 */
export async function getMultiStopRoute(stops) {
  if (stops.length < 2) {
    throw new Error('At least 2 stops are required for a route');
  }

  const routingApi = getRoutingApi();
  console.log(`Using routing API: ${routingApi}`);

  try {
    // Geocode all stops first (for markers and metadata)
    const geocodedStops = await Promise.all(
      stops.map(async (stop) => {
        const result = await geocodeLocation(stop);
        return {
          name: typeof stop === 'string' ? stop : (stop.original || stop.searchQuery),
          ...result
        };
      })
    );

    // Check for low confidence stops
    const lowConfidenceStops = geocodedStops.filter(
      stop => stop.confidence && stop.confidence < 0.7
    );
    if (lowConfidenceStops.length > 0) {
      console.warn('Low confidence locations:', lowConfidenceStops.map(s => s.original));
    }

    // Get route data based on configured API
    let normalized;

    if (routingApi === 'routes') {
      const data = await getRouteViaRoutesApi(geocodedStops);
      normalized = normalizeRoutesResponse(data, geocodedStops);
    } else {
      const getDirectionsQuery = (stopInfo) => {
        if (typeof stopInfo === 'string') return stopInfo;
        return stopInfo.searchQuery || stopInfo.original;
      };
      const origin = getDirectionsQuery(stops[0]);
      const destination = getDirectionsQuery(stops[stops.length - 1]);
      const waypoints = stops.slice(1, -1).map(getDirectionsQuery);
      const data = await getRouteViaDirectionsApi(origin, destination, waypoints);
      normalized = normalizeDirectionsResponse(data);
    }

    return {
      stops: geocodedStops,
      ...normalized,
      // Include warnings for low confidence
      warnings: lowConfidenceStops.length > 0
        ? [`${lowConfidenceStops.length} location(s) had low confidence and may be inaccurate`]
        : []
    };
  } catch (error) {
    console.error('Routing error:', error);
    throw error;
  }
}

/**
 * Format duration in seconds to human readable string
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return `${minutes} min`;
}
