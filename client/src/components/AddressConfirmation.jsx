import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './AddressConfirmation.css';

function AddressConfirmation({ stops, confirmationStopIndexes = [], transcript, onConfirm, onCancel }) {
  const [editedStops, setEditedStops] = useState(
    stops.map((stop, originalIndex) => ({
      ...stop,
      originalIndex,
      selectedAlternativeIndex: stop.hasAlternatives ? 0 : null // Default to first option
    }))
  );
  const [editingStopIndex, setEditingStopIndex] = useState(null);
  const [editText, setEditText] = useState('');
  const [recordingStopIndex, setRecordingStopIndex] = useState(null);
  const [processingStopIndex, setProcessingStopIndex] = useState(null);
  const [voiceError, setVoiceError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const activeMimeTypeRef = useRef('audio/webm');

  const confirmationIndexSet = useMemo(() => {
    if (Array.isArray(confirmationStopIndexes) && confirmationStopIndexes.length > 0) {
      const validIndexes = confirmationStopIndexes
        .map((index) => Number(index))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < editedStops.length);
      if (validIndexes.length > 0) {
        return new Set(validIndexes);
      }
    }
    return new Set(editedStops.map((stop) => stop.originalIndex));
  }, [confirmationStopIndexes, editedStops]);

  const displayedStops = useMemo(
    () => editedStops.filter((stop) => confirmationIndexSet.has(stop.originalIndex)),
    [editedStops, confirmationIndexSet]
  );

  const startEditing = (originalIndex, currentText) => {
    setEditingStopIndex(originalIndex);
    setEditText(currentText);
  };

  const cancelEditing = () => {
    setEditingStopIndex(null);
    setEditText('');
  };

  const applyTextEdit = (originalIndex) => {
    const trimmed = editText.trim();
    if (!trimmed) return;

    setEditedStops((prev) => {
      const updated = [...prev];
      updated[originalIndex] = {
        ...updated[originalIndex],
        searchQuery: trimmed,
        original: trimmed,
        hasAlternatives: false,
        alternativeResults: null,
        selectedAlternativeIndex: null,
        // Clear stale coordinates so backend re-geocodes
        lat: undefined,
        lng: undefined,
        formattedAddress: undefined,
        placeId: undefined,
      };
      return updated;
    });

    setEditingStopIndex(null);
    setEditText('');
  };

  const handleAlternativeSelect = (originalIndex, alternativeIndex) => {
    const updated = [...editedStops];
    updated[originalIndex].selectedAlternativeIndex = alternativeIndex;
    setEditedStops(updated);
  };

  const applyRespokenStop = useCallback((originalIndex, stopFromVoice) => {
    setEditedStops((prevStops) => {
      if (!prevStops[originalIndex]) return prevStops;

      const updated = [...prevStops];
      const currentStop = updated[originalIndex];

      const mergedStop = {
        ...currentStop,
        ...stopFromVoice,
        originalIndex,
        needsConfirmation: true,
        selectedAlternativeIndex: stopFromVoice?.hasAlternatives ? 0 : null
      };

      // If this is a newly parsed stop without geocoded coords, clear stale coords.
      if (!Number.isFinite(Number(stopFromVoice?.lat)) || !Number.isFinite(Number(stopFromVoice?.lng))) {
        delete mergedStop.lat;
        delete mergedStop.lng;
        delete mergedStop.formattedAddress;
        delete mergedStop.placeId;
      }

      updated[originalIndex] = mergedStop;
      return updated;
    });
  }, []);

  const sendRespokenStopAudio = useCallback(async (originalIndex, audioBlob) => {
    setProcessingStopIndex(originalIndex);
    setVoiceError(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'reconfirm-stop.webm');

      const response = await fetch('/api/reconfirm-stop', {
        method: 'POST',
        body: formData
      });

      const text = await response.text();
      if (!text) {
        throw new Error('Empty response from server');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error(`Invalid JSON response: ${text.substring(0, 120)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process re-spoken stop');
      }

      if (!data.stop) {
        throw new Error('No stop was extracted from your voice input');
      }

      applyRespokenStop(originalIndex, data.stop);
    } catch (error) {
      setVoiceError(error.message || 'Failed to process voice input');
    } finally {
      setProcessingStopIndex(null);
    }
  }, [applyRespokenStop]);

  const startRecordingForStop = useCallback(async (originalIndex) => {
    if (recordingStopIndex !== null || processingStopIndex !== null) return;

    try {
      setVoiceError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      activeMimeTypeRef.current = preferredMimeType;

      const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: activeMimeTypeRef.current });
        chunksRef.current = [];

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        mediaRecorderRef.current = null;
        await sendRespokenStopAudio(originalIndex, audioBlob);
      };

      recorder.start();
      setRecordingStopIndex(originalIndex);
    } catch (error) {
      setVoiceError('Could not access microphone. Please check permissions.');
    }
  }, [processingStopIndex, recordingStopIndex, sendRespokenStopAudio]);

  const stopRecordingForStop = useCallback((originalIndex) => {
    if (recordingStopIndex !== originalIndex) return;
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    setRecordingStopIndex(null);
  }, [recordingStopIndex]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const getParsedAddressText = (stop) => (
    stop.searchQuery || stop.formattedAddress || stop.original || stop.name || 'Unknown stop'
  );

  const handleConfirm = () => {
    // Return the full stop list, editing only the targeted confirmation stops.
    const confirmed = editedStops.map(stop => {
      const { selectedAlternativeIndex, originalIndex, ...cleanStop } = stop;
      const baseStop = { ...cleanStop };

      // If user selected an alternative, use those coordinates
      if (
        stop.hasAlternatives &&
        selectedAlternativeIndex !== null &&
        stop.alternativeResults &&
        stop.alternativeResults[selectedAlternativeIndex]
      ) {
        const selected = stop.alternativeResults[selectedAlternativeIndex];
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
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) return '#64748b';
    if (confidence >= 0.8) return '#22c55e';
    if (confidence >= 0.6) return '#eab308';
    return '#ef4444';
  };

  const getConfidenceLabel = (confidence) => {
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) return 'Review';
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
          Some addresses need confirmation. Please verify and edit if needed:
        </p>

        <div className="stops-confirmation-list">
          {displayedStops.map((stop) => (
            <div key={stop.originalIndex} className="stop-confirmation-item">
              <div className="stop-header">
                <span className="stop-number">{stop.originalIndex + 1}</span>
                <span
                  className="confidence-badge"
                  style={{
                    backgroundColor: getConfidenceColor(stop.confidence),
                    color: 'white'
                  }}
                >
                  {getConfidenceLabel(stop.confidence)} {typeof stop.confidence === 'number' ? `(${Math.round(stop.confidence * 100)}%)` : ''}
                </span>
              </div>

              <div className="stop-original">
                Original: "{stop.original}"
              </div>

              {stop.needsConfirmation && stop.confirmationReason && (
                <div className="distance-warning">
                  ⚠️ {stop.confirmationReason}
                </div>
              )}

              <div className="parsed-stop-display">
                <div className="parsed-stop-label">Parsed Stop</div>
                {editingStopIndex === stop.originalIndex ? (
                  <div className="edit-address-section">
                    <input
                      type="text"
                      className="edit-address-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyTextEdit(stop.originalIndex);
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      autoFocus
                      placeholder="Type a new address..."
                    />
                    <div className="edit-address-actions">
                      <button
                        type="button"
                        className="edit-address-save"
                        onClick={() => applyTextEdit(stop.originalIndex)}
                        disabled={!editText.trim()}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="edit-address-cancel"
                        onClick={cancelEditing}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="parsed-stop-value-row">
                    <div className="parsed-stop-value">{getParsedAddressText(stop)}</div>
                    <button
                      type="button"
                      className="edit-address-button"
                      onClick={() => startEditing(stop.originalIndex, getParsedAddressText(stop))}
                      title="Edit address"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              <div className="revoice-section">
                <button
                  type="button"
                  className={`revoice-button ${recordingStopIndex === stop.originalIndex ? 'recording' : ''}`}
                  onClick={() => (
                    recordingStopIndex === stop.originalIndex
                      ? stopRecordingForStop(stop.originalIndex)
                      : startRecordingForStop(stop.originalIndex)
                  )}
                  disabled={
                    processingStopIndex === stop.originalIndex ||
                    (processingStopIndex !== null && processingStopIndex !== stop.originalIndex) ||
                    (recordingStopIndex !== null && recordingStopIndex !== stop.originalIndex)
                  }
                >
                  {processingStopIndex === stop.originalIndex
                    ? 'Processing...'
                    : recordingStopIndex === stop.originalIndex
                    ? 'Stop Recording'
                    : 'Speak Stop Again'}
                </button>
                <div className="revoice-hint">
                  Or use voice to re-speak this stop.
                </div>
              </div>

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
                          name={`alternative-${stop.originalIndex}`}
                          checked={stop.selectedAlternativeIndex === altIndex}
                          onChange={() => handleAlternativeSelect(stop.originalIndex, altIndex)}
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

        {voiceError && (
          <div className="voice-error-message">
            {voiceError}
          </div>
        )}

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
