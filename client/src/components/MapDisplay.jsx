import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { searchCoffeeShops } from '../services/coffeeShopService.js';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 40.7128,
  lng: -74.0060
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: true,
  streetViewControl: false,
  fullscreenControl: true
};

const polylineOptions = {
  strokeColor: '#667eea',
  strokeOpacity: 0.8,
  strokeWeight: 5
};

function MapDisplay({ route, onCoffeeShopsFound }) {
  const [map, setMap] = useState(null);
  const [decodedPath, setDecodedPath] = useState([]);
  const [coffeeShops, setCoffeeShops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const polylineRef = useRef(null);
  const initialCenterRef = useRef(null);

  // Compute initial center only once: use the first route stop if available, otherwise default
  if (!initialCenterRef.current) {
    initialCenterRef.current = route?.stops?.[0]
      ? { lat: route.stops[0].lat, lng: route.stops[0].lng }
      : defaultCenter;
  }

  const onLoad = useCallback((map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Decode polyline when route changes
  useEffect(() => {
    if (route?.overview_polyline && window.google) {
      const decoded = window.google.maps.geometry.encoding.decodePath(
        route.overview_polyline
      );
      setDecodedPath(decoded);
    } else {
      setDecodedPath([]);
      // Directly remove the polyline from the map via native API
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    }
  }, [route]);

  // Fit map to route bounds when route changes
  useEffect(() => {
    if (map && route?.bounds) {
      const bounds = new window.google.maps.LatLngBounds(
        route.bounds.southwest,
        route.bounds.northeast
      );
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [map, route]);

  const getMarkerLabel = (index, total) => {
    if (index === 0) return 'A';
    if (index === total - 1) return String.fromCharCode(65 + index);
    return String.fromCharCode(65 + index);
  };

  const getMarkerIcon = (index, total) => {
    let color;
    if (index === 0) {
      color = '#22c55e'; // green for start
    } else if (index === total - 1) {
      color = '#ef4444'; // red for end
    } else {
      color = '#3b82f6'; // blue for waypoints
    }

    return {
      path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 10
    };
  };

  // Get coffee shop marker icon
  const getCoffeeShopMarkerIcon = (rating) => {
    const hue = Math.min(100, (rating / 5) * 120); // From red to green
    return {
      path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
      fillColor: `hsl(${hue}, 80%, 50%)`,
      fillOpacity: 0.8,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 8
    };
  };

  // Handle search for nearby coffee shops
  const handleSearchCoffeeShops = useCallback(async () => {
    if (!map) {
      console.warn('Map not loaded yet');
      return;
    }

    console.log('=== MapDisplay: Coffee Shop Search Started ===');
    setLoading(true);
    setError(null);

    try {
      // If we have a route, search along the route. Otherwise, use map center
      let searchOptions;

      if (route && route.stops && route.stops.length >= 2) {
        // Search along the route
        const origin = route.stops[0];
        const destination = route.stops[route.stops.length - 1];
        const waypoints = route.stops.slice(1, -1);

        console.log('Searching for coffee shops along route:');
        console.log(`  Origin: ${origin.name} (${origin.lat}, ${origin.lng})`);
        console.log(`  Destination: ${destination.name} (${destination.lat}, ${destination.lng})`);
        console.log(`  Waypoints: ${waypoints.length}`);

        searchOptions = {
          route: {
            origin: { lat: origin.lat, lng: origin.lng, name: origin.name },
            destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
            waypoints: waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng, name: wp.name }))
          },
          radius: 5000,
          limit: 10,
          sortBy: 'score'
        };
      } else {
        // Fallback to map center
        const center = map.getCenter();
        const lat = center.lat();
        const lng = center.lng();

        console.log(`No route found, searching near map center: ${lat}, ${lng}`);

        searchOptions = {
          location: { lat, lng },
          radius: 5000,
          limit: 10,
          sortBy: 'score'
        };
      }

      const result = await searchCoffeeShops(searchOptions);

      console.log('Search result:', result);

      if (result.recommendations && result.recommendations.length > 0) {
        console.log(`✅ Found ${result.recommendations.length} recommendations`);
        setCoffeeShops(result.recommendations);
        if (onCoffeeShopsFound) {
          onCoffeeShopsFound(result.recommendations);
        }
      } else {
        console.log('⚠️ No coffee shops found in this area');
        setError('No coffee shops found in this area');
        setCoffeeShops([]);
      }
    } catch (err) {
      console.error('=== MapDisplay: Coffee Shop Search Error ===');
      console.error('Error type:', err.constructor.name);
      console.error('Error message:', err.message);
      console.error('Full error:', err);
      console.error('=== End MapDisplay Error ===');

      let errorMessage = err.message || 'Failed to search coffee shops';

      // Provide helpful error messages
      if (err.message.includes('403')) {
        errorMessage = '403 Forbidden: Check if Places API is enabled and billing is set up in Google Cloud Console';
      } else if (err.message.includes('REQUEST_DENIED')) {
        errorMessage = 'REQUEST_DENIED: Google Places API not enabled or API key restrictions';
      } else if (err.message.includes('OVER_QUERY_LIMIT')) {
        errorMessage = 'OVER_QUERY_LIMIT: API quota exceeded';
      }

      setError(errorMessage);
      setCoffeeShops([]);
    } finally {
      setLoading(false);
      console.log('=== End Coffee Shop Search ===');
    }
  }, [map, route, onCoffeeShopsFound]);

  return (
    <div className="map-display-container">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={initialCenterRef.current}
        zoom={10}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
      >
        {/* Render route polyline */}
        {decodedPath.length > 0 && (
          <Polyline path={decodedPath} options={polylineOptions} />
        )}

        {/* Render markers for each stop */}
        {route?.stops?.map((stop, index) => (
          <Marker
            key={`${stop.name}-${index}`}
            position={{ lat: stop.lat, lng: stop.lng }}
            label={{
              text: getMarkerLabel(index, route.stops.length),
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '12px'
            }}
            icon={getMarkerIcon(index, route.stops.length)}
            title={stop.formattedAddress || stop.name}
          />
        ))}

        {/* Render coffee shop markers */}
        {coffeeShops.map((shop) => (
          <Marker
            key={shop.placeId}
            position={shop.location}
            icon={getCoffeeShopMarkerIcon(shop.rating)}
            title={`${shop.name} - ${shop.rating}⭐`}
            onClick={() => {
              if (onCoffeeShopsFound) {
                // Trigger detail view in parent component
              }
            }}
          />
        ))}
      </GoogleMap>

      {/* Coffee shop search button */}
      <div className="map-controls">
        <button
          className="btn-search-coffee"
          onClick={handleSearchCoffeeShops}
          disabled={loading || !map}
          title="Search for nearby coffee shops"
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Searching...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              Coffee Shops
            </>
          )}
        </button>
        {error && <div className="map-error">{error}</div>}
      </div>
    </div>
  );
}
export default MapDisplay;