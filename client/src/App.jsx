import { useState, useCallback } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import VoiceRecorder from './components/VoiceRecorder';
import MapDisplay from './components/MapDisplay';
import RouteInfo from './components/RouteInfo';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const libraries = ['places', 'geometry'];

function App() {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const handleVoiceResult = useCallback((data) => {
    setRouteData(data.route);
    setError(null);
  }, []);

  const handleError = useCallback((errorMessage) => {
    setError(errorMessage);
    setRouteData(null);
  }, []);

  const handleLoadingChange = useCallback((isLoading) => {
    setLoading(isLoading);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voice Navigation Planner</h1>
        <p>Speak your route and see it on the map</p>
      </header>

      <main className="app-main">
        <div className="control-panel">
          <VoiceRecorder
            onResult={handleVoiceResult}
            onError={handleError}
            onLoadingChange={handleLoadingChange}
          />

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {loading && (
            <div className="loading-message">
              Processing your voice input...
            </div>
          )}

          {routeData && <RouteInfo route={routeData} />}
        </div>

        <div className="map-container">
          {loadError && (
            <div className="map-placeholder">
              <p>Error loading Google Maps</p>
            </div>
          )}
          {!isLoaded && !loadError && (
            <div className="map-placeholder">
              <p>Loading map...</p>
            </div>
          )}
          {isLoaded && <MapDisplay route={routeData} />}
        </div>
      </main>
    </div>
  );
}

export default App;
