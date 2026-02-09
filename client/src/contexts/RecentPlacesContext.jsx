import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const RecentPlacesContext = createContext(null);

const STORAGE_KEY_PREFIX = 'voice-nav-recent-places';
const MAX_PLACES = 50; // Keep last 50 unique places

export function RecentPlacesProvider({ children }) {
  const { currentUser } = useAuth();
  const [recentPlaces, setRecentPlaces] = useState([]);

  // Get storage key for current user
  const getStorageKey = () => {
    if (currentUser && currentUser.username) {
      return `${STORAGE_KEY_PREFIX}-${currentUser.username}`;
    }
    return `${STORAGE_KEY_PREFIX}-guest`;
  };

  // Load from localStorage when user changes
  useEffect(() => {
    try {
      const storageKey = getStorageKey();
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const places = JSON.parse(stored);
        const normalized = Array.isArray(places)
          ? places.map((place) => {
              const lat = place?.lat;
              const lng = place?.lng;
              const id = place?.id || place?.placeId || (lat !== undefined && lng !== undefined ? `${lat}-${lng}` : null);
              return {
                id,
                name: place?.name || 'Unknown',
                lat,
                lng,
                placeId: place?.placeId,
                timestamp: place?.timestamp || Date.now()
              };
            }).filter((place) => place.id)
          : [];
        setRecentPlaces(normalized);
        console.log(`Loaded ${normalized.length} recent places for user:`, currentUser?.username || 'guest');
      } else {
        setRecentPlaces([]);
        console.log('No saved places for user:', currentUser?.username || 'guest');
      }
    } catch (error) {
      console.error('Failed to load recent places from localStorage:', error);
      setRecentPlaces([]);
    }
  }, [currentUser?.username]);

  // Save to localStorage whenever recentPlaces changes
  useEffect(() => {
    try {
      const storageKey = getStorageKey();
      localStorage.setItem(storageKey, JSON.stringify(recentPlaces));
    } catch (error) {
      console.error('Failed to save recent places to localStorage:', error);
    }
  }, [recentPlaces, currentUser?.username]);

  // Add places from a route
  const addPlacesFromRoute = (routeData) => {
    if (!routeData || !routeData.stops || routeData.stops.length === 0) {
      console.log('No stops in route data');
      return;
    }

    const newPlaces = [];

    routeData.stops.forEach((stop, index) => {
      // Create unique ID
      const id = stop.placeId || `${stop.lat}-${stop.lng}`;

      // Determine type
      // Extract display name
      let displayName = stop.name || stop.original || 'Unknown';

      // Simplify address names
      if (stop.type === 'full_address' && displayName) {
        const parts = displayName.split(/[,\s]+/);
        if (parts[0] && isNaN(parts[0])) {
          displayName = parts[0]; // Business name
        } else if (parts.length > 1) {
          displayName = parts[1]; // Street name
        }
      }

      if (stop.lat === undefined || stop.lng === undefined) {
        return;
      }

      newPlaces.push({
        id,
        name: displayName.trim().substring(0, 50),
        lat: stop.lat,
        lng: stop.lng,
        placeId: stop.placeId,
        timestamp: Date.now()
      });
    });

    console.log('Adding places from route:', newPlaces);

    // Merge with existing places, remove duplicates
    setRecentPlaces(prevPlaces => {
      const placesMap = new Map();

      // Add new places first (most recent)
      newPlaces.forEach(place => {
        placesMap.set(place.id, place);
      });

      // Add existing places (older)
      prevPlaces.forEach(place => {
        const lat = place?.lat;
        const lng = place?.lng;
        const id = place?.id || place?.placeId || (lat !== undefined && lng !== undefined ? `${lat}-${lng}` : null);
        if (!id || placesMap.has(id)) return;
        if (lat === undefined || lng === undefined) return;

        placesMap.set(id, {
          id,
          name: place?.name || 'Unknown',
          lat,
          lng,
          placeId: place?.placeId,
          timestamp: place?.timestamp || Date.now()
        });
      });

      // Convert to array, sort by timestamp (newest first), limit to MAX_PLACES
      const merged = Array.from(placesMap.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_PLACES);

      console.log('Updated recent places:', merged.length);
      return merged;
    });
  };

  // Clear all places
  const clearRecentPlaces = () => {
    setRecentPlaces([]);
    const storageKey = getStorageKey();
    localStorage.removeItem(storageKey);
  };

  // Remove a specific place
  const removePlace = (id) => {
    setRecentPlaces(prevPlaces => prevPlaces.filter(p => p.id !== id));
  };

  return (
    <RecentPlacesContext.Provider value={{
      recentPlaces,
      addPlacesFromRoute,
      clearRecentPlaces,
      removePlace
    }}>
      {children}
    </RecentPlacesContext.Provider>
  );
}

export function useRecentPlaces() {
  const context = useContext(RecentPlacesContext);
  if (!context) {
    throw new Error('useRecentPlaces must be used within RecentPlacesProvider');
  }
  return context;
}
