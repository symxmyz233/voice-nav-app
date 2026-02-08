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
  // For landmarks, check both landmark and businessName fields
  if (type === 'landmark') {
    if (parsed?.businessName) {
      // For businesses, include location context
      const parts = [parsed.businessName];
      if (parsed.city) parts.push(parsed.city);
      if (parsed.state) parts.push(parsed.state);
      return parts.join(' ');
    }
    if (parsed?.landmark) {
      return parsed.landmark;
    }
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

  console.log('\n=== 🏠 ADDRESS VALIDATION API CALL ===');
  console.log('Query:', query);

  const requestBody = {
    address: {
      regionCode: 'US',
      addressLines: [query]
    }
  };

  const response = await fetch(
    `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.log(`❌ Address Validation API error (${response.status}): ${errorText}`);
    console.log('=== END ADDRESS VALIDATION API ===\n');
    return null;
  }

  const data = await response.json();
  const result = data.result;

  if (!result?.geocode?.location) {
    console.log(`⚠️ Address Validation returned no geocode for: "${query}"`);
    console.log('=== END ADDRESS VALIDATION API ===\n');
    return null;
  }

  const verdict = result.verdict || {};

  console.log('\n📊 Address Validation Result:');
  console.log(`  Formatted Address: ${result.address?.formattedAddress}`);
  console.log(`  Location: ${result.geocode.location.latitude}, ${result.geocode.location.longitude}`);
  console.log(`  Place ID: ${result.geocode.placeId}`);
  console.log('\n  Verdict:');
  console.log(`    Address Complete: ${verdict.addressComplete ?? 'unknown'}`);
  console.log(`    Has Unconfirmed Components: ${verdict.hasUnconfirmedComponents ?? false}`);
  console.log(`    Granularity: ${verdict.granularity ?? 'unknown'}`);

  if (verdict.hasUnconfirmedComponents) {
    console.log(`  ⚠️ Address has unconfirmed components`);
  }
  if (!verdict.addressComplete) {
    console.log(`  ⚠️ Address is incomplete`);
  }

  console.log('✅ Address Validation succeeded');
  console.log('=== END ADDRESS VALIDATION API ===\n');

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
 * Search for a place using Places API Text Search
 * Best for businesses, landmarks, and points of interest
 * @param {string} query - Place name or business name
 * @param {Object} options - Optional search options
 * @param {Object} options.locationBias - Optional location to bias results towards
 * @returns {Promise<Object>} - Place location with metadata
 */
async function findPlaceByTextSearch(query, options = {}) {
  const params = {
    query: query,
    key: process.env.GOOGLE_MAPS_API_KEY,
    fields: 'name,formatted_address,geometry,place_id,rating,types'
  };

  // Add location bias if provided
  if (options.locationBias) {
    params.location = `${options.locationBias.lat},${options.locationBias.lng}`;
    params.radius = 50000; // 50km radius
  }

  console.log('\n=== 📍 PLACES API CALL ===');
  console.log('Query:', query);
  console.log('Params:', JSON.stringify(params, null, 2));

  const response = await mapsClient.findPlaceFromText({ params });

  console.log(`\n📊 Places API Response: Found ${response.data.candidates?.length || 0} candidates`);

  if (!response.data.candidates || response.data.candidates.length === 0) {
    console.log('❌ No places found');
    console.log('=== END PLACES API ===\n');
    throw new Error(`Could not find place: ${query}`);
  }

  // Log all candidates
  response.data.candidates.forEach((place, idx) => {
    console.log(`\n  Candidate ${idx + 1}:`);
    console.log(`    Name: ${place.name}`);
    console.log(`    Address: ${place.formatted_address}`);
    console.log(`    Location: ${place.geometry.location.lat}, ${place.geometry.location.lng}`);
    console.log(`    Place ID: ${place.place_id}`);
    console.log(`    Rating: ${place.rating || 'N/A'}`);
    console.log(`    Types: ${place.types?.join(', ') || 'N/A'}`);
  });

  const place = response.data.candidates[0];
  console.log(`\n✅ Using top candidate: ${place.name} - ${place.formatted_address}`);
  console.log('=== END PLACES API ===\n');

  return {
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    formattedAddress: place.formatted_address,
    placeId: place.place_id,
    name: place.name,
    rating: place.rating,
    types: place.types,
    source: 'Places API'
  };
}

/**
 * Geocode a location using the legacy Geocoding API (fallback).
 * @param {string} query - Address or landmark string
 * @param {Object} options - Optional geocoding options
 * @param {Object} options.locationBias - Optional location to bias results towards
 * @param {string} options.components - Optional component filters (e.g., "locality:Edison|administrative_area:NJ")
 * @returns {Promise<Object>} - Geocoded location
 */
async function geocodeFallback(query, options = {}) {
  const params = {
    address: query,
    key: process.env.GOOGLE_MAPS_API_KEY,
    region: 'us',
    language: 'en'
  };

  // Add location bias if provided (prioritize results near this location)
  if (options.locationBias) {
    params.bounds = `${options.locationBias.lat - 0.5},${options.locationBias.lng - 0.5}|${options.locationBias.lat + 0.5},${options.locationBias.lng + 0.5}`;
    console.log(`Adding location bias: ${options.locationBias.lat}, ${options.locationBias.lng}`);
  }

  // Add component filters if provided (e.g., restrict to specific city/state)
  if (options.components) {
    params.components = options.components;
    console.log(`Adding component filter: ${options.components}`);
  }

  console.log('\n=== 🌍 GEOCODING API CALL ===');
  console.log('Query:', query);
  console.log('Params:', JSON.stringify(params, null, 2));

  const response = await mapsClient.geocode({ params });

  console.log(`\n📊 Geocoding API Response: Found ${response.data.results.length} results`);

  if (response.data.results.length === 0) {
    console.log('❌ No results found');
    throw new Error(`Could not geocode location: ${query}`);
  }

  // Log all results
  response.data.results.forEach((r, idx) => {
    console.log(`\n  Result ${idx + 1}:`);
    console.log(`    Address: ${r.formatted_address}`);
    console.log(`    Location: ${r.geometry.location.lat}, ${r.geometry.location.lng}`);
    console.log(`    Place ID: ${r.place_id}`);
    console.log(`    Types: ${r.types?.join(', ')}`);
    console.log(`    Location Type: ${r.geometry.location_type}`);
  });

  const result = response.data.results[0];
  console.log(`\n✅ Using top result: ${result.formatted_address}`);
  console.log('=== END GEOCODING API ===\n');

  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
    placeId: result.place_id,
    allResults: response.data.results.slice(0, 3).map(r => ({
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formattedAddress: r.formatted_address,
      placeId: r.place_id
    }))
  };
}

/**
 * Determine which geocoding strategy to use based on stop type
 */
function determineGeocodingStrategy(stopInfo) {
  if (typeof stopInfo !== 'object') {
    return 'hybrid'; // Unknown type, try both
  }

  const { type, parsed } = stopInfo;

  // If it's a landmark or has a business name, prefer Places API
  if (type === 'landmark' || parsed?.landmark || parsed?.businessName) {
    console.log(`📍 Detected landmark/business - will use Places API`);
    return 'places_primary';
  }

  // If it's a full address, use address validation + geocoding
  if (type === 'full_address') {
    console.log(`🏠 Detected full address - will use Address Validation + Geocoding`);
    return 'address';
  }

  // For partial or relative addresses, try hybrid approach
  console.log(`🔍 Detected ${type} - will use hybrid approach`);
  return 'hybrid';
}

/**
 * Geocode a location to coordinates.
 * Intelligently chooses between Places API, Address Validation API, and Geocoding API
 * based on the type of location.
 * @param {Object|string} stopInfo - Structured stop info or simple address string
 * @param {Object} context - Optional context for location bias
 * @param {Object} context.nearLocation - Location to bias results towards
 * @returns {Promise<Object>} - Geocoded location with metadata, may include alternativeResults
 */
export async function geocodeLocation(stopInfo, context = {}) {
  const query = buildGeocodingQuery(stopInfo);
  const isStructured = typeof stopInfo === 'object';

  console.log('\n========== GEOCODING REQUEST ==========');
  console.log(`🔍 Query: "${query}"`);
  console.log(`📦 Type: ${isStructured ? stopInfo.type : 'legacy'}`);
  if (isStructured) {
    console.log(`📝 Original: "${stopInfo.original}"`);
    console.log(`🏢 BusinessName: ${stopInfo.parsed?.businessName || 'N/A'}`);
    console.log(`🏛️  Landmark: ${stopInfo.parsed?.landmark || 'N/A'}`);
  }

  // Prepare geocoding options with location bias
  const geocodingOptions = {};
  if (context.nearLocation) {
    geocodingOptions.locationBias = context.nearLocation;
    console.log(`📍 Location Bias: ${context.nearLocation.lat}, ${context.nearLocation.lng}`);
  } else {
    console.log('📍 Location Bias: None');
  }
  console.log('=======================================');

  // Determine which APIs to use based on stop type
  const strategy = determineGeocodingStrategy(stopInfo);

  try {
    // Strategy 1: Places API primary (for landmarks/businesses)
    if (strategy === 'places_primary') {
      const [placesResult, geocodingResult] = await Promise.allSettled([
        findPlaceByTextSearch(query, geocodingOptions),
        geocodeFallback(query, geocodingOptions)
      ]);

      const places = placesResult.status === 'fulfilled' ? placesResult.value : null;
      const geocoded = geocodingResult.status === 'fulfilled' ? geocodingResult.value : null;

      // If Places API found it, use that result (but offer geocoding as alternative if different)
      if (places) {
        console.log(`✅ Places API found: ${places.name} at ${places.formattedAddress}`);

        // Check if geocoding also succeeded and differs
        if (geocoded) {
          const distance = calculateDistance(places.lat, places.lng, geocoded.lat, geocoded.lng);

          if (distance > 1) {
            console.log(`⚠️ Places and Geocoding differ by ${distance.toFixed(2)}km - offering both`);
            return {
              ...places,
              ...(isStructured && {
                type: stopInfo.type,
                confidence: stopInfo.confidence,
                original: stopInfo.original
              }),
              hasAlternatives: true,
              alternativeResults: [
                {
                  source: 'Places API (Business/Landmark)',
                  lat: places.lat,
                  lng: places.lng,
                  formattedAddress: places.formattedAddress,
                  placeId: places.placeId,
                  name: places.name
                },
                {
                  source: 'Geocoding API (Address)',
                  lat: geocoded.lat,
                  lng: geocoded.lng,
                  formattedAddress: geocoded.formattedAddress,
                  placeId: geocoded.placeId
                }
              ]
            };
          }
        }

        const finalResult = {
          ...places,
          ...(isStructured && {
            type: stopInfo.type,
            confidence: stopInfo.confidence,
            original: stopInfo.original
          })
        };
        console.log('\n✅ GEOCODING FINAL RESULT:');
        console.log(`   Name: ${finalResult.name}`);
        console.log(`   Address: ${finalResult.formattedAddress}`);
        console.log(`   Coordinates: ${finalResult.lat}, ${finalResult.lng}`);
        console.log(`   Source: ${finalResult.source}\n`);
        return finalResult;
      }

      // Places API failed, fall back to geocoding
      if (geocoded) {
        console.log(`Places API failed, using Geocoding API`);
        return {
          ...geocoded,
          ...(isStructured && {
            type: stopInfo.type,
            confidence: stopInfo.confidence,
            original: stopInfo.original
          })
        };
      }

      throw new Error(`Both Places and Geocoding APIs failed for: "${query}"`);
    }

    // Strategy 2: Address-focused (Address Validation + Geocoding)
    // Strategy 3: Hybrid (try all)
    const [validationResult, geocodingResult] = await Promise.allSettled([
      validateAddress(query),
      geocodeFallback(query, geocodingOptions)
    ]);

    const validated = validationResult.status === 'fulfilled' ? validationResult.value : null;
    const geocoded = geocodingResult.status === 'fulfilled' ? geocodingResult.value : null;

    // Validate distance from expected location if context provided
    const validateDistance = (result, label) => {
      if (context.nearLocation) {
        const distance = calculateDistance(
          result.lat, result.lng,
          context.nearLocation.lat, context.nearLocation.lng
        );
        if (distance > 50) { // More than 50km away
          console.warn(`⚠️ ${label} is ${distance.toFixed(2)}km from expected location - may be incorrect`);
          result.distanceWarning = {
            distance: distance,
            expectedLocation: context.nearLocation
          };
        }
      }
    };

    // If both succeeded, check if they give different locations
    if (validated && geocoded) {
      // Validate both results against expected location
      validateDistance(validated, 'Address Validation result');
      validateDistance(geocoded, 'Geocoding result');

      const distance = calculateDistance(
        validated.lat, validated.lng,
        geocoded.lat, geocoded.lng
      );

      console.log(`Both APIs succeeded. Distance between results: ${distance.toFixed(2)}km`);

      // If results differ significantly (> 1km), return both options plus any additional results
      if (distance > 1) {
        console.log(`⚠️ Results differ significantly - providing multiple options to user`);

        const alternatives = [
          {
            source: 'Address Validation API',
            lat: validated.lat,
            lng: validated.lng,
            formattedAddress: validated.formattedAddress,
            placeId: validated.placeId,
            distanceWarning: validated.distanceWarning
          },
          {
            source: 'Geocoding API (Best Match)',
            lat: geocoded.lat,
            lng: geocoded.lng,
            formattedAddress: geocoded.formattedAddress,
            placeId: geocoded.placeId,
            distanceWarning: geocoded.distanceWarning
          }
        ];

        // Add additional results from Geocoding API if available
        if (geocoded.allResults && geocoded.allResults.length > 1) {
          geocoded.allResults.slice(1, 3).forEach((result, idx) => {
            alternatives.push({
              source: `Geocoding API (Alternative ${idx + 1})`,
              lat: result.lat,
              lng: result.lng,
              formattedAddress: result.formattedAddress,
              placeId: result.placeId
            });
          });
        }

        return {
          ...validated,
          ...(isStructured && {
            type: stopInfo.type,
            confidence: stopInfo.confidence,
            original: stopInfo.original
          }),
          hasAlternatives: true,
          alternativeResults: alternatives
        };
      }

      // Results are similar, use Address Validation (more accurate)
      console.log(`Results are similar - using Address Validation API`);
      return {
        ...validated,
        ...(isStructured && {
          type: stopInfo.type,
          confidence: stopInfo.confidence,
          original: stopInfo.original
        })
      };
    }

    // Only one API succeeded
    if (validated) {
      console.log(`Only Address Validation succeeded for: "${query}"`);
      return {
        ...validated,
        ...(isStructured && {
          type: stopInfo.type,
          confidence: stopInfo.confidence,
          original: stopInfo.original
        })
      };
    }

    if (geocoded) {
      console.log(`Only Geocoding API succeeded for: "${query}"`);
      return {
        ...geocoded,
        ...(isStructured && {
          type: stopInfo.type,
          confidence: stopInfo.confidence,
          original: stopInfo.original
        })
      };
    }

    // Both failed
    throw new Error(`Both geocoding APIs failed for: "${query}"`);
  } catch (error) {
    console.error('Geocoding error for query:', query, error);
    throw error;
  }
}

/**
 * Calculate distance between two coordinates in kilometers using Haversine formula
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
export async function getMultiStopRoute(stops, routeContext = null) {
  if (stops.length < 2) {
    throw new Error('At least 2 stops are required for a route');
  }

  const routingApi = getRoutingApi();
  console.log(`Using routing API: ${routingApi}`);

  try {
    // Geocode stops that don't already have coordinates
    // Use previous stop's location as bias for better accuracy
    const geocodedStops = [];
    let previousLocation = null;

    for (const stop of stops) {
      // If stop already has lat/lng (from existing route), use it as-is
      if (typeof stop === 'object' && stop.lat !== undefined && stop.lng !== undefined) {
        console.log(`Using existing geocoded location for: "${stop.name || stop.original}"`);
        geocodedStops.push(stop);
        previousLocation = { lat: stop.lat, lng: stop.lng };
        continue;
      }

      // Build geocoding context with location bias
      let context = {};

      // Priority 1: Use route context (for add_stop commands - most specific)
      if (routeContext?.routeMidpoint) {
        context.nearLocation = routeContext.routeMidpoint;
        console.log(`Using route midpoint as location bias: ${context.nearLocation.lat}, ${context.nearLocation.lng}`);
      }
      // Priority 2: Use user's current location (from browser geolocation)
      else if (routeContext?.userLocation) {
        context.nearLocation = routeContext.userLocation;
        console.log(`Using user location as location bias: ${context.nearLocation.lat}, ${context.nearLocation.lng}`);
      }
      // Priority 3: Use previous stop location
      else if (previousLocation) {
        context.nearLocation = previousLocation;
        console.log(`Using previous stop as location bias: ${context.nearLocation.lat}, ${context.nearLocation.lng}`);
      }
      // Priority 4: No bias
      else {
        console.log('No location bias available for first stop');
      }

      const result = await geocodeLocation(stop, context);

      const geocodedStop = {
        name: typeof stop === 'string' ? stop : (stop.original || stop.searchQuery),
        ...result
      };

      // Check for duplicate coordinates (debugging)
      const duplicateCoords = geocodedStops.find(s =>
        Math.abs(s.lat - result.lat) < 0.0001 && Math.abs(s.lng - result.lng) < 0.0001
      );
      if (duplicateCoords) {
        console.warn(`⚠️ WARNING: New stop "${geocodedStop.name}" has same coordinates as existing stop "${duplicateCoords.name}"`);
        console.warn(`   New: ${result.lat}, ${result.lng}`);
        console.warn(`   Existing: ${duplicateCoords.lat}, ${duplicateCoords.lng}`);
        console.warn(`   This might indicate a geocoding issue!`);
      }

      geocodedStops.push(geocodedStop);
      previousLocation = { lat: result.lat, lng: result.lng };
    }

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
