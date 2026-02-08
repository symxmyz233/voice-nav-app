import { useState, useEffect } from 'react';

function VoiceBufferList({ onResult, onError, onLoadingChange, userLocation = null }) {
  const [buffers, setBuffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingFile, setSendingFile] = useState(null);

  useEffect(() => {
    fetch('/api/voice-buffers')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setBuffers(data.buffers);
        } else {
          setError('Failed to load voice buffers');
        }
      })
      .catch(() => setError('Failed to fetch voice buffers'))
      .finally(() => setLoading(false));
  }, []);

  const handleSendToGemini = async (filename) => {
    setSendingFile(filename);
    onLoadingChange(true);

    try {
      const audioRes = await fetch(`/api/voice-buffers/${encodeURIComponent(filename)}`);
      if (!audioRes.ok) throw new Error('Failed to fetch audio file');
      const audioBlob = await audioRes.blob();

      const formData = new FormData();
      formData.append('audio', audioBlob, filename);
      formData.append('from_buffer', 'true');

      const lat = Number(userLocation?.lat);
      const lng = Number(userLocation?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        formData.append('userLocation', JSON.stringify({ lat, lng }));
      }

      const response = await fetch('/api/process-voice', {
        method: 'POST',
        body: formData,
      });

      const text = await response.text();
      if (!text) throw new Error('Empty response from server');

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
      }

      if (!response.ok) throw new Error(data.error || 'Failed to process audio');

      onResult(data);
    } catch (err) {
      onError(err.message || 'Failed to process saved recording');
    } finally {
      setSendingFile(null);
      onLoadingChange(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete "${filename}"?`)) return;
    try {
      const res = await fetch(`/api/voice-buffers/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete recording');
      setBuffers((prev) => prev.filter((b) => b.filename !== filename));
    } catch (err) {
      onError(err.message || 'Failed to delete recording');
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="voice-buffer-list">
        <h2>Saved Recordings</h2>
        <p className="voice-buffer-loading">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="voice-buffer-list">
        <h2>Saved Recordings</h2>
        <p className="voice-buffer-error">{error}</p>
      </div>
    );
  }

  if (buffers.length === 0) {
    return (
      <div className="voice-buffer-list">
        <h2>Saved Recordings</h2>
        <p className="voice-buffer-empty">No saved recordings yet.</p>
      </div>
    );
  }

  return (
    <div className="voice-buffer-list">
      <h2>Saved Recordings ({buffers.length})</h2>
      <div className="voice-buffer-items">
        {buffers.map((buf) => (
          <div key={buf.filename} className="voice-buffer-item">
            <div className="voice-buffer-info">
              <span className="voice-buffer-name">{buf.filename}</span>
              <span className="voice-buffer-size">{formatSize(buf.size)}</span>
            </div>
            <div className="voice-buffer-controls">
              <audio
                controls
                preload="none"
                src={`/api/voice-buffers/${encodeURIComponent(buf.filename)}`}
              />
              <button
                className="voice-buffer-send"
                onClick={() => handleSendToGemini(buf.filename)}
                disabled={sendingFile !== null}
              >
                {sendingFile === buf.filename ? 'Sending...' : 'Route'}
              </button>
              <button
                className="voice-buffer-delete"
                onClick={() => handleDelete(buf.filename)}
                disabled={sendingFile !== null}
                title="Delete recording"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VoiceBufferList;
