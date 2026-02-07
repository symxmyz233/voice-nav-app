# Coffee Shops Along Route Feature

## Overview

The coffee shop search feature has been enhanced to find coffee shops **along your navigation route** instead of just near the map center.

### What Changed

**Before:** Clicking "Coffee Shops" searched near the current map view center.

**After:**
- **With a route:** Searches along the entire route path from origin to destination
- **Without a route:** Falls back to searching near map center (backwards compatible)

---

## How It Works

### Algorithm

1. **Route Analysis:**
   - Takes your origin, destination, and any waypoints
   - Generates search points every ~50km along the route
   - Searches for coffee shops within 5km of each point

2. **Deduplication:**
   - Removes duplicate shops found at multiple search points
   - Ensures each shop appears only once in results

3. **Route Proximity Filtering:**
   - Calculates distance from each shop to the actual route path
   - Only includes shops within 5km of the route
   - Filters out shops that appear near search points but far from the actual route

4. **Smart Scoring:**
   - **Rating (40%):** Higher rated shops score better
   - **Reviews (30%):** More reviews = more reliable
   - **Route Proximity (25%):** Closer to route = higher score
   - **Open Now (10%):** Open shops get bonus points

---

## Files Modified

### Frontend

1. **`client/src/components/MapDisplay.jsx`**
   - Detects if a route exists when "Coffee Shops" button is clicked
   - Passes route information (origin, destination, waypoints) instead of just map center
   - Fallback to map center if no route

2. **`client/src/services/coffeeShopService.js`**
   - Updated API to accept either `location` OR `route` parameters
   - Handles both search modes transparently

### Backend

3. **`server/src/routes/navigation.js`**
   - Endpoint now accepts route-based OR location-based requests
   - Routes to appropriate search function based on request type
   - Enhanced response with search type metadata

4. **`server/src/services/placeService.js`**
   - New function: `findCoffeeShopsAlongRoute(route, radius)`
   - Searches at multiple points along route
   - Filters results by actual route proximity
   - Includes `distanceFromRoute` in shop data

5. **`server/src/utils/routeUtils.js`** (NEW FILE)
   - `generateRoutePoints()`: Creates search points along route
   - `distanceToRoute()`: Calculates minimum distance from point to route
   - `interpolatePoint()`: Calculates intermediate coordinates
   - `distanceToLineSegment()`: Point-to-segment distance calculation

6. **`server/src/utils/coffeeShopRecommender.js`**
   - Enhanced scoring to prioritize route proximity
   - Handles both route-based and location-based scoring
   - Includes route proximity info in recommendations

---

## API Changes

### Request Format

#### Route-Based Search (NEW)
```json
POST /api/find-coffee-shops
{
  "route": {
    "origin": { "lat": 37.7749, "lng": -122.4194, "name": "San Francisco" },
    "destination": { "lat": 34.0522, "lng": -118.2437, "name": "Los Angeles" },
    "waypoints": []
  },
  "radius": 5000,
  "limit": 10,
  "sortBy": "score"
}
```

#### Location-Based Search (LEGACY - Still Supported)
```json
POST /api/find-coffee-shops
{
  "lat": 37.7749,
  "lng": -122.4194,
  "radius": 5000,
  "limit": 10,
  "sortBy": "score"
}
```

### Response Format

```json
{
  "success": true,
  "searchType": "route",
  "route": {
    "origin": "San Francisco",
    "destination": "Los Angeles"
  },
  "recommendations": [
    {
      "placeId": "ChIJ...",
      "name": "Blue Bottle Coffee",
      "location": { "lat": 37.5000, "lng": -122.0000 },
      "rating": 4.5,
      "reviewCount": 250,
      "distance": "150.2km",
      "distanceFromRoute": "2.3km from route",
      "recommendationScore": 8.7,
      "openNow": true,
      "address": "123 Main St, City, CA",
      "phone": "+1 555-1234",
      "website": "https://example.com"
    }
  ],
  "totalFound": 15,
  "searchRadius": 5000
}
```

---

## Testing Guide

### Prerequisites

1. **Enable Google Places API** (if not already done)
   - Go to Google Cloud Console
   - Enable "Places API" and "Places API (New)"
   - Set up billing

2. **Restart the server:**
   ```bash
   cd /Users/kiraaz/voice-nav-app/server
   npm start
   ```

### Test Scenario 1: Search Along Route

1. **Enter a voice command with multiple stops:**
   ```
   "Navigate from San Francisco to Los Angeles"
   ```
   OR use any multi-stop route like:
   ```
   "Take me from New York to Washington DC"
   ```

2. **Wait for route to load** on the map

3. **Click the "Coffee Shops" button**

