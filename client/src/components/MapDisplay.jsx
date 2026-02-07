import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 37.7749,
  lng: -122.4194
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

function MapDisplay({ route }) {
  const [map, setMap] = useState(null);
  const [decodedPath, setDecodedPath] = useState([]);
  const polylineRef = useRef(null);

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

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={defaultCenter}
      zoom={10}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={mapOptions}
    >
      {/* Render route polyline */}
      {decodedPath.length > 0 && (
        <Polyline
          path={decodedPath}
          options={polylineOptions}
          onLoad={(polyline) => { polylineRef.current = polyline; }}
        />
      )}

      {/* Render markers for each stop — wait for map to be ready */}
      {map && Array.isArray(route?.stops) && route.stops.map((stop, index) => (
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
    </GoogleMap>
  );
}

export default MapDisplay;
