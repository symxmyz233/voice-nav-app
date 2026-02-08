import { Client } from '@googlemaps/google-maps-services-js';
import { generateRoutePoints, distanceToRoute } from '../utils/routeUtils.js';

const mapsClient = new Client({});

/**
 * Search for nearby coffee shops using Google Places API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radius - Search radius in meters (default: 5000)
 * @returns {Promise<Array>} - Array of coffee shop places
 */
export async function findNearbyCoffeeShops(lat, lng, radius = 5000, keyword = 'coffee') {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const apiKeyPreview = apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : 'NOT_SET';

    console.log('=== Coffee Shop Search Debug ===');
    console.log(`Searching for coffee shops near ${lat}, ${lng} within ${radius}m`);
    console.log(`Keyword: ${keyword}`);
    console.log(`API Key (partial): ${apiKeyPreview}`);
    console.log(`Request params:`, {
      location: { lat, lng },
      radius,
      type: 'cafe',
      keyword
    });

    const response = await mapsClient.placesNearby({
      params: {
        location: { lat, lng },
        radius,
        type: 'cafe',
        keyword,
        key: apiKey
      }
    });

    console.log(`Google API Response Status: ${response.data.status}`);
    console.log(`Google API Error Message:`, response.data.error_message || 'None');

    if (response.data.status === 'ZERO_RESULTS') {
      console.log('No coffee shops found');
      return [];
    }

    if (response.data.status !== 'OK') {
      const errorDetails = {
        status: response.data.status,
        errorMessage: response.data.error_message,
        httpStatus: response.status,
        httpStatusText: response.statusText
      };
      console.error('Google Places API Error Details:', errorDetails);
      throw new Error(`Places API error: ${response.data.status} - ${response.data.error_message || 'No error message'}`);
    }

    // Get detailed information for each place
    console.log(`Found ${response.data.results.length} coffee shops, fetching details...`);
    const detailedPlaces = await Promise.all(
      response.data.results.map(place => getPlaceDetails(place.place_id))
    );

    const validPlaces = detailedPlaces.filter(place => place !== null);
    console.log(`Successfully retrieved details for ${validPlaces.length} coffee shops`);
    console.log('=== End Coffee Shop Search Debug ===');

    return validPlaces;
  } catch (error) {
    console.error('=== Coffee Shop Search Error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    // If it's an Axios error, log more details
    if (error.response) {
      console.error('HTTP Response Status:', error.response.status);
      console.error('HTTP Response Data:', error.response.data);
      console.error('HTTP Response Headers:', error.response.headers);
    }

    console.error('=== End Coffee Shop Search Error ===');
    throw error;
  }
}

/**
 * Search for nearby food places (non-coffee fallback).
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radius - Search radius in meters (default: 5000)
 * @returns {Promise<Array>} - Array of food places
 */
export async function findNearbyFoodShops(lat, lng, radius = 5000) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const apiKeyPreview = apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : 'NOT_SET';

    console.log('=== Food Shop Search Debug ===');
    console.log(`Searching for food places near ${lat}, ${lng} within ${radius}m`);
    console.log(`API Key (partial): ${apiKeyPreview}`);
    console.log('Request params:', {
      location: { lat, lng },
      radius,
      type: 'restaurant',
      keyword: 'food'
    });

    const response = await mapsClient.placesNearby({
      params: {
        location: { lat, lng },
        radius,
        type: 'restaurant',
        keyword: 'food',
        key: apiKey
      }
    });

    console.log(`Google API Response Status: ${response.data.status}`);
    console.log('Google API Error Message:', response.data.error_message || 'None');

    if (response.data.status === 'ZERO_RESULTS') {
      console.log('No food places found');
      return [];
    }

    if (response.data.status !== 'OK') {
      const errorDetails = {
        status: response.data.status,
        errorMessage: response.data.error_message,
        httpStatus: response.status,
        httpStatusText: response.statusText
      };
      console.error('Google Places API Error Details:', errorDetails);
      throw new Error(`Places API error: ${response.data.status} - ${response.data.error_message || 'No error message'}`);
    }

    const candidates = response.data.results.slice(0, 6);
    const detailedPlaces = await Promise.all(
      candidates.map(place => getPlaceDetails(place.place_id))
    );

    const validPlaces = detailedPlaces.filter(place => place !== null);
    console.log(`Successfully retrieved details for ${validPlaces.length} food places`);
    console.log('=== End Food Shop Search Debug ===');

    return validPlaces;
  } catch (error) {
    console.error('=== Food Shop Search Error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    if (error.response) {
      console.error('HTTP Response Status:', error.response.status);
      console.error('HTTP Response Data:', error.response.data);
      console.error('HTTP Response Headers:', error.response.headers);
    }

    console.error('=== End Food Shop Search Error ===');
    throw error;
  }
}

/**
 * Get detailed information about a place
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object|null>} - Detailed place information
 */
