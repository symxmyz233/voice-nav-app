import { useRecentPlaces } from '../contexts/RecentPlacesContext';
import './RecentPlacesList.css';

export default function RecentPlacesList({ onSelectPlace }) {
  const { recentPlaces, removePlace } = useRecentPlaces();

  if (recentPlaces.length === 0) {
    return (
      <div className="recent-places-list">
        <div className="recent-places-header">
          <h3>📍 Recent Places</h3>
        </div>
        <div className="recent-places-empty">
          <p>No recent places yet.</p>
          <p>Create routes to see your history here!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recent-places-list">
      <div className="recent-places-header">
        <h3>📍 Recent Places</h3>
        <span className="recent-places-count">{recentPlaces.length} places</span>
      </div>
      <div className="recent-places-grid">
        {recentPlaces.map((place, index) => {
          const placeKey = place.id || `${place.lat}-${place.lng}-${index}`;
          return (
            <div key={placeKey} className="recent-place-card">
              <button
                className="recent-place-main"
                onClick={() => onSelectPlace(place)}
                title={place.name}
              >
                <div className="place-icon">📍</div>
                <div className="place-info">
                  <div className="place-name">{place.name}</div>
                </div>
              </button>
              <button
                className="recent-place-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  removePlace(place.id || placeKey);
                }}
                aria-label={`Delete ${place.name}`}
                title={`Delete ${place.name}`}
                type="button"
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
