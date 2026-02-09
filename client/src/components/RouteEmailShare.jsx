import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function RouteEmailShare({ route, compact = false }) {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
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
      const response = await fetch('/api/send-route-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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

  if (compact) {
    return (
      <div className="route-email-share route-email-share--compact">
        <button
          className="email-icon-button"
          onClick={() => (canQuickSend ? sendEmail() : setShowForm(!showForm))}
          aria-label="Send route via email"
          disabled={!route || isSending}
        >
          <svg className="email-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none" stroke="white" strokeWidth="2"/>
            <polyline points="22,6 12,13 2,6" fill="none" stroke="white" strokeWidth="2"/>
          </svg>
        </button>
        <p className="compact-hint">Send to Phone</p>
        {!canQuickSend && showForm && (
          <div className="route-email-compact-form">
            <form className="route-email-form" onSubmit={handleSubmit}>
              <input
                className="route-email-input"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isSending}
              />
              <button
                className="route-email-button"
                type="submit"
                disabled={isSending || !route || !effectiveEmail.trim()}
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </form>
            {successMessage && <p className="route-email-success">{successMessage}</p>}
            {errorMessage && <p className="route-email-error">{errorMessage}</p>}
          </div>
        )}
        {canQuickSend && successMessage && <p className="route-email-success">{successMessage}</p>}
        {canQuickSend && errorMessage && <p className="route-email-error">{errorMessage}</p>}
      </div>
    );
  }

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
