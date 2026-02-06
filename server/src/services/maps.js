import { Client } from '@googlemaps/google-maps-services-js';

const mapsClient = new Client({});

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
 * Geocode a location to coordinates
 * @param {Object|string} stopInfo - Structured stop info or simple address string
 * @returns {Promise<Object>} - Geocoded location with metadata
 */
export async function geocodeLocation(stopInfo) {
  const query = buildGeocodingQuery(stopInfo);
  const isStructured = typeof stopInfo === 'object';

  console.log(`Geocoding [${isStructured ? stopInfo.type : 'legacy'}]: "${query}"`);

  try {
    const response = await mapsClient.geocode({
      params: {
        address: query,
        key: process.env.GOOGLE_MAPS_API_KEY,
        region: 'us', // Bias towards US results
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
      placeId: result.place_id,
      // Include metadata from structured input
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
 * Get directions for a multi-stop route
 * @param {Array} stops - Array of structured stop objects or location strings
 * @returns {Promise<Object>} - Route data including polyline and directions
 */
export async function getMultiStopRoute(stops) {
  if (stops.length < 2) {
    throw new Error('At least 2 stops are required for a route');
  }

  // Build query strings for directions API
  const getDirectionsQuery = (stopInfo) => {
    if (typeof stopInfo === 'string') return stopInfo;
    return stopInfo.searchQuery || stopInfo.original;
  };

  const origin = getDirectionsQuery(stops[0]);
  const destination = getDirectionsQuery(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(getDirectionsQuery);

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

    // Get directions
    const directionsParams = {
      origin: origin,
      destination: destination,
      key: process.env.GOOGLE_MAPS_API_KEY,
      mode: 'driving'
    };

    if (waypoints.length > 0) {
      directionsParams.waypoints = waypoints.map(wp => ({ location: wp }));
    }

    const response = await mapsClient.directions({
      params: directionsParams
    });

    if (response.data.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = response.data.routes[0];

    // Extract leg information
    const legs = route.legs.map((leg, index) => ({
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

    // Calculate totals
    const totalDistance = legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    const totalDuration = legs.reduce((sum, leg) => sum + leg.duration.value, 0);

    return {
      stops: geocodedStops,
      legs: legs,
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
      },
      // Include warnings for low confidence
      warnings: lowConfidenceStops.length > 0
        ? [`${lowConfidenceStops.length} location(s) had low confidence and may be inaccurate`]
        : []
    };
  } catch (error) {
    console.error('Directions error:', error);
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
