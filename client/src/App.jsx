import { useState, useCallback, useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import VoiceRecorder from './components/VoiceRecorder';
import MapDisplay from './components/MapDisplay';
import RouteInfo from './components/RouteInfo';
import RouteEmailShare from './components/RouteEmailShare';
import CoffeeShopRecommendations from './components/CoffeeShopRecommendations';
import NearbyInfoCard from './components/NearbyInfoCard';
import VoiceBufferList from './components/VoiceBufferList';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const libraries = ['places', 'geometry'];

function App() {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [coffeeShops, setCoffeeShops] = useState([]);

  useEffect(() => {
    // Load last route
    fetch('/api/last-route')
      .then((res) => res.json())
      .then((data) => {
        if (data.route) setRouteData(data.route);
      })
      .catch(() => {});

    // Get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          console.log('📍 User location obtained:', location);
        },
        (err) => {
          console.warn('Failed to get user location:', err.message);
          // Don't show error to user, location is optional
        }
      );
    }
  }, []);

  // Cleanup location watcher on unmount
  useEffect(() => {
    return () => {
      if (locationWatchIdRef.current != null) {
        clearWatch(locationWatchIdRef.current);
      }
    };
  }, []);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  });

  // Auto-add coffee shop as waypoint when voice command requests it.
  // Uses semantic placement: route duration determines the best position
  // when the user's preference is ambiguous.
  const handleCoffeeShopAutoAdd = useCallback(async (route, preference) => {
    if (!route || !route.stops || route.stops.length < 2) return;

    console.log('Auto-adding coffee shop with preference:', preference);
    setAddingCoffeeShop(true);

    try {
      // 1. Resolve WHERE along the route to search using semantic analysis
      const placement = resolvePlacement(preference, route);
      console.log(`Semantic placement: fraction=${placement.fraction}, label="${placement.label}", brand=${placement.brand}`);

      // 2. Interpolate the actual lat/lng on the route at that fraction
      const searchPoint = interpolateRoutePoint(route.stops, placement.fraction);
      if (!searchPoint) throw new Error('Could not determine search location');

      console.log(`Searching near (${searchPoint.lat.toFixed(4)}, ${searchPoint.lng.toFixed(4)}) — ${placement.label}`);

      // 3. Search for coffee shops at that point
      const result = await searchCoffeeShops({
        location: searchPoint,
        radius: 5000,
        limit: 5,
        sortBy: 'score'
      });

      if (!result.recommendations || result.recommendations.length === 0) {
        setError(`No coffee shops found ${placement.label}`);
        return;
      }

      // 4. Pick the best shop (if a brand was requested, try to match it first)
      let bestShop = result.recommendations[0];
      if (placement.brand) {
        const brandMatch = result.recommendations.find(s =>
          s.name.toLowerCase().includes(placement.brand.toLowerCase())
        );
        if (brandMatch) {
          bestShop = brandMatch;
          console.log(`Brand match found: ${bestShop.name}`);
        } else {
          console.log(`No "${placement.brand}" found, using top-rated: ${bestShop.name}`);
        }
      }

      console.log('Auto-selected coffee shop:', bestShop.name);

      // 5. Find optimal insertion index using detour-minimising algorithm
      const shopPoint = { lat: bestShop.location.lat, lng: bestShop.location.lng };
      const insertIdx = bestInsertionIndex(route.stops, shopPoint);

      const newStops = [...route.stops];
      newStops.splice(insertIdx, 0, {
        name: bestShop.name,
        lat: bestShop.location.lat,
        lng: bestShop.location.lng,
        formattedAddress: bestShop.address,
        isCoffeeShop: true
      });

      // 6. Re-request route with the new waypoint
      const stopQueries = newStops.map(s => ({
        original: s.name,
        searchQuery: s.formattedAddress || s.name,
        type: 'landmark',
        parsed: { landmark: s.name },
        confidence: 1.0
      }));

      const routeResponse = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: stopQueries })
      });
      const routeResult = await routeResponse.json();

      if (routeResult.success && routeResult.route) {
        routeResult.route.stops = routeResult.route.stops.map(s => {
          if (s.name === bestShop.name || s.formattedAddress?.includes(bestShop.name)) {
            return { ...s, isCoffeeShop: true };
          }
          return s;
        });
        setRouteData(routeResult.route);
        setCoffeeShops([bestShop]);
      }
    } catch (err) {
      console.error('Failed to auto-add coffee shop:', err);
      setError('Could not find a coffee shop to add to your route');
    } finally {
      setAddingCoffeeShop(false);
    }
  }, []);

  // Handle standalone "find nearest coffee shop" voice command
  const handleNearbySearch = useCallback(async () => {
    console.log('Starting nearby coffee shop search...');
    setSearchingNearby(true);
    setError(null);

    try {
      const position = await getCurrentPosition();
      setUserLocation(position);
      console.log(`User location: (${position.lat.toFixed(4)}, ${position.lng.toFixed(4)})`);

      const result = await searchCoffeeShops({
        location: position,
        radius: 3000,
        limit: 5,
        sortBy: 'distance'
      });

      if (!result.recommendations || result.recommendations.length === 0) {
        setError('No coffee shops found nearby. Try expanding your search.');
        setNearbyCoffeeResults([]);
        return;
      }

      console.log(`Found ${result.recommendations.length} nearby coffee shops`);
      setNearbyCoffeeResults(result.recommendations);
      setSelectedNearbyShop(result.recommendations[0]);
    } catch (err) {
      console.error('Nearby search failed:', err);
      setError(err.message || 'Failed to find nearby coffee shops');
      setNearbyCoffeeResults([]);
    } finally {
      setSearchingNearby(false);
    }
  }, []);

  // Navigate from user's location to a selected nearby coffee shop
  const handleNavigateToShop = useCallback(async (shop) => {
    if (!userLocation) {
      setError('Could not determine your location. Please try again.');
      return;
    }

    console.log('Navigating to coffee shop:', shop.name);
    setLoading(true);
    setSelectedNearbyShop(shop);

    try {
      const stopQueries = [
        {
          original: 'Your Location',
          searchQuery: `${userLocation.lat},${userLocation.lng}`,
          type: 'full_address',
          parsed: { landmark: 'Your Location' },
          confidence: 1.0
        },
        {
          original: shop.name,
          searchQuery: shop.address || `${shop.location.lat},${shop.location.lng}`,
          type: 'landmark',
          parsed: { landmark: shop.name, businessName: shop.name },
          confidence: 1.0
        }
      ];

      const routeResponse = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: stopQueries })
      });
      const routeResult = await routeResponse.json();

      if (routeResult.success && routeResult.route) {
        setCoffeeDetourRoute(routeResult.route);
        setIsDetourActive(true);

        // Start live location tracking
        const watchId = watchUserPosition(
          (pos) => setUserLocation(pos),
          (err) => console.warn('Location tracking error:', err.message)
        );
        locationWatchIdRef.current = watchId;
      }
    } catch (err) {
      console.error('Failed to create detour route:', err);
      setError('Failed to create navigation to coffee shop');
    } finally {
      setLoading(false);
    }
  }, [userLocation]);

  // Return to main route, clearing all nearby/detour state
  const handleReturnToMainRoute = useCallback(() => {
    setCoffeeDetourRoute(null);
    setIsDetourActive(false);
    setNearbyCoffeeResults([]);
    setSelectedNearbyShop(null);
    setUserLocation(null);

    if (locationWatchIdRef.current != null) {
      clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
  }, []);

  // Dismiss nearby results without clearing detour
  const handleDismissNearby = useCallback(() => {
    setNearbyCoffeeResults([]);
    setSelectedNearbyShop(null);
  }, []);

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
    if (isLoading) {
      // Don't clear routeData - we need it for "add stop" commands
      setError(null);
    }
  }, []);

  const handleCoffeeShopsFound = useCallback((shops, grouped) => {
    setCoffeeShops(shops);
    setCoffeeShopGroups(grouped || null);
  }, []);

  const handleCoffeeShopSelect = useCallback((shop) => {
    console.log('Selected coffee shop:', shop);
    // TODO: Add navigation to coffee shop as destination
  }, []);

  return (
    <div className="app">
      {confirmationData && (
        <AddressConfirmation
          stops={confirmationData.stops}
          transcript={confirmationData.transcript}
          onConfirm={handleConfirmAddresses}
          onCancel={handleCancelConfirmation}
        />
      )}

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
            currentRoute={routeData}
            userLocation={userLocation}
          />

          {statusMessage && (
            <div className="success-message" style={{
              padding: '12px',
              backgroundColor: '#10b981',
              color: 'white',
              borderRadius: '8px',
              marginTop: '10px',
              textAlign: 'center'
            }}>
              {statusMessage}
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {(loading || addingCoffeeShop || searchingNearby) && (
            <div className={`loading-message ${searchingNearby ? 'nearby' : ''}`}>
              {searchingNearby
                ? 'Finding coffee shops near you...'
                : addingCoffeeShop
                ? 'Finding the best coffee shop for your route...'
                : 'Processing your voice input...'}
            </div>
          )}

          {/* Nearby coffee shop results card */}
          {nearbyCoffeeResults.length > 0 && (
            <NearbyInfoCard
              shops={nearbyCoffeeResults}
              selectedShop={selectedNearbyShop}
              onNavigate={handleNavigateToShop}
              onDismiss={handleDismissNearby}
            />
          )}

          {/* Return to main route button (sidebar) */}
          {isDetourActive && routeData && (
            <button className="btn-return-main-route" onClick={handleReturnToMainRoute}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Return to Main Route
            </button>
          )}

          {routeData && <RouteEmailShare route={routeData} />}
          {routeData && (
            <RouteInfo
              route={routeData}
              onRemoveStop={handleRemoveStop}
              onEditStop={handleEditStop}
            />
          )}

          {coffeeShops.length > 0 && (
            <CoffeeShopRecommendations
              shops={coffeeShops}
              grouped={coffeeShopGroups}
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
              coffeeDetourRoute={coffeeDetourRoute}
              isDetourActive={isDetourActive}
              userLocation={userLocation}
              nearbyCoffeeResults={nearbyCoffeeResults}
              selectedNearbyShop={selectedNearbyShop}
              onReturnToMainRoute={handleReturnToMainRoute}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
