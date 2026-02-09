import { useHistory } from '../contexts/HistoryContext';
import './QuickStartPanel.css';

export default function QuickStartPanel({ onSelectDestination }) {
  const { recentDestinations, loading } = useHistory();

  if (loading) {
    return <div className="quick-start-loading">Loading...</div>;
  }

  if (loading) {
    return <div className="quick-start-loading">Loading...</div>;
  }

  if (recentDestinations.length === 0) {
    return (
      <div className="quick-start-empty">
        <p>No recent destinations yet.</p>
        <p>Start by using voice navigation to create your first route!</p>
      </div>
    );
  }

  return (
    <div className="quick-start-panel">
      <div className="quick-start-section">
        <h3>📍 Recent Destinations</h3>
        <p className="quick-start-hint">Click any destination to navigate there from your current location</p>
        <div className="destination-list">
          {recentDestinations.map((dest, index) => (
            <button
              key={`${dest.lat}-${dest.lng}-${index}`}
              className="destination-button"
              onClick={() => onSelectDestination(dest)}
              title={dest.formattedAddress || dest.name}
            >
              <span className="destination-name">{dest.name}</span>
              <span className="destination-arrow">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
