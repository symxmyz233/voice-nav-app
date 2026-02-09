import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';

function RouteEmailShare({ route }) {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const { isAuthenticated, currentUser, getLastEmail } = useAuth();

  useEffect(() => {
    const storedEmail = currentUser?.email || getLastEmail();
    if (isAuthenticated && storedEmail) {
      setEmail(storedEmail);
    }
  }, [isAuthenticated, currentUser?.email, getLastEmail]);

  const storedEmail = currentUser?.email || getLastEmail();
  const canQuickSend = Boolean(isAuthenticated && storedEmail);
  const effectiveEmail = canQuickSend ? storedEmail : email;

  const sendEmail = async () => {
    if (!route || !effectiveEmail.trim()) return;

    setIsSending(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/send-route-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email: effectiveEmail.trim(),
          route
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send route email');
      }

      setSuccessMessage(payload.message || 'Route email sent');
      if (!canQuickSend) {
        setEmail('');
      }
    } catch (error) {
      setErrorMessage(error.message || 'Failed to send route email');
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendEmail();
  };

  return (
    <div id="route-email-share-card" className="route-email-share">
      <h2>Send to Phone</h2>
      <form className="route-email-form" onSubmit={handleSubmit}>
        {!canQuickSend && (
          <input
            className="route-email-input"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={isSending}
          />
        )}
        {canQuickSend && (
          <div className="route-email-hint">
            Sending to {storedEmail}
          </div>
        )}
        <button
          className="route-email-button"
          type="submit"
          disabled={isSending || !route || !effectiveEmail.trim()}
        >
          {isSending ? 'Sending...' : 'Send Link'}
        </button>
      </form>
      {successMessage && <p className="route-email-success">{successMessage}</p>}
      {errorMessage && <p className="route-email-error">{errorMessage}</p>}

      <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '10px' }}>
        {route
          ? 'Click to send your route as a Google Maps link to your phone'
          : 'Create a route first, then send it to your mobile device'}
      </p>
    </div>
  );
}

export default RouteEmailShare;