4. **Expected Results:**
   - Console shows: "Searching for coffee shops along route"
   - Server logs show: "Generated X search points along route"
   - Coffee shops appear as markers along the route path
   - Recommendations panel shows shops sorted by score
   - Each shop shows "distance from route"

### Test Scenario 2: Search Near Location (Fallback)

1. **Open the app without entering a route**

2. **Click the "Coffee Shops" button**

3. **Expected Results:**
   - Console shows: "No route found, searching near map center"
   - Coffee shops appear near the current map view
   - Works same as before (backwards compatible)

### Test Scenario 3: Long-Distance Route

1. **Enter a long route:**
   ```
   "Navigate from Seattle to Miami"
   ```

2. **Click "Coffee Shops"**

3. **Expected Results:**
   - Server generates multiple search points (one every ~50km)
   - Searches at each point along the route
   - Deduplicates results
   - Shows shops along the entire route path
   - Console shows: "Generated N search points along route"

---

## Console Output Examples

### Successful Route Search

**Frontend:**
```
=== MapDisplay: Coffee Shop Search Started ===
Searching for coffee shops along route:
  Origin: San Francisco (37.7749, -122.4194)
  Destination: Los Angeles (34.0522, -118.2437)
  Waypoints: 0
=== Frontend: Searching Coffee Shops ===
Search type: Along route
Response status: 200
✅ Found 8 recommendations
```

**Backend:**
```
=== /api/find-coffee-shops called ===
Search type: Along route
  Origin: San Francisco (37.7749, -122.4194)
  Destination: Los Angeles (34.0522, -118.2437)
  Waypoints: 0
=== Coffee Shop Search Along Route ===
Generating route points for 2 stops
  Segment 0: San Francisco → Los Angeles (559.1km)
Generated 12 search points along route
Searching near point 1/12: (37.7749, -122.4194)
  Found 20 results at this point
Searching near point 2/12: (37.3456, -121.8765)
  Found 18 results at this point
...
Total unique coffee shops found: 45
Coffee shops within 5000m of route: 28
Found 45 coffee shops, recommending top 10
```

---

## Performance Considerations

### API Quota Usage

- **Long routes** generate more search points
- Each search point = 1 Places Nearby API call
- Each shop = 1 Place Details API call

**Example:**
- Seattle to Miami (~4,500km) = ~90 search points
- If each point finds 20 shops = ~1,800 Place Details calls (after deduplication)
- **Mitigation:** Shops are deduplicated, reducing actual API calls

### Optimization Strategies

1. **Search Point Spacing:** Currently 50km
   - Reduce for shorter routes
   - Increase for very long routes (>1000km)

2. **Radius:** Currently 5km from route
   - Adjustable in request: `radius: 3000` for tighter filtering

3. **Caching:** Consider caching results for popular routes

---

## Future Enhancements

### Possible Improvements

1. **Smart Search Point Generation:**
   - More points near cities
   - Fewer points in rural areas
   - Use population density data

2. **Route Segment Tagging:**
   - "Coffee shops in first third of journey"
   - "Midpoint coffee shops"
   - "Near destination coffee shops"

3. **Time-Based Suggestions:**
   - Estimate arrival time at each segment
   - Filter by shops open at that time

4. **User Preferences:**
   - Filter by chain (Starbucks, Blue Bottle, etc.)
   - Dietary restrictions (vegan options, etc.)
   - Amenities (WiFi, parking, drive-thru)

5. **Route Polyline Optimization:**
   - Use actual route polyline from Directions API
   - Calculate distance to polyline curve instead of straight segments

---

## Troubleshooting

### Issue: "No coffee shops found in this area"

**Possible Causes:**
1. Route is in a rural area with no coffee shops
2. Radius is too small (increase from 5km to 10km)
3. All shops are filtered out by `openNowOnly` setting

**Solution:**
- Try a different route
- Adjust search radius in request

### Issue: Coffee shops shown are too far from route

**Possible Causes:**
1. Search radius is too large
2. Route calculation using straight lines instead of actual road path

**Solution:**
- Reduce radius: `radius: 3000` (3km)
- Shops are filtered to be within 5km of route

### Issue: API quota exceeded

**Possible Causes:**
1. Very long route generating too many search points
2. Testing repeatedly on same route

**Solution:**
- Check Google Cloud Console usage dashboard
- Implement result caching
- Increase search point spacing (modify `maxDistanceBetweenPoints` in `generateRoutePoints`)

---

## Summary

✅ **Feature Complete:**
- Route-based coffee shop search
- Fallback to location-based search
- Smart scoring prioritizing route proximity
- Comprehensive logging for debugging
- Backwards compatible with existing functionality

🚀 **Ready to Test:**
- Restart server
- Enter a multi-stop route
- Click "Coffee Shops" button
- Enjoy coffee recommendations along your journey!
