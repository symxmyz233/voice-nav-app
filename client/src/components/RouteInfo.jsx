import { useState } from 'react';

function RouteInfo({ route, onRemoveStop, onEditStop }) {
  const [expandedLeg, setExpandedLeg] = useState(null);
  const [editingStop, setEditingStop] = useState(null);
  const [editValue, setEditValue] = useState('');

  if (!route) return null;

  const toggleLeg = (index) => {
    setExpandedLeg(expandedLeg === index ? null : index);
  };

  const getStopType = (index, total) => {
    if (index === 0) return 'start';
    if (index === total - 1) return 'end';
    return 'waypoint';
  };

  const getStopLabel = (index, total) => {
    if (index === 0) return 'Start';
    if (index === total - 1) return 'End';
    return `Stop ${index}`;
  };

  const getAddressTypeLabel = (type) => {
    const labels = {
      'full_address': 'Address',
      'landmark': 'Landmark',
      'partial': 'Partial',
      'relative': 'Relative'
    };
    return labels[type] || type;
  };

  const getConfidenceColor = (confidence) => {
    if (!confidence) return '#9ca3af';
    if (confidence >= 0.8) return '#22c55e';
    if (confidence >= 0.6) return '#eab308';
    return '#ef4444';
  };

  const handleStartEdit = (index, currentName) => {
    setEditingStop(index);
    setEditValue(currentName);
  };

  const handleCancelEdit = () => {
    setEditingStop(null);
    setEditValue('');
  };

  const handleSaveEdit = (index) => {
    if (editValue.trim() && onEditStop) {
      onEditStop(index, editValue.trim());
    }
    setEditingStop(null);
    setEditValue('');
  };

  const handleRemove = (index) => {
    if (onRemoveStop) {
      onRemoveStop(index);
    }
  };

  return (
    <div className="route-info">
      <h2>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-1.447-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        Route Overview
      </h2>

      {/* Totals */}
      <div className="route-totals">
        <div className="total-item">
          <span className="total-label">Total Distance</span>
          <span className="total-value">{route.totals?.distance?.text || 'N/A'}</span>
        </div>
        <div className="total-item">
          <span className="total-label">Total Duration</span>
          <span className="total-value">{route.totals?.duration?.text || 'N/A'}</span>
        </div>
      </div>

      {/* Stops */}
      <div className="stops-list">
        <h3>Stops ({Array.isArray(route.stops) ? route.stops.length : 0})</h3>
        {Array.isArray(route.stops) && route.stops.map((stop, index) => (
          <div key={`stop-${index}`} className="stop-item">
            <div className={`stop-marker ${getStopType(index, route.stops.length)}`}>
              {String.fromCharCode(65 + index)}
            </div>
            <div className="stop-details">
              {editingStop === index ? (
                // Edit mode
                <div className="stop-edit-mode">
                  <input
                    type="text"
                    className="stop-edit-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveEdit(index);
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    autoFocus
                  />
                  <div className="stop-edit-actions">
                    <button
                      className="btn-save-edit"
                      onClick={() => handleSaveEdit(index)}
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      className="btn-cancel-edit"
                      onClick={handleCancelEdit}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div className="stop-header-row">
                    <div className="stop-name">
                      {getStopLabel(index, route.stops.length)}: {stop.name}
                      {stop.type && (
                        <span className="address-type-badge" style={{
                          marginLeft: '8px',
                          fontSize: '0.7rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#e5e7eb',
                          color: '#4b5563'
                        }}>
                          {getAddressTypeLabel(stop.type)}
                        </span>
                      )}
                    </div>
                    <div className="stop-actions">
                      <button
                        className="btn-edit-stop"
                        onClick={() => handleStartEdit(index, stop.name)}
                        title="Edit address"
                      >
                        ✏️
                      </button>
                      {route.stops.length > 2 && (
                        <button
                          className="btn-remove-stop"
                          onClick={() => handleRemove(index)}
                          title="Remove stop"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="stop-address">{stop.formattedAddress}</div>
                  {stop.confidence && (
                    <div className="stop-confidence" style={{
                      fontSize: '0.75rem',
                      color: getConfidenceColor(stop.confidence),
                      marginTop: '2px'
                    }}>
                      Confidence: {Math.round(stop.confidence * 100)}%
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legs */}
      {Array.isArray(route.legs) && route.legs.length > 0 && (
        <div className="legs-list">
          <h3>Route Legs</h3>
          {route.legs.map((leg, index) => (
            <div
              key={`leg-${index}`}
              className={`leg-item ${expandedLeg === index ? 'expanded' : ''}`}
            >
              <div className="leg-header">
                <span className="leg-route">
                  {String.fromCharCode(65 + index)} → {String.fromCharCode(66 + index)}
                </span>
                <span className="leg-stats">
                  {leg.distance?.text} • {leg.duration?.text}
                </span>
              </div>

              <button
                className="expand-button"
                onClick={() => toggleLeg(index)}
              >
                {expandedLeg === index ? 'Hide directions' : 'Show directions'}
              </button>

              <div className="leg-steps">
                {leg.steps?.map((step, stepIndex) => (
                  <div key={`step-${stepIndex}`} className="step-item">
                    {step.instruction} ({step.distance?.text})
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RouteInfo;
