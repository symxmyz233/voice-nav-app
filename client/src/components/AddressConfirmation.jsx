import { useState } from 'react';
import './AddressConfirmation.css';

function AddressConfirmation({ stops, transcript, onConfirm, onCancel }) {
  const [editedStops, setEditedStops] = useState(
    stops.map(stop => ({
      ...stop,
      editedQuery: stop.searchQuery || stop.original,
      selectedAlternativeIndex: stop.hasAlternatives ? 0 : null // Default to first option
    }))
  );

  const handleStopEdit = (index, newValue) => {
    const updated = [...editedStops];
    updated[index].editedQuery = newValue;
    setEditedStops(updated);
  };

  const handleAlternativeSelect = (stopIndex, alternativeIndex) => {
    const updated = [...editedStops];
    updated[stopIndex].selectedAlternativeIndex = alternativeIndex;
    setEditedStops(updated);
  };

  const handleConfirm = () => {
    // Return edited stops with updated searchQuery and selected coordinates
    const confirmed = editedStops.map(stop => {
      const baseStop = {
        ...stop,
        searchQuery: stop.editedQuery,
        original: stop.editedQuery
      };

      // If user selected an alternative, use those coordinates
      if (stop.hasAlternatives && stop.selectedAlternativeIndex !== null) {
        const selected = stop.alternativeResults[stop.selectedAlternativeIndex];
        return {
          ...baseStop,
          lat: selected.lat,
          lng: selected.lng,
          formattedAddress: selected.formattedAddress,
          placeId: selected.placeId,
          geocodingSource: selected.source
        };
      }

      return baseStop;
    });
    onConfirm(confirmed);
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return '#22c55e';
    if (confidence >= 0.6) return '#eab308';
    return '#ef4444';
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <div className="address-confirmation-overlay">
      <div className="address-confirmation-dialog">
        <h3>⚠️ Please Confirm Addresses</h3>

        {transcript && (
          <div className="transcript-display">
            <strong>You said:</strong> "{transcript}"
          </div>
        )}

        <p className="confirmation-message">
          Some addresses have low confidence. Please verify and edit if needed:
        </p>

        <div className="stops-confirmation-list">
          {editedStops.map((stop, index) => (
            <div key={index} className="stop-confirmation-item">
              <div className="stop-header">
                <span className="stop-number">{index + 1}</span>
                <span
                  className="confidence-badge"
                  style={{
                    backgroundColor: getConfidenceColor(stop.confidence),
                    color: 'white'
                  }}
                >
                  {getConfidenceLabel(stop.confidence)} ({Math.round(stop.confidence * 100)}%)
                </span>
              </div>

              <div className="stop-original">
                Original: "{stop.original}"
              </div>

              <input
                type="text"
                className="stop-edit-input"
                value={stop.editedQuery}
                onChange={(e) => handleStopEdit(index, e.target.value)}
                placeholder="Edit address if needed"
              />

              {stop.type && (
                <div className="stop-type-info">
                  Type: {stop.type}
                </div>
              )}

              {/* Show alternative geocoding results if available */}
              {stop.hasAlternatives && stop.alternativeResults && (
                <div className="alternatives-section">
                  <div className="alternatives-header">
                    ⚠️ Multiple locations found - please select the correct one:
                  </div>
                  <div className="alternatives-list">
                    {stop.alternativeResults.map((alt, altIndex) => (
                      <label
                        key={altIndex}
                        className={`alternative-option ${
                          stop.selectedAlternativeIndex === altIndex ? 'selected' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name={`alternative-${index}`}
                          checked={stop.selectedAlternativeIndex === altIndex}
                          onChange={() => handleAlternativeSelect(index, altIndex)}
                        />
                        <div className="alternative-details">
                          <div className="alternative-source">{alt.source}</div>
                          <div className="alternative-address">{alt.formattedAddress}</div>
                          <div className="alternative-coords">
                            📍 {alt.lat.toFixed(6)}, {alt.lng.toFixed(6)}
                          </div>
                          {alt.distanceWarning && (
                            <div className="distance-warning">
                              ⚠️ {alt.distanceWarning.distance.toFixed(1)}km from expected location
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="confirmation-actions">
          <button
            className="btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn-confirm"
            onClick={handleConfirm}
          >
            Confirm & Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddressConfirmation;
