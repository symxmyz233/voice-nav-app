import { useState, useCallback, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import VoiceRecorder from './components/VoiceRecorder';
import MapDisplay from './components/MapDisplay';
import RouteInfo from './components/RouteInfo';
import CoffeeShopRecommendations from './components/CoffeeShopRecommendations';
import VoiceBufferList from './components/VoiceBufferList';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const libraries = ['places', 'geometry'];

function App() {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [coffeeShops, setCoffeeShops] = useState([]);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const applyRouteResult = useCallback((data) => {
    if (!data?.route) return;
    setRouteData(data.route);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateRouteFromServerCache = async () => {
      try {
        const response = await fetch('/api/last-route');
        if (!response.ok) return;

        const data = await response.json();
        if (!cancelled && data?.success && data?.route) {
          // Use the same pipeline as voice input result.
          applyRouteResult(data);
        }
      } catch {
        // Best effort only; ignore cache hydration failure.
      }
    };

    hydrateRouteFromServerCache();

    return () => {
      cancelled = true;
    };
  }, [applyRouteResult]);

  const handleVoiceResult = useCallback((data) => {
    applyRouteResult(data);
  }, [applyRouteResult]);

  const handleError = useCallback((errorMessage) => {
    setError(errorMessage);
    setRouteData(null);
  }, []);

  const handleLoadingChange = useCallback((isLoading) => {
    setLoading(isLoading);
    if (isLoading) {
      setRouteData(null);
      setError(null);
    }
  }, []);

  const handleCoffeeShopsFound = useCallback((shops) => {
    setCoffeeShops(shops);
  }, []);

  const handleCoffeeShopSelect = useCallback((shop) => {
    console.log('Selected coffee shop:', shop);
    // TODO: Add navigation to coffee shop as destination
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

          {coffeeShops.length > 0 && (
            <CoffeeShopRecommendations
              shops={coffeeShops}
              onShopSelect={handleCoffeeShopSelect}
            />
          )}
          <VoiceBufferList
            onResult={handleVoiceResult}
            onError={handleError}
            onLoadingChange={handleLoadingChange}
          />
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
          {isLoaded && (
            <MapDisplay
              route={routeData}
              onCoffeeShopsFound={handleCoffeeShopsFound}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
