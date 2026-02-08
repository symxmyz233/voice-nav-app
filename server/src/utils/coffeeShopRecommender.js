import { calculateDistance } from './placeService.js';

/**
 * Calculate a recommendation score for a coffee shop
 * Score is based on: rating (40%), review count (30%), distance (20%), open now (10%)
 * For route-based searches, prioritizes proximity to route over point distance
 *
 * @param {Object} shop - Coffee shop object with rating, reviewCount, location, openNow
 * @param {number} userLat - User's latitude (or route center)
 * @param {number} userLng - User's longitude (or route center)
 * @param {number} maxDistance - Maximum distance in meters for normalization (default: 5000)
 * @param {boolean} isRouteSearch - Whether this is a route-based search
 * @returns {number} - Recommendation score (0-10)
 */
export function calculateRecommendationScore(shop, userLat, userLng, maxDistance = 5000, isRouteSearch = false) {
  // Rating score (0-10, based on 5-star system)
  const ratingScore = (shop.rating || 0) * 2; // Normalize to 10
  const ratingWeight = 0.4;

  // Review count score (logarithmic scale, max at 1000+ reviews)
  const reviewCountScore = Math.min(10, Math.log10((shop.reviewCount || 1) + 1) * 2);
  const reviewWeight = 0.3;

  // Distance score (inverse: closer = higher score)
  let distanceScore;
  if (isRouteSearch && shop.distanceFromRoute !== undefined) {
    // For route searches, use distance from route (shops closer to route score higher)
    distanceScore = Math.max(0, 10 - (shop.distanceFromRoute / maxDistance) * 10);
  } else {
    // For point searches, use distance from point
    const distance = calculateDistance(userLat, userLng, shop.location.lat, shop.location.lng);
    distanceScore = Math.max(0, 10 - (distance / maxDistance) * 10);
  }
  const distanceWeight = isRouteSearch ? 0.25 : 0.2; // Slightly higher weight for route proximity

  // Open now score
  const openNowScore = shop.openNow ? 10 : 5;
  const openNowWeight = 0.1;

  // Calculate weighted score
  const totalScore =
    ratingScore * ratingWeight +
    reviewCountScore * reviewWeight +
    distanceScore * distanceWeight +
    openNowScore * openNowWeight;

  return Math.round(totalScore * 10) / 10; // Round to 1 decimal place
}

/**
 * Recommend top coffee shops based on multiple factors
 *
 * @param {Array} shops - Array of coffee shop objects
 * @param {number} userLat - User's latitude (or route center for route searches)
 * @param {number} userLng - User's longitude (or route center for route searches)
 * @param {Object} options - Configuration options
 * @param {number} options.limit - Maximum number of recommendations (default: 5)
 * @param {string} options.sortBy - Sort criteria: 'score', 'rating', 'distance', 'reviews' (default: 'score')
 * @param {boolean} options.openNowOnly - Only return open shops (default: false)
 * @param {Object} options.route - Route object for route-based searches (optional)
 * @returns {Array} - Recommended shops with scores, sorted and limited
 */
export function recommendCoffeeShops(
  shops,
  userLat,
  userLng,
  options = {}
) {
  const {
    limit = 5,
    sortBy = 'score',
    openNowOnly = false,
    route = null
  } = options;

  const isRouteSearch = !!route;

  // Filter shops if needed
  let filtered = shops;
  if (openNowOnly) {
    filtered = shops.filter(shop => shop.openNow !== false);
  }

  // Calculate recommendation score for each shop
  const withScores = filtered.map(shop => {
    const distance = calculateDistance(userLat, userLng, shop.location.lat, shop.location.lng);
    const recommendationScore = calculateRecommendationScore(shop, userLat, userLng, 5000, isRouteSearch);

    return {
      ...shop,
      distance,
      recommendationScore,
      // Include route-specific info if available
      ...(isRouteSearch && shop.distanceFromRoute !== undefined && {
        routeProximityInfo: {
          distanceFromRoute: shop.distanceFromRoute,
          distanceFromRouteKm: (shop.distanceFromRoute / 1000).toFixed(1)
        }
      })
    };
  });

  // Sort based on criteria
  let sorted;
  switch (sortBy) {
    case 'rating':
      sorted = withScores.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'distance':
      sorted = withScores.sort((a, b) => {
        const distA = isRouteSearch && a.distanceFromRoute !== undefined
          ? a.distanceFromRoute
          : (a.distance ?? Number.POSITIVE_INFINITY);
        const distB = isRouteSearch && b.distanceFromRoute !== undefined
          ? b.distanceFromRoute
          : (b.distance ?? Number.POSITIVE_INFINITY);
        if (distA !== distB) return distA - distB;
        return (b.rating || 0) - (a.rating || 0);
      });
      break;
    case 'reviews':
      sorted = withScores.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
      break;
    case 'score':
    default:
      sorted = withScores.sort((a, b) => b.recommendationScore - a.recommendationScore);
      break;
  }

  // Return limited results
  return sorted.slice(0, limit);
}

/**
 * Format a coffee shop recommendation for display
 *
 * @param {Object} shop - Coffee shop object with all details
 * @returns {Object} - Formatted shop object
 */
export function formatShopForDisplay(shop) {
  const distanceValue = shop.distanceFromRoute !== undefined ? shop.distanceFromRoute : shop.distance;
  const hasDistanceValue = distanceValue !== undefined && distanceValue !== null;
  const formatted = {
    placeId: shop.placeId,
    name: shop.name,
    location: shop.location,
    rating: shop.rating,
    reviewCount: shop.reviewCount,
    distance: hasDistanceValue ? `${Math.round(distanceValue / 100) / 10}km` : 'N/A',
    distanceValue,
    address: shop.address,
    vicinity: shop.vicinity,
    openNow: shop.openNow,
    types: shop.types,
    website: shop.website,
    phone: shop.phone,
    recommendationScore: shop.recommendationScore,
    scoreBreakdown: getScoreBreakdown(shop)
  };

  // Add route-specific info if available
  if (shop.routeProximityInfo) {
    formatted.routeProximityInfo = shop.routeProximityInfo;
    formatted.distanceFromRoute = `${shop.routeProximityInfo.distanceFromRouteKm}km from route`;
  }

  return formatted;
}

/**
 * Get detailed score breakdown for a shop
 *
 * @param {Object} shop - Coffee shop object
 * @returns {Object} - Score breakdown details
 */
function getScoreBreakdown(shop) {
  const ratingScore = (shop.rating || 0) * 2;
  const reviewCountScore = Math.min(10, Math.log10((shop.reviewCount || 1) + 1) * 2);

  // Use route distance if available, otherwise use point distance
  let distanceScore;
  if (shop.distanceFromRoute !== undefined) {
    distanceScore = Math.max(0, 10 - (shop.distanceFromRoute / 5000) * 10);
  } else {
    distanceScore = Math.max(0, 10 - (shop.distance / 5000) * 10);
  }

  const openNowScore = shop.openNow ? 10 : 5;

  return {
    rating: Math.round(ratingScore * 10) / 10,
    reviews: Math.round(reviewCountScore * 10) / 10,
    distance: Math.round(distanceScore * 10) / 10,
    openNow: Math.round(openNowScore * 10) / 10
  };
}
