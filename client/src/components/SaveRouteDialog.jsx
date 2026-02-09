import { useState } from 'react';
import { useHistory } from '../contexts/HistoryContext';
import './SaveRouteDialog.css';

export default function SaveRouteDialog({ stops, onClose, onSaved }) {
  const { saveRoute } = useHistory();
  const [routeName, setRouteName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!routeName.trim()) {
      setError('Please enter a route name');
      return;
    }

    setSaving(true);
    const result = await saveRoute(routeName.trim(), stops);
    setSaving(false);

    if (result.success) {
      onSaved && onSaved();
      onClose();
    } else {
      setError(result.error || 'Failed to save route');
    }
  };

  const routePreview = stops.map(s => s.name || s.formattedAddress || 'Unknown').join(' → ');

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Save Route</h2>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          <div className="route-preview-text">
            {routePreview}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="routeName">Route Name</label>
              <input
                id="routeName"
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="e.g., Daily Commute, Weekend Trip"
                className="dialog-input"
                autoFocus
                disabled={saving}
              />
            </div>

            {error && <div className="dialog-error">{error}</div>}

            <div className="dialog-actions">
              <button
                type="button"
                onClick={onClose}
                className="dialog-button dialog-button-cancel"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="dialog-button dialog-button-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Route'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
