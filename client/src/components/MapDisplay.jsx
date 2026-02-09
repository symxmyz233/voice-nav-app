import { useState, useCallback, useEffect, useMemo } from 'react';
import { GoogleMap, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
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

// Colors for coffee shop markers grouped by stop index
const STOP_COFFEE_COLORS = [
  '#22c55e', // Green - Stop 0 (origin)
  '#3b82f6', // Blue - Stop 1
  '#8b5cf6', // Purple - Stop 2
  '#f59e0b', // Amber - Stop 3
  '#ec4899', // Pink - Stop 4
  '#14b8a6', // Teal - Stop 5
];

function getStopColor(stopIndex) {
  return STOP_COFFEE_COLORS[stopIndex % STOP_COFFEE_COLORS.length];
}

function MapDisplay({ route, onCoffeeShopsFound, onAddCoffeeShop }) {
  const [map, setMap] = useState(null);
  const [decodedPath, setDecodedPath] = useState([]);
  const [coffeeShops, setCoffeeShops] = useState([]);
  const [coffeeShopGrouped, setCoffeeShopGrouped] = useState(null);
  const [coffeeShopGroupMeta, setCoffeeShopGroupMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);

  const normalizedStops = useMemo(() => {
    if (!Array.isArray(route?.stops)) return [];

    return route.stops
      .map((stop) => ({
        ...stop,
        lat: Number(stop?.lat),
        lng: Number(stop?.lng)
      }))
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  }, [route]);

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
    }
  }, [route]);

  // Fit map to route bounds when route changes
  useEffect(() => {
    if (!map || !window.google) return;

    const sw = route?.bounds?.southwest;
    const ne = route?.bounds?.northeast;
    const hasValidBounds =
      Number.isFinite(Number(sw?.lat)) &&
      Number.isFinite(Number(sw?.lng)) &&
      Number.isFinite(Number(ne?.lat)) &&
      Number.isFinite(Number(ne?.lng));

    if (hasValidBounds) {
      const bounds = new window.google.maps.LatLngBounds(
        { lat: Number(sw.lat), lng: Number(sw.lng) },
        { lat: Number(ne.lat), lng: Number(ne.lng) }
      );
      map.fitBounds(bounds, { padding: 50 });
      return;
    }

    if (normalizedStops.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      normalizedStops.forEach((stop) => {
        bounds.extend({ lat: stop.lat, lng: stop.lng });
      });
      decodedPath.forEach((point) => {
        bounds.extend(point);
      });
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [map, route, normalizedStops]);

  // Clear coffee shops when route changes
  useEffect(() => {
    setCoffeeShops([]);
    setCoffeeShopGrouped(null);
    setCoffeeShopGroupMeta(null);
    setSelectedShop(null);
  }, [route]);

  // Compute letter labels that skip via stops
  const stopLetters = useMemo(() => {
    let letterIdx = 0;
    return normalizedStops.map(stop =>
      stop.via ? null : String.fromCharCode(65 + letterIdx++)
    );
  }, [normalizedStops]);

  const getMarkerLabel = (index) => {
    if (normalizedStops[index]?.via) return '~';
    return stopLetters[index] || String.fromCharCode(65 + index);
  };

  const getMarkerIcon = (index, total) => {
    const stop = normalizedStops[index];
    let color;
    let scale = 10;

    if (stop?.via) {
      color = '#8b5cf6'; // purple for via
      scale = 10;
    } else if (index === 0) {
      color = '#22c55e'; // green for start
    } else if (index === total - 1) {
      color = '#ef4444'; // red for end
    } else {
      color = '#3b82f6'; // blue for waypoints
    }

    const symbolPath = window.google?.maps?.SymbolPath?.CIRCLE;
    if (symbolPath == null) return undefined;

    return {
      path: symbolPath,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale
    };
  };

  // Get coffee shop marker icon colored by associated stop
  const getCoffeeShopMarkerIcon = useCallback((shop) => {
    const symbolPath = window.google?.maps?.SymbolPath?.CIRCLE;
    if (symbolPath == null) return undefined;

    const stopIndex = shop.sourceStopIndex ?? 0;
    const color = getStopColor(stopIndex);

    return {
      path: symbolPath,
      fillColor: color,
      fillOpacity: 0.75,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 7
    };
  }, []);

  // Format distance for display
  const formatDistance = (shop) => {
    if (shop.distanceValue != null) {
      const miles = (shop.distanceValue / 1000) * 0.621371;
      return `${miles.toFixed(1)} mi`;
    }
    if (shop.distance) return shop.distance;
    return 'N/A';
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
    setSelectedShop(null);

    try {
      let searchOptions;

      if (route && route.stops && route.stops.length >= 2) {
        const origin = route.stops[0];
        const destination = route.stops[route.stops.length - 1];
        const waypoints = route.stops.slice(1, -1);

        console.log('Searching for coffee shops by stop (excluding destination):');
        console.log(`  Origin: ${origin.name} (${origin.lat}, ${origin.lng})`);
        console.log(`  Destination: ${destination.name} (excluded from search)`);
        console.log(`  Waypoints: ${waypoints.length}`);

        searchOptions = {
          route: {
            origin: { lat: origin.lat, lng: origin.lng, name: origin.name },
            destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
            waypoints: waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng, name: wp.name }))
          },
          radius: 5000,
          perStopLimit: 5,
          sortBy: 'distance'
        };
      } else {
        const center = map.getCenter();
        const lat = center.lat();
        const lng = center.lng();

        console.log(`No route found, searching near map center: ${lat}, ${lng}`);

        searchOptions = {
          location: { lat, lng },
          radius: 5000,
          limit: 10,
          sortBy: 'distance'
        };
      }

      const result = await searchCoffeeShops(searchOptions);

      console.log('Search result:', result);

      if (result.recommendations && result.recommendations.length > 0) {
        console.log(`Found ${result.recommendations.length} recommendations`);
        setCoffeeShops(result.recommendations);
        setCoffeeShopGrouped(result.grouped || null);
        setCoffeeShopGroupMeta(result.groupedMeta || null);
        if (onCoffeeShopsFound) {
          onCoffeeShopsFound(
            result.recommendations,
            result.grouped || null,
            result.groupedMeta || null,
            result.fallbackFood || null
          );
        }
        setError(null);
      } else {
        const hasFallback = result.fallbackFood && Object.keys(result.fallbackFood).length > 0;
        console.log('No open coffee shops found for this search');
        setError(hasFallback
          ? 'No open coffee shops found. Showing other food options.'
          : 'No coffee shops found in this area');
        setCoffeeShops([]);
        setCoffeeShopGrouped(null);
        setCoffeeShopGroupMeta(null);
        if (onCoffeeShopsFound) {
          onCoffeeShopsFound(
            [],
            result.grouped || null,
            result.groupedMeta || null,
            result.fallbackFood || null
          );
        }
      }
    } catch (err) {
      console.error('=== MapDisplay: Coffee Shop Search Error ===');
      console.error('Error type:', err.constructor.name);
      console.error('Error message:', err.message);
      console.error('Full error:', err);
      console.error('=== End MapDisplay Error ===');

      let errorMessage = err.message || 'Failed to search coffee shops';

      if (err.message.includes('403')) {
        errorMessage = '403 Forbidden: Check if Places API is enabled and billing is set up in Google Cloud Console';
      } else if (err.message.includes('REQUEST_DENIED')) {
        errorMessage = 'REQUEST_DENIED: Google Places API not enabled or API key restrictions';
      } else if (err.message.includes('OVER_QUERY_LIMIT')) {
        errorMessage = 'OVER_QUERY_LIMIT: API quota exceeded';
      }

      setError(errorMessage);
      setCoffeeShops([]);
      setCoffeeShopGrouped(null);
      setCoffeeShopGroupMeta(null);
    } finally {
      setLoading(false);
      console.log('=== End Coffee Shop Search ===');
    }
  }, [map, route, onCoffeeShopsFound]);

  return (
    <div className="map-display-container">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={defaultCenter}
        zoom={10}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
        onClick={() => setSelectedShop(null)}
      >
        {/* Render route polyline */}
        {decodedPath.length > 0 && (
          <Polyline path={decodedPath} options={polylineOptions} />
        )}

        {/* Render markers for each stop */}
        {normalizedStops.map((stop, index) => (
          <Marker
            key={`${stop.name}-${index}`}
            position={{ lat: stop.lat, lng: stop.lng }}
            label={{
              text: getMarkerLabel(index),
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '12px'
            }}
            icon={getMarkerIcon(index, normalizedStops.length)}
            title={stop.formattedAddress || stop.name}
          />
        ))}

        {/* Render coffee shop markers with color coding by associated stop */}
        {coffeeShops.map((shop) => (
          <Marker
            key={shop.placeId}
            position={shop.location}
            icon={getCoffeeShopMarkerIcon(shop)}
            title={`${shop.name} - ${shop.rating}★`}
            onClick={() => setSelectedShop(shop)}
          />
        ))}

        {/* InfoWindow popup for selected coffee shop */}
        {selectedShop && selectedShop.location && (
          <InfoWindow
            position={selectedShop.location}
            onCloseClick={() => setSelectedShop(null)}
          >
            <div className="coffee-info-window">
              <div className="coffee-info-name">{selectedShop.name}</div>
              <div className="coffee-info-rating">
                {selectedShop.rating ? `${selectedShop.rating.toFixed(1)}/5 ★` : 'No rating'}
              </div>
              <div className="coffee-info-distance">
                {formatDistance(selectedShop)} from {selectedShop.sourceStopLabel || 'stop'}
              </div>
              {selectedShop.address && (
                <div className="coffee-info-address">{selectedShop.address}</div>
              )}
              {onAddCoffeeShop && (
                <button
                  className="coffee-info-add-btn"
                  onClick={() => {
                    onAddCoffeeShop(selectedShop, selectedShop.sourceStopIndex);
                    setSelectedShop(null);
                  }}
                >
                  Add to Route
                </button>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Legend for coffee shop marker colors */}
      {coffeeShopGrouped && coffeeShopGroupMeta && (
        <div className="map-coffee-legend">
          {coffeeShopGroupMeta.order.map((key) => {
            const stopIndex = coffeeShopGroupMeta.indexes[key];
            const label = coffeeShopGroupMeta.labels[key];
            const color = getStopColor(stopIndex);
            const count = coffeeShopGrouped[key]?.length || 0;
            return (
              <div key={key} className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: color }} />
                <span className="legend-label">{label} ({count})</span>
              </div>
            );
          })}
        </div>
      )}

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
