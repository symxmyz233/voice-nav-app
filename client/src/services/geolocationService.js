/**
 * Browser Geolocation API wrapper for real-time location tracking.
 */

/**
 * Get the user's current position (one-shot).
 * @returns {Promise<{lat: number, lng: number}>}
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Location permission denied. Please allow location access to find nearby coffee shops.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location information is unavailable.'));
            break;
          case error.TIMEOUT:
            reject(new Error('Location request timed out. Please try again.'));
            break;
          default:
            reject(new Error('An unknown error occurred while getting your location.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  });
}

/**
 * Continuously watch the user's position.
 * @param {function({lat: number, lng: number})} onUpdate - Called with each position update
 * @param {function(Error)} onError - Called on error
 * @returns {number} watchId - Pass to clearWatch() to stop tracking
 */
export function watchUserPosition(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError(new Error('Geolocation is not supported by this browser'));
    return null;
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      onUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
    },
    (error) => {
      onError(new Error(error.message || 'Location tracking error'));
    },
    {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 10000
    }
  );
}

/**
 * Stop watching the user's position.
 * @param {number} watchId - The ID returned by watchUserPosition
 */
export function clearWatch(watchId) {
  if (watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
}
