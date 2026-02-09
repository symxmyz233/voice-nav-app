import { useState } from 'react';
import { useRecentPlaces } from '../contexts/RecentPlacesContext';
import './RecentPlacesList.css';

export default function RecentPlacesList({ onSelectPlace }) {
  const { recentPlaces, removePlace } = useRecentPlaces();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="recent-places-list">
      <button
        className="recent-places-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="recent-places-toggle-left">
          <span>Recent Places</span>
          <span className="recent-places-count">{recentPlaces.length}</span>
        </span>
        <span className={`recent-places-arrow ${isOpen ? 'open' : ''}`}>&#9662;</span>
      </button>
      {isOpen && (
        <div className="recent-places-dropdown">
          {recentPlaces.length === 0 ? (
            <div className="recent-places-empty">
              <p>No recent places yet. Create routes to see your history here!</p>
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