export async function getPlaceDetails(placeId) {
  try {
    console.log(`Fetching details for place: ${placeId}`);

    const response = await mapsClient.placeDetails({
      params: {
        place_id: placeId,
        fields: [
          'place_id',
          'name',
          'geometry',
          'rating',
          'user_ratings_total',
          'formatted_address',
          'opening_hours',
          'types',
          'website',
          'formatted_phone_number',
          'vicinity',
          'reviews'
        ],
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    console.log(`Place details response status for ${placeId}: ${response.data.status}`);

    if (response.data.status !== 'OK') {
      console.error(`Failed to get details for place ${placeId}: ${response.data.status}`);
      console.error(`Error message: ${response.data.error_message || 'None'}`);
      return null;
    }

    const result = response.data.result;
    return {
      placeId: result.place_id,
      name: result.name,
      location: {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng
      },
      rating: result.rating || 0,
      reviewCount: result.user_ratings_total || 0,
      address: result.formatted_address,
      vicinity: result.vicinity,
      openNow: result.opening_hours?.open_now,
      types: result.types || [],
      website: result.website,
      phone: result.formatted_phone_number,
      reviews: result.reviews || []
    };
  } catch (error) {
    console.error(`Error getting place details for ${placeId}:`, error.message);
    return null;
  }
}

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
 * Find coffee shops along a navigation route
 * @param {Object} route - Route object with origin, destination, and waypoints
 * @param {number} radius - Search radius from route in meters (default: 5000)
 * @returns {Promise<Array>} - Array of coffee shop places with route proximity data
 */
export async function findCoffeeShopsAlongRoute(route, radius = 5000, keyword = 'coffee') {
  try {
    console.log('=== Coffee Shop Search Along Route ===');
    console.log(`Route: ${route.origin.name || 'Origin'} → ${route.destination.name || 'Destination'}`);
    console.log(`Waypoints: ${route.waypoints?.length || 0}`);
    console.log(`Search radius: ${radius}m from route`);
    console.log(`Keyword: ${keyword}`);

    // Generate search points along the route
    // Use larger spacing (50km) to avoid too many API calls
    const searchPoints = generateRoutePoints(route, 50000);
    console.log(`Generated ${searchPoints.length} search points along route`);

    // Search for coffee shops near each point
    const allShops = new Map(); // Use Map to deduplicate by placeId

    for (let i = 0; i < searchPoints.length; i++) {
      const point = searchPoints[i];
      console.log(`Searching near point ${i + 1}/${searchPoints.length}: (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`);

      try {
        const response = await mapsClient.placesNearby({
          params: {
            location: { lat: point.lat, lng: point.lng },
            radius,
            type: 'cafe',
            keyword,
            key: process.env.GOOGLE_MAPS_API_KEY
          }
        });

        if (response.data.status === 'OK' && response.data.results) {
          console.log(`  Found ${response.data.results.length} results at this point`);

          // Add shops to our map (deduplicates automatically)
          response.data.results.forEach(shop => {
            if (!allShops.has(shop.place_id)) {
              allShops.set(shop.place_id, {
                ...shop,
                foundAt: point
              });
            }
          });
        } else if (response.data.status === 'ZERO_RESULTS') {
          console.log('  No results at this point');
        } else {
          console.log(`  API returned status: ${response.data.status}`);
        }
      } catch (error) {
        console.error(`  Error searching at point ${i + 1}:`, error.message);
        // Continue with other points even if one fails
      }
    }

    console.log(`Total unique coffee shops found: ${allShops.size}`);

    if (allShops.size === 0) {
      console.log('=== End Coffee Shop Search (No Results) ===');
      return [];
    }

    // Get detailed information for each unique shop
    console.log('Fetching details for each coffee shop...');
    const detailedPlaces = await Promise.all(
      Array.from(allShops.values()).map(shop => getPlaceDetailsForRoute(shop, route))
    );

    const validPlaces = detailedPlaces.filter(place => place !== null);

    // Filter shops that are actually near the route (within radius)
    const shopsAlongRoute = validPlaces.filter(shop => {
      if (shop.distanceFromRoute <= radius) {
        return true;
      }
      console.log(`  Filtered out: ${shop.name} (${(shop.distanceFromRoute / 1000).toFixed(1)}km from route)`);
      return false;
    });

    console.log(`Coffee shops within ${radius}m of route: ${shopsAlongRoute.length}`);
    console.log('=== End Coffee Shop Search Along Route ===');

    return shopsAlongRoute;
  } catch (error) {
    console.error('=== Coffee Shop Search Along Route Error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    if (error.response) {
      console.error('HTTP Response Status:', error.response.status);
      console.error('HTTP Response Data:', error.response.data);
    }

    console.error('=== End Error ===');
    throw error;
  }
}

/**
 * Get detailed information about a place for route-based search
 * @param {Object} shop - Basic shop info from Places Nearby
 * @param {Object} route - Route object for distance calculation
 * @returns {Promise<Object|null>} - Detailed place information with route proximity
 */
async function getPlaceDetailsForRoute(shop, route) {
  try {
    const placeId = shop.place_id;
    console.log(`Fetching details for place: ${placeId}`);

    const response = await mapsClient.placeDetails({
      params: {
        place_id: placeId,
        fields: [
          'place_id',
          'name',
          'geometry',
          'rating',
          'user_ratings_total',
          'formatted_address',
          'opening_hours',
          'types',
          'website',
          'formatted_phone_number',
          'vicinity',
          'reviews'
        ],
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    console.log(`Place details response status for ${placeId}: ${response.data.status}`);

    if (response.data.status !== 'OK') {
      console.error(`Failed to get details for place ${placeId}: ${response.data.status}`);
      console.error(`Error message: ${response.data.error_message || 'None'}`);
      return null;
    }

    const result = response.data.result;

    // Calculate distance from this shop to the route
    const shopLocation = {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng
    };
    const distanceFromRoute = distanceToRoute(shopLocation, route);

    console.log(`  ${result.name}: ${(distanceFromRoute / 1000).toFixed(1)}km from route`);

    return {
      placeId: result.place_id,
      name: result.name,
      location: shopLocation,
      rating: result.rating || 0,
      reviewCount: result.user_ratings_total || 0,
      address: result.formatted_address,
      vicinity: result.vicinity,
      openNow: result.opening_hours?.open_now,
      types: result.types || [],
      website: result.website,
      phone: result.formatted_phone_number,
      reviews: result.reviews || [],
      distanceFromRoute // Add this for filtering and scoring
    };
  } catch (error) {
    console.error(`Error getting place details for ${shop.place_id}:`, error.message);
    return null;
  }
}
