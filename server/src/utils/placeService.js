import { Client } from '@googlemaps/google-maps-services-js';

const client = new Client({});

/**
 * Search for nearby places using Google Places API
 * @param {Object} location - { lat: number, lng: number }
 * @param {number} radius - Search radius in meters (default: 5000)
 * @param {string} type - Place type (default: 'cafe')
 * @returns {Promise<Array>} Array of formatted place objects
 */
export async function searchNearbyPlaces(location, radius = 5000, type = 'cafe') {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables');
    }

    const response = await client.placesNearby({
      params: {
        location: location,
        radius: radius,
        type: type,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    if (response.data.status === 'ZERO_RESULTS') {
      return [];
    }

    if (response.data.status !== 'OK') {
      throw new Error(`Places API error: ${response.data.status}`);
    }

    // Format and return results
    return response.data.results.map(place => ({
      place_id: place.place_id,
      name: place.name,
      rating: place.rating || 0,
      user_ratings_total: place.user_ratings_total || 0,
      vicinity: place.vicinity,
      geometry: place.geometry,
      opening_hours: place.opening_hours,
      photos: place.photos,
    }));
  } catch (error) {
    console.error('Error searching places:', error.message);
    throw error;
  }
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {Object} point1 - { lat: number, lng: number }
 * @param {Object} point2 - { lat: number, lng: number }
 * @returns {number} Distance in meters
 */
export function calculateDistance(point1, point2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (point1.lat * Math.PI) / 180;
  const φ2 = (point2.lat * Math.PI) / 180;
  const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
  const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}