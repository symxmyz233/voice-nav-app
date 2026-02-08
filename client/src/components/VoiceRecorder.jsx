import { useState, useRef, useCallback } from 'react';

function VoiceRecorder({ onResult, onError, onLoadingChange, currentRoute = null, userLocation = null }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const sendAudioToBackend = useCallback(async (audioBlob) => {
    setIsProcessing(true);
    onLoadingChange(true);

    console.log('🎤 Sending audio to backend with context:', {
      hasCurrentRoute: !!currentRoute,
      stopsCount: currentRoute?.stops?.length || 0,
      stopNames: currentRoute?.stops?.map(s => s.name || s.address).join(' → ') || 'none',
      hasUserLocation: !!userLocation,
      userLocation: userLocation ? `${userLocation.lat}, ${userLocation.lng}` : 'none'
    });

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      // Include current route context if available
      if (currentRoute) {
        formData.append('currentRoute', JSON.stringify(currentRoute));
        console.log('✅ Current route added to FormData');
      } else {
        console.log('⚠️ No current route - creating new route');
      }

      // Include user location if available
      if (userLocation) {
        formData.append('userLocation', JSON.stringify(userLocation));
        console.log('✅ User location added to FormData:', userLocation);
      }

      const response = await fetch('/api/process-voice', {
        method: 'POST',
        body: formData
      });

      const text = await response.text();
      console.log('Server response:', text);

      if (!text) {
        throw new Error('Empty response from server');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process audio');
      }

      onResult(data);
    } catch (err) {
      console.error('Error sending audio:', err);
      onError(err.message || 'Failed to process voice input');
    } finally {
      setIsProcessing(false);
      onLoadingChange(false);
    }
  }, [currentRoute, userLocation, onLoadingChange, onResult, onError]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());

        // Send to backend
        await sendAudioToBackend(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      onError('Could not access microphone. Please check permissions.');
    }
  }, [onError, sendAudioToBackend]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="voice-recorder">
      <h2>Voice Input</h2>

      <button
        className={`record-button ${isRecording ? 'recording' : ''}`}
        onClick={handleClick}
        disabled={isProcessing}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        <svg className="mic-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          {isRecording ? (
            <rect x="6" y="6" width="12" height="12" rx="2" />
          ) : (
            <>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="white" strokeWidth="2" />
              <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" />
              <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" />
            </>
          )}
        </svg>
      </button>

      <p className={`record-status ${isRecording ? 'recording' : ''}`}>
        {isProcessing
          ? 'Processing...'
          : isRecording
          ? 'Recording... Click to stop'
          : 'Click to start recording'}
      </p>

      <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '10px' }}>
        {currentRoute
          ? 'Examples: "Add a stop at Times Square" or "Add Starbucks between stop 1 and 2"'
          : 'Example: "Navigate from San Francisco to Los Angeles with a stop in San Jose"'}
      </p>
    </div>
  );
}

export default VoiceRecorder;
