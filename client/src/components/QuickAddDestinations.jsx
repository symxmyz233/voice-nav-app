import { useRecentPlaces } from '../contexts/RecentPlacesContext';
import './QuickAddDestinations.css';

export default function QuickAddDestinations({ onAddStop }) {
  const { recentPlaces, removePlace } = useRecentPlaces();

  if (recentPlaces.length === 0) {
    return null;
  }

  return (
    <div className="quick-add-destinations">
      <div className="quick-add-header">
        <span className="quick-add-label">Quick Add:</span>
      </div>
      <div className="quick-add-chips">
        {recentPlaces.slice(0, 8).map((place, index) => {
          const placeKey = place.id || `${place.lat}-${place.lng}-${index}`;
          return (
            <div key={placeKey} className="quick-add-chip">
              <button
                className="quick-add-main"
                onClick={() => onAddStop(place)}
                title={`Add ${place.name} to route`}
                type="button"
              >
                📍 {place.name}
              </button>
              <button
                className="quick-add-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  removePlace(place.id || placeKey);
                }}
                aria-label={`Delete ${place.name}`}
                title={`Delete ${place.name}`}
                type="button"
              >
                x
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
