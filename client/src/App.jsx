import { useState, useCallback, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import VoiceRecorder from './components/VoiceRecorder';
import MapDisplay from './components/MapDisplay';
import RouteInfo from './components/RouteInfo';
import RouteEmailShare from './components/RouteEmailShare';
import CoffeeShopRecommendations from './components/CoffeeShopRecommendations';
import VoiceBufferList from './components/VoiceBufferList';
import AddressConfirmation from './components/AddressConfirmation';
import LoginScreen from './components/LoginScreen';
import UserProfile from './components/UserProfile';
import QuickStartPanel from './components/QuickStartPanel';
import QuickAddDestinations from './components/QuickAddDestinations';
import RecentPlacesList from './components/RecentPlacesList';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HistoryProvider, useHistory } from './contexts/HistoryContext';
import { RecentPlacesProvider, useRecentPlaces } from './contexts/RecentPlacesContext';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const libraries = ['places', 'geometry'];

function getConfirmationStopIndexes(stops = [], preferredIndexes = []) {
  if (Array.isArray(preferredIndexes) && preferredIndexes.length > 0) {
    const valid = preferredIndexes
      .map((index) => Number(index))
      .filter((index) => Number.isInteger(index) && index >= 0 && index < stops.length);
    if (valid.length > 0) {
      return [...new Set(valid)];
    }
  }

  const needsConfirmation = stops
    .map((stop, index) => (stop?.needsConfirmation ? index : -1))
    .filter((index) => index >= 0);
  if (needsConfirmation.length > 0) {
    return needsConfirmation;
  }

  const lowConfidence = stops
    .map((stop, index) => (typeof stop?.confidence === 'number' && stop.confidence < 0.9 ? index : -1))
    .filter((index) => index >= 0);
  if (lowConfidence.length > 0) {
    return lowConfidence;
  }

  return stops.map((_, index) => index);
}

