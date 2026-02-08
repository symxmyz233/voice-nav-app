const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Find and get recommended coffee shops near a location or along a route
 * @param {Object} options - Search options
 * @param {Object} options.location - Search near a specific location (optional)
 * @param {number} options.location.lat - Latitude
 * @param {number} options.location.lng - Longitude
 * @param {Object} options.route - Search along a route (optional)
 * @param {Object} options.route.origin - Route origin {lat, lng, name}
 * @param {Object} options.route.destination - Route destination {lat, lng, name}
 * @param {Array} options.route.waypoints - Route waypoints [{lat, lng, name}]
 * @param {number} options.radius - Search radius in meters (default: 5000)
 * @param {number} options.limit - Maximum number of recommendations (default: 5)
 * @param {string} options.sortBy - Sort criteria (default: 'score')
 * @param {boolean} options.openNowOnly - Only open shops (default: false)
 * @param {number} options.perStopLimit - Max recommendations per stop (default: 5)
 * @param {string} options.keyword - Search keyword override (optional)
 * @returns {Promise<Object>} - Coffee shop recommendations
 */
export async function searchCoffeeShops(options = {}) {
  const {
    location,
    route,
    radius = 5000,
    limit = 5,
    sortBy = 'score',
    openNowOnly = false,
    perStopLimit,
    keyword
  } = options;

  console.log('=== Frontend: Searching Coffee Shops ===');
  console.log('API URL:', `${API_BASE_URL}/find-coffee-shops`);

  // Build request body based on search type
  let requestBody;
  if (route && location) {
    console.log('Search type: Current location + along route');
    console.log('Route:', route);
    console.log('Location:', location);
    requestBody = {
      route,
      lat: location.lat,
      lng: location.lng,
      radius,
      limit,
      sortBy,
      openNowOnly
    };
  } else if (route) {
    console.log('Search type: Along route');
    console.log('Route:', route);
    requestBody = {
      route,
      radius,
      limit,
      sortBy,
      openNowOnly,
      ...(perStopLimit ? { perStopLimit } : {}),
      ...(keyword ? { keyword } : {})
    };
  } else if (location) {
    console.log('Search type: Near location');
    console.log('Location:', location);
    requestBody = {
      lat: location.lat,
      lng: location.lng,
      radius,
      limit,
      sortBy,
      openNowOnly,
      ...(perStopLimit ? { perStopLimit } : {}),
      ...(keyword ? { keyword } : {})
    };
  } else {
    throw new Error('Either location or route must be provided');
  }

  console.log('Request body:', requestBody);

  try {
    const response = await fetch(`${API_BASE_URL}/find-coffee-shops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error response from server:', errorData);
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Success! Received data:', {
      success: data.success,
      searchType: data.searchType,
      recommendationsCount: data.recommendations?.length,
      grouped: data.grouped ? Object.fromEntries(
        Object.entries(data.grouped).map(([key, value]) => [key, value?.length || 0])
      ) : null,
      totalFound: data.totalFound
    });
    console.log('=== End Frontend Search ===');

    return data;
  } catch (error) {
    console.error('=== Frontend: Coffee Shop Search Error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    console.error('=== End Frontend Error ===');
    throw error;
  }
}

/**
 * Calculate distance between two points
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} - Distance in kilometers
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
  return R * c;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Format shop data for display
 * @param {Object} shop - Shop object from API
 * @returns {Object} - Formatted shop object
 */
export function formatShop(shop) {
  return {
    ...shop,
    distanceKm: shop.distanceValue ? (shop.distanceValue / 1000).toFixed(2) : 'N/A',
    ratingPercent: ((shop.rating / 5) * 100).toFixed(0)
  };
}
