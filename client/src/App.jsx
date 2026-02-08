import { useState, useCallback, useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import VoiceRecorder from './components/VoiceRecorder';
import MapDisplay from './components/MapDisplay';
import RouteInfo from './components/RouteInfo';
import RouteEmailShare from './components/RouteEmailShare';
import CoffeeShopModal from './components/CoffeeShopModal';
import NearbyInfoCard from './components/NearbyInfoCard';
import VoiceBufferList from './components/VoiceBufferList';
import AddressConfirmation from './components/AddressConfirmation';
import { calculateDistance, searchCoffeeShops } from './services/coffeeShopService.js';
import { getCurrentPosition, watchUserPosition, clearWatch } from './services/geolocationService.js';
import { resolvePlacement, interpolateRoutePoint, bestInsertionIndex } from './services/coffeeShopPlacement.js';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const libraries = ['places', 'geometry'];

const BRAND_KEYWORDS = [
  { name: 'Starbucks', tokens: ['starbucks', '星巴克'] },
  { name: 'Dunkin', tokens: ['dunkin', 'dunkin donuts', '唐恩', '唐恩都乐'] },
  { name: 'Peet\'s Coffee', tokens: ['peet', "peet's", '皮爷', '皮爺'] },
  { name: 'Tim Hortons', tokens: ['tim hortons', 'timmies', '天好咖啡'] },
  { name: 'Blue Bottle', tokens: ['blue bottle', '蓝瓶', '藍瓶'] },
  { name: 'Philz', tokens: ['philz'] }
];

const TYPE_KEYWORDS = [
  { keyword: 'specialty coffee', tokens: ['specialty', '精品', '单品'] },
  { keyword: 'espresso bar', tokens: ['espresso', '浓缩', '意式'] },
  { keyword: 'latte', tokens: ['latte', '拿铁'] },
  { keyword: 'cappuccino', tokens: ['cappuccino', '卡布奇诺'] },
  { keyword: 'pour over coffee', tokens: ['pour over', 'hand drip', '手冲'] },
  { keyword: 'matcha cafe', tokens: ['matcha', '抹茶'] },
  { keyword: 'bakery cafe', tokens: ['bakery', 'pastry', 'cake', 'bread', '蛋糕', '甜点', '甜品', '面包'] },
  { keyword: 'quiet cafe', tokens: ['quiet', 'silent', '安静', '不吵'] },
  { keyword: 'study cafe', tokens: ['study', 'work', '办公', '学习', '自习', '工作'] },
  { keyword: 'drive thru coffee', tokens: ['drive thru', 'drive-through', 'drive through', '免下车', '免下車'] }
];

const parseCoffeePreference = (preference) => {
  if (!preference) return { location: null, brand: null };
  const [location, ...rest] = String(preference).split(':');
  const brand = rest.join(':').trim();
  return {
    location: location || null,
    brand: brand || null
  };
};

const normalizeText = (value) => String(value || '').toLowerCase();

const findBrandMatch = (text) => BRAND_KEYWORDS.find((entry) =>
  entry.tokens.some((token) => text.includes(token))
);

const findTypeMatch = (text) => TYPE_KEYWORDS.find((entry) =>
  entry.tokens.some((token) => text.includes(token))
);

const deriveCoffeeSearchHints = (transcript, preference) => {
  const normalizedTranscript = normalizeText(transcript);
  const { brand: preferenceBrand } = parseCoffeePreference(preference);

  if (preferenceBrand) {
    const normalizedPreference = normalizeText(preferenceBrand);
    const mappedBrand = findBrandMatch(normalizedPreference);
    return {
      brandDisplay: mappedBrand?.name || null,
      brandFilter: mappedBrand?.name || preferenceBrand,
      keyword: mappedBrand?.name || preferenceBrand
    };
  }

  const brandMatch = findBrandMatch(normalizedTranscript);
  if (brandMatch) {
    return {
      brandDisplay: brandMatch.name,
      brandFilter: brandMatch.name,
      keyword: brandMatch.name
    };
  }

  const typeMatch = findTypeMatch(normalizedTranscript);
  if (typeMatch) {
    return {
      brandDisplay: null,
      brandFilter: null,
      keyword: typeMatch.keyword
    };
  }

  return { brandDisplay: null, brandFilter: null, keyword: null };
};

function App() {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [coffeeShops, setCoffeeShops] = useState([]);
  const [coffeeShopGroups, setCoffeeShopGroups] = useState(null);
  const [coffeeShopGroupMeta, setCoffeeShopGroupMeta] = useState(null);
  const [fallbackFood, setFallbackFood] = useState(null);
  const [fallbackModal, setFallbackModal] = useState(null);
  const [dismissedFallbackKeys, setDismissedFallbackKeys] = useState([]);
  const [showCoffeeModal, setShowCoffeeModal] = useState(false);
  const [pendingCoffeeShop, setPendingCoffeeShop] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [addingCoffeeShop, setAddingCoffeeShop] = useState(false);
  const [searchingNearby, setSearchingNearby] = useState(false);
  const [nearbyCoffeeResults, setNearbyCoffeeResults] = useState([]);
  const [selectedNearbyShop, setSelectedNearbyShop] = useState(null);
  const [coffeeDetourRoute, setCoffeeDetourRoute] = useState(null);
  const [isDetourActive, setIsDetourActive] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const locationWatchIdRef = useRef(null);

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

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!fallbackFood || !coffeeShopGroups) return;

    const keys = Object.keys(fallbackFood);
    const nextKey = keys.find((key) => {
      const hasCoffee = (coffeeShopGroups[key] || []).length > 0;
      const hasFallback = (fallbackFood[key] || []).length > 0;
      return !hasCoffee && hasFallback && !dismissedFallbackKeys.includes(key);
    });

    if (nextKey) {
      setFallbackModal({
        key: nextKey,
        label: coffeeShopGroupMeta?.labels?.[nextKey] || 'This stop',
        shops: fallbackFood[nextKey]
      });
    }
  }, [fallbackFood, coffeeShopGroups, coffeeShopGroupMeta, dismissedFallbackKeys]);

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
  const handleCoffeeShopAutoAdd = useCallback(async (route, preference, transcript) => {
    if (!route || !route.stops || route.stops.length < 2) return;

    const searchHints = deriveCoffeeSearchHints(transcript, preference);
    console.log('Auto-adding coffee shop with preference:', preference, 'keyword:', searchHints.keyword);
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
        limit: 8,
        sortBy: 'score',
        ...(searchHints.keyword ? { keyword: searchHints.keyword } : {})
      });

      if (!result.recommendations || result.recommendations.length === 0) {
        setError(`No coffee shops found ${placement.label}`);
        return;
      }

      // 4. Pick the best shop (brand-specific if provided, otherwise top-ranked)
      let bestShop = result.recommendations[0];
      const brandFilter = searchHints.brandFilter || placement.brand;
      if (brandFilter) {
        const normalizedBrand = normalizeText(brandFilter);
        const brandMatch = result.recommendations.find(s =>
          normalizeText(s.name).includes(normalizedBrand)
        );
        if (brandMatch) {
          bestShop = brandMatch;
          console.log(`Brand match found: ${bestShop.name}`);
        } else {
          setError(`No matching brand found ${placement.label}`);
          return;
        }
      }

      console.log('Auto-selected coffee shop:', bestShop.name);

      // 5. Find optimal insertion index using detour-minimising algorithm
      // Then ask for user confirmation before adding to the route.
      const shopPoint = { lat: bestShop.location.lat, lng: bestShop.location.lng };
      const insertIdx = bestInsertionIndex(route.stops, shopPoint);
      const insertAfterIndex = Math.max(0, insertIdx - 1);

      setPendingCoffeeShop({
        shop: bestShop,
        insertAfterIndex,
        placementLabel: placement.label,
        brand: placement.brand
      });
    } catch (err) {
      console.error('Failed to auto-add coffee shop:', err);
      setError('Could not find a coffee shop to add to your route');
    } finally {
      setAddingCoffeeShop(false);
    }
  }, []);

  // Handle standalone "find nearest coffee shop" voice command
  const handleNearbySearch = useCallback(async (transcript) => {
    console.log('Starting nearby coffee shop search...');
    setSearchingNearby(true);
    setError(null);

    try {
      const position = await getCurrentPosition();
      setUserLocation(position);
      console.log(`User location: (${position.lat.toFixed(4)}, ${position.lng.toFixed(4)})`);

      const searchHints = deriveCoffeeSearchHints(transcript, null);
      const result = await searchCoffeeShops({
        location: position,
        radius: 3000,
        limit: 5,
        sortBy: 'distance',
        ...(searchHints.keyword ? { keyword: searchHints.keyword } : {})
      });

      if (!result.recommendations || result.recommendations.length === 0) {
        setError('No coffee shops found nearby. Try expanding your search.');
        setNearbyCoffeeResults([]);
        return;
      }

      let recommendations = result.recommendations;

      if (searchHints.brandFilter) {
        const normalizedBrand = normalizeText(searchHints.brandFilter);
        const brandMatches = recommendations.filter((shop) =>
          normalizeText(shop.name).includes(normalizedBrand)
        );
        if (brandMatches.length === 0) {
          setError('No matching brand found nearby.');
          setNearbyCoffeeResults([]);
          return;
        }
        recommendations = brandMatches;
      }

      console.log(`Found ${recommendations.length} nearby coffee shops`);
      setNearbyCoffeeResults(recommendations);
      setSelectedNearbyShop(recommendations[0]);
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
    if (!data) return;

    if (data.needsConfirmation) {
      setConfirmationData({
        stops: data.stops || [],
        transcript: data.transcript || null,
        commandType: data.commandType || 'new_route'
      });
      setError(null);
      setStatusMessage(null);
      return;
    }

    if (data.nearbySearch) {
      handleNearbySearch(data.transcript || '');
      return;
    }

    if (data.route) {
      setRouteData(data.route);
      setError(null);
      setStatusMessage(data.message || 'Route updated');

      if (data.addCoffeeShop) {
        handleCoffeeShopAutoAdd(
          data.route,
          data.coffeeShopPreference || null,
          data.transcript || ''
        );
      }
    }
  }, [handleCoffeeShopAutoAdd, handleNearbySearch]);

  const handleConfirmAddresses = useCallback(async (confirmedStops) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: confirmedStops })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to calculate route');
      }

      if (data.success && data.route) {
        setRouteData(data.route);
        setStatusMessage('Route updated');
        setConfirmationData(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to confirm addresses');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCancelConfirmation = useCallback(() => {
    setConfirmationData(null);
  }, []);

  const handleRemoveStop = useCallback(async (index) => {
    if (!routeData?.stops || routeData.stops.length <= 2) return;
    const newStops = routeData.stops
      .filter((_, i) => i !== index)
      .map((stop) => ({
        ...stop,
        original: stop.original || stop.name || stop.searchQuery,
        searchQuery: stop.searchQuery || stop.formattedAddress || stop.name || stop.original
      }));

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: newStops })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update route');
      }

      if (data.success && data.route) {
        setRouteData(data.route);
        setStatusMessage('Stop removed');
      }
    } catch (err) {
      setError(err.message || 'Failed to remove stop');
    } finally {
      setLoading(false);
    }
  }, [routeData]);

  const handleEditStop = useCallback(async (index, newValue) => {
    if (!routeData?.stops || !newValue) return;

    const newStops = routeData.stops.map((stop, i) => {
      if (i !== index) {
        return {
          ...stop,
          original: stop.original || stop.name || stop.searchQuery,
          searchQuery: stop.searchQuery || stop.formattedAddress || stop.name || stop.original
        };
      }

      const {
        lat,
        lng,
        formattedAddress,
        ...rest
      } = stop || {};

      return {
        ...rest,
        name: newValue,
        original: newValue,
        searchQuery: newValue
      };
    });

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: newStops })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update route');
      }

      if (data.success && data.route) {
        setRouteData(data.route);
        setStatusMessage('Stop updated');
      }
    } catch (err) {
      setError(err.message || 'Failed to update stop');
    } finally {
      setLoading(false);
    }
  }, [routeData]);

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

  const handleCoffeeShopsFound = useCallback((shops, grouped, groupedMeta, fallbackFoodResults) => {
    setCoffeeShops(shops || []);
    setCoffeeShopGroups(grouped || null);
    setCoffeeShopGroupMeta(groupedMeta || null);
    setFallbackFood(fallbackFoodResults || null);
    setDismissedFallbackKeys([]);
    setFallbackModal(null);
    setShowCoffeeModal(Array.isArray(shops) && shops.length > 0);
  }, []);

  const addShopToRoute = useCallback(async (shop, insertAfterIndex) => {
    if (!routeData?.stops || routeData.stops.length < 2) {
      setError('No active route to add a stop to.');
      return;
    }

    const maxInsertIndex = Math.max(0, routeData.stops.length - 2);
    const safeInsertAfterIndex = Math.min(
      Math.max(0, insertAfterIndex ?? maxInsertIndex),
      maxInsertIndex
    );

    const shopStop = {
      name: shop.name,
      lat: shop.location.lat,
      lng: shop.location.lng,
      formattedAddress: shop.address || shop.vicinity,
      isCoffeeShop: true
    };

    const alreadyIncluded = routeData.stops.some((stop) => (
      Math.abs(Number(stop.lat) - shopStop.lat) < 1e-6 &&
      Math.abs(Number(stop.lng) - shopStop.lng) < 1e-6
    ));

    if (alreadyIncluded) {
      setStatusMessage('That stop is already on your route.');
      return;
    }

    const newStops = [...routeData.stops];
    newStops.splice(safeInsertAfterIndex + 1, 0, shopStop);

    const stopQueries = newStops.map((s) => ({
      original: s.name,
      searchQuery: s.formattedAddress || s.name,
      type: 'landmark',
      parsed: { landmark: s.name },
      confidence: 1.0
    }));

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: stopQueries })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update route');
      }

      if (data.success && data.route) {
        data.route.stops = data.route.stops.map((s) => {
          if (s.name === shop.name || s.formattedAddress?.includes(shop.name)) {
            return { ...s, isCoffeeShop: true };
          }
          return s;
        });
        setRouteData(data.route);
        setStatusMessage(`${shop.name} added to your route.`);
      }
    } catch (err) {
      console.error('Failed to add coffee shop:', err);
      setError(err.message || 'Failed to add stop');
    } finally {
      setLoading(false);
    }
  }, [routeData]);

  const handleConfirmPendingCoffeeShop = useCallback(() => {
    if (!pendingCoffeeShop) return;
    addShopToRoute(pendingCoffeeShop.shop, pendingCoffeeShop.insertAfterIndex);
    setPendingCoffeeShop(null);
  }, [pendingCoffeeShop, addShopToRoute]);

  const handleCancelPendingCoffeeShop = useCallback(() => {
    setPendingCoffeeShop(null);
  }, []);

  // Find insertion index by calculating closest non-coffee-shop stop to user location
  // Then scan past any consecutive coffee shops already added after that stop
  const findInsertIndexAfterCurrentLocation = useCallback(() => {
    if (!routeData?.stops || routeData.stops.length < 2) return 0;

    if (!userLocation) {
      return Math.max(0, routeData.stops.length - 2);
    }

    const stops = routeData.stops;
    let closestIndex = 0;
    let minDistance = Infinity;

    // Check all stops except destination, skipping coffee shop stops
    for (let i = 0; i < stops.length - 1; i++) {
      if (stops[i].isCoffeeShop) continue;

      const lat = Number(stops[i].lat);
      const lng = Number(stops[i].lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const dist = calculateDistance(
        userLocation.lat, userLocation.lng,
        lat, lng
      );

      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    // Scan forward past consecutive coffee shops already added after closest stop
    let insertAfter = closestIndex;
    while (
      insertAfter + 1 < stops.length - 1 &&
      stops[insertAfter + 1]?.isCoffeeShop
    ) {
      insertAfter++;
    }

    return insertAfter;
  }, [routeData, userLocation]);

  // Distance-based handler: calculates closest stop, inserts after it
  const handleModalAddShop = useCallback((shop) => {
    const insertAfterIndex = findInsertIndexAfterCurrentLocation();
    addShopToRoute(shop, insertAfterIndex);
    setShowCoffeeModal(false);
  }, [findInsertIndexAfterCurrentLocation, addShopToRoute]);

  const handleCloseFallbackModal = useCallback(() => {
    if (fallbackModal?.key) {
      setDismissedFallbackKeys((prev) => [...prev, fallbackModal.key]);
    }
    setFallbackModal(null);
  }, [fallbackModal]);

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
              onAddCoffeeShop={handleModalAddShop}
            />
          )}
        </div>
      </main>

      {pendingCoffeeShop && (
        <div className="coffee-popup-overlay" onClick={handleCancelPendingCoffeeShop}>
          <div className="coffee-popup" onClick={(event) => event.stopPropagation()}>
            <div className="coffee-popup-header">
              <h3>Confirm Coffee Stop</h3>
              <button
                className="coffee-popup-close"
                onClick={handleCancelPendingCoffeeShop}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="coffee-popup-note">
              Found a coffee shop {pendingCoffeeShop.placementLabel ? `(${pendingCoffeeShop.placementLabel})` : ''}.
              Add it to your route?
            </div>
            <div className="coffee-popup-list">
              <div className="coffee-popup-item coffee-popup-item--static">
                <div className="coffee-popup-name">{pendingCoffeeShop.shop.name}</div>
                <div className="coffee-popup-address">
                  {pendingCoffeeShop.shop.address || pendingCoffeeShop.shop.vicinity || 'Address unavailable'}
                </div>
                <div className="coffee-popup-meta">
                  <span>
                    ★ {pendingCoffeeShop.shop.rating ? pendingCoffeeShop.shop.rating.toFixed(1) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
            <div className="coffee-popup-actions">
              <button
                className="coffee-popup-btn coffee-popup-btn-secondary"
                type="button"
                onClick={handleCancelPendingCoffeeShop}
              >
                Cancel
              </button>
              <button
                className="coffee-popup-btn coffee-popup-btn-primary"
                type="button"
                onClick={handleConfirmPendingCoffeeShop}
              >
                Add to Route
              </button>
            </div>
          </div>
        </div>
      )}

      <CoffeeShopModal
        isOpen={showCoffeeModal}
        onClose={() => setShowCoffeeModal(false)}
        grouped={coffeeShopGroups}
        groupedMeta={coffeeShopGroupMeta}
        onAddShop={handleModalAddShop}
      />

      {fallbackModal && (
        <div className="coffee-popup-overlay" onClick={handleCloseFallbackModal}>
          <div className="coffee-popup" onClick={(event) => event.stopPropagation()}>
            <div className="coffee-popup-header">
              <h3>{fallbackModal.label}: No Open Coffee Shops</h3>
              <button
                className="coffee-popup-close"
                onClick={handleCloseFallbackModal}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="coffee-popup-note">
              Here are other food options nearby.
            </div>
            <div className="coffee-popup-list">
              {fallbackModal.shops.map((shop) => (
                <div key={shop.placeId} className="coffee-popup-item">
                  <div className="coffee-popup-name">{shop.name}</div>
                  <div className="coffee-popup-meta">
                    <span>{shop.distance || 'N/A'}</span>
                    <span>★ {shop.rating ? shop.rating.toFixed(1) : 'N/A'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