function AppContent() {
  const { isAuthenticated, currentUser, loading: authLoading } = useAuth();
  const { refreshHistory, refreshRecentDestinations } = useHistory();
  const { addPlacesFromRoute } = useRecentPlaces();
  const [showLoginScreen, setShowLoginScreen] = useState(true);
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [coffeeShops, setCoffeeShops] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [confirmationData, setConfirmationData] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    const maskSecret = (value) => {
      if (!value) return 'missing';
      const str = String(value);
      if (str.length <= 8) return `len=${str.length}`;
      return `${str.slice(0, 6)}...${str.slice(-4)} (len=${str.length})`;
    };

    console.log('=== Frontend API Config ===');
    console.log('VITE_API_URL:', API_BASE_URL);
    console.log('VITE_GOOGLE_MAPS_API_KEY:', maskSecret(GOOGLE_MAPS_API_KEY));
    console.log('=== End Frontend API Config ===');

    // Load last route - for authenticated users, load from history
    if (isAuthenticated) {
      fetch('http://localhost:3001/api/history?limit=1', {
        credentials: 'include'
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.history?.[0]) {
            setRouteData(data.history[0].route);
          }
        })
        .catch(() => {});
    } else {
      // For guests, load from cache
      fetch('/api/last-route')
        .then((res) => res.json())
        .then((data) => {
          if (data.route) setRouteData(data.route);
        })
        .catch(() => {});
    }

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
  }, [isAuthenticated]);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const openConfirmationDialog = useCallback((payload, fallback = {}) => {
    const stops = payload?.stops || fallback.stops || [];
    const confirmationStopIndexes = getConfirmationStopIndexes(stops, payload?.confirmationStopIndexes);

    setConfirmationData({
      stops,
      stopIndexes: confirmationStopIndexes,
      transcript: payload?.transcript ?? fallback.transcript ?? null,
      commandType: payload?.commandType || fallback.commandType || 'new_route'
    });

    if (payload?.message) {
      setStatusMessage(payload.message);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  }, []);

  const handleVoiceResult = useCallback((data) => {
    console.log('\n========== FRONTEND: handleVoiceResult ==========');
    console.log('📝 Transcript:', data.transcript);
    console.log('🎯 Command Type:', data.commandType);
    console.log('📍 Route stops:', data.route?.stops?.length || 0);

    // Log current route BEFORE update
    console.log('\n🔍 BEFORE UPDATE:');
    console.log('  Current routeData:', routeData);
    if (routeData?.stops) {
      console.log('  Current stops count:', routeData.stops.length);
      routeData.stops.forEach((stop, i) => {
        console.log(`    [${i}] ${stop.name} | original: "${stop.original}" | lat: ${stop.lat}, lng: ${stop.lng}`);
      });
    } else {
      console.log('  No current route');
    }

    // Log new route data
    console.log('\n✨ NEW ROUTE DATA:');
    if (data.route?.stops) {
      console.log('  New stops count:', data.route.stops.length);
      data.route.stops.forEach((stop, i) => {
        console.log(`    [${i}] ${stop.name} | original: "${stop.original}" | lat: ${stop.lat}, lng: ${stop.lng}`);
      });
    }

    // Log full data object for debugging
    console.log('\n📦 Full response data:', JSON.stringify(data, null, 2));
    console.log('================================================\n');

    // Check if confirmation is needed
    if (data.needsConfirmation) {
      console.log('⚠️ Confirmation required - showing targeted stops');
      openConfirmationDialog(data, {
        stops: data.stops,
        transcript: data.transcript,
        commandType: data.commandType
      });
      setLoading(false);
      return;
    }

    // Normal flow - route already calculated
    console.log('✅ Setting new route data (this will REPLACE the old route)');
    setRouteData(data.route);
    setError(null);

    // Add places from route to recent places
    addPlacesFromRoute(data.route);

    // Set status message based on command type
    if (data.commandType === 'add_stop' || data.commandType === 'insert_stop') {
      setStatusMessage('✓ Stop added to route');
    } else if (data.commandType === 'replace_stop') {
      setStatusMessage('✓ Stop replaced in route');
    } else if (data.commandType === 'new_route') {
      setStatusMessage('✓ New route created');
    }

    // Clear status message after 3 seconds
    setTimeout(() => setStatusMessage(null), 3000);

    // Refresh history after voice result
    if (isAuthenticated) {
      refreshHistory();
      refreshRecentDestinations();
    }
  }, [openConfirmationDialog, routeData, isAuthenticated, refreshHistory, refreshRecentDestinations, addPlacesFromRoute]);

  const handleSelectDestination = useCallback(async (destination) => {
    // Create route from current location to destination
    if (!userLocation) {
      setError('Unable to get your location. Please enable location services.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const stops = [
        {
          name: 'Your Location',
          searchQuery: 'Your Location',
          lat: userLocation.lat,
          lng: userLocation.lng,
          formattedAddress: `${userLocation.lat}, ${userLocation.lng}`
        },
        destination
      ];

      const response = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stops })
      });

      const result = await response.json();

      if (result.success) {
        setRouteData(result.route);
        addPlacesFromRoute(result.route);
        if (isAuthenticated) {
          refreshHistory();
          refreshRecentDestinations();
        }
      } else {
        setError(result.error || 'Failed to calculate route');
      }
    } catch (err) {
      setError('Failed to create route to destination');
    } finally {
      setLoading(false);
    }
  }, [userLocation, isAuthenticated, refreshHistory, refreshRecentDestinations, addPlacesFromRoute]);

  const handleQuickAddStop = useCallback(async (destination) => {
    if (!routeData || !routeData.stops) {
      // If no current route, create one from user location to destination
      handleSelectDestination(destination);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Add destination as new stop before the final destination
      const currentStops = [...routeData.stops];
      const newStops = [...currentStops.slice(0, -1), destination, currentStops[currentStops.length - 1]];

      const response = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stops: newStops })
      });

      const result = await response.json();

      if (result.success) {
        setRouteData(result.route);
        addPlacesFromRoute(result.route);
        setStatusMessage(`✓ Added ${destination.name} to route`);
        setTimeout(() => setStatusMessage(null), 3000);
        if (isAuthenticated) {
          refreshHistory();
          refreshRecentDestinations();
        }
      } else {
        setError(result.error || 'Failed to add stop');
      }
    } catch (err) {
      setError('Failed to add stop to route');
    } finally {
      setLoading(false);
    }
  }, [routeData, handleSelectDestination, isAuthenticated, refreshHistory, refreshRecentDestinations, addPlacesFromRoute]);

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

  const handleCoffeeShopsFound = useCallback((shops) => {
    setCoffeeShops(shops);
  }, []);

  const handleCoffeeShopSelect = useCallback((shop) => {
    console.log('Selected coffee shop:', shop);
    // TODO: Add navigation to coffee shop as destination
  }, []);

  const handleConfirmAddresses = useCallback(async (confirmedStops) => {
    console.log('User confirmed addresses:', confirmedStops);
    setConfirmationData(null);
    setLoading(true);

    try {
      // Call /api/route with confirmed stops
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: confirmedStops })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to calculate route');
      }

      if (data.needsConfirmation) {
        openConfirmationDialog(data, {
          stops: data.stops || confirmedStops,
          transcript: data.transcript || null,
          commandType: data.commandType || 'new_route'
        });
        return;
      }

      setRouteData(data.route);
      setStatusMessage('✓ Route created with confirmed addresses');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to calculate route');
    } finally {
      setLoading(false);
    }
  }, [openConfirmationDialog]);

  const handleCancelConfirmation = useCallback(() => {
    console.log('User cancelled address confirmation');
    setConfirmationData(null);
    setLoading(false);
  }, []);

  const handleRemoveStop = useCallback(async (stopIndex) => {
    if (!routeData || !routeData.stops) return;

    // Can't remove if we'd have less than 2 stops (origin and destination required)
    if (routeData.stops.length <= 2) {
      setError('Cannot remove stop - at least 2 stops are required (origin and destination)');
      setTimeout(() => setError(null), 3000);
      return;
    }

    console.log(`Removing stop at index ${stopIndex}`);
    setLoading(true);
    setError(null);

    try {
      // Create new stops array without the removed stop
      const updatedStops = routeData.stops.filter((_, index) => index !== stopIndex);

      // Recalculate route with updated stops
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: updatedStops })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to recalculate route');
      }

      if (data.needsConfirmation) {
        openConfirmationDialog(data, {
          stops: data.stops || updatedStops,
          transcript: null,
          commandType: data.commandType || 'new_route'
        });
        return;
      }

      setRouteData(data.route);
      setStatusMessage('✓ Stop removed and route updated');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Error removing stop:', err);
      setError(err.message || 'Failed to remove stop');
    } finally {
      setLoading(false);
    }
  }, [openConfirmationDialog, routeData]);

  const handleEditStop = useCallback(async (stopIndex, newAddress) => {
    if (!routeData || !routeData.stops) return;

    console.log(`Editing stop at index ${stopIndex} to: ${newAddress}`);
    setLoading(true);
    setError(null);

    try {
      // Create new stops array with updated address
      const updatedStops = routeData.stops.map((stop, index) => {
        if (index === stopIndex) {
          // Replace with new search query and remove old coordinates
          // so the server re-geocodes the new address
          const { lat, lng, formattedAddress, placeId, ...rest } = stop;
          return {
            ...rest,
            name: newAddress,
            searchQuery: newAddress,
            original: newAddress
          };
        }
        return stop;
      });

      // Recalculate route with updated stops
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: updatedStops })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to recalculate route');
      }

      if (data.needsConfirmation) {
        openConfirmationDialog(data, {
          stops: data.stops || updatedStops,
          transcript: null,
          commandType: data.commandType || 'new_route'
        });
        return;
      }

      setRouteData(data.route);
      setStatusMessage('✓ Stop updated and route recalculated');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Error editing stop:', err);
      setError(err.message || 'Failed to edit stop');
    } finally {
      setLoading(false);
    }
  }, [openConfirmationDialog, routeData]);

  // Show login screen if not authenticated and not in guest mode
  if (!isAuthenticated && showLoginScreen && !authLoading) {
    return <LoginScreen onContinueAsGuest={() => setShowLoginScreen(false)} />;
  }

  if (authLoading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <div className="app">
      {confirmationData && (
        <AddressConfirmation
          stops={confirmationData.stops}
          confirmationStopIndexes={confirmationData.stopIndexes}
          transcript={confirmationData.transcript}
          onConfirm={handleConfirmAddresses}
          onCancel={handleCancelConfirmation}
        />
      )}

      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Voice Navigation Planner</h1>
            <p>Speak your route and see it on the map</p>
          </div>
          <div className="header-right">
            <UserProfile />
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="control-panel">
          {!routeData && isAuthenticated && (
            <QuickStartPanel
              onSelectDestination={handleSelectDestination}
            />
          )}

          {routeData ? (
            <div className="voice-email-row">
              <VoiceRecorder
                onResult={handleVoiceResult}
                onError={handleError}
                onLoadingChange={handleLoadingChange}
                currentRoute={routeData}
                userLocation={userLocation}
                compact
              />
              <RouteEmailShare route={routeData} compact />
            </div>
          ) : (
            <VoiceRecorder
              onResult={handleVoiceResult}
              onError={handleError}
              onLoadingChange={handleLoadingChange}
              currentRoute={routeData}
              userLocation={userLocation}
            />
          )}

          {isAuthenticated && (
            <RecentPlacesList onSelectPlace={handleSelectDestination} />
          )}

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

          {loading && (
            <div className="loading-message">
              Processing your voice input...
            </div>
          )}

          {routeData && isAuthenticated && (
            <QuickAddDestinations onAddStop={handleQuickAddStop} />
          )}

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
              onShopSelect={handleCoffeeShopSelect}
            />
          )}
          <VoiceBufferList
            onResult={handleVoiceResult}
            onError={handleError}
            onLoadingChange={handleLoadingChange}
            userLocation={userLocation}
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

function App() {
  return (
    <AuthProvider>
      <HistoryProvider>
        <RecentPlacesProvider>
          <AppContent />
        </RecentPlacesProvider>
      </HistoryProvider>
    </AuthProvider>
  );
}

export default App;
