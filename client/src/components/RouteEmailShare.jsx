import { useState } from 'react';

function RouteEmailShare({ route, compact = false }) {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!route || !email.trim()) return;

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
          email: email.trim(),
          route
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send route email');
      }

      setSuccessMessage(payload.message || 'Route email sent');
      setEmail('');
    } catch (error) {
      setErrorMessage(error.message || 'Failed to send route email');
    } finally {
      setIsSending(false);
    }
  };

  if (compact) {
    return (
      <div className="route-email-share route-email-share--compact">
        <h3 className="compact-title">Send to Phone</h3>
        <button
          className="email-icon-button"
          onClick={() => setShowForm(!showForm)}
          aria-label="Send route via email"
        >
          <svg className="email-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none" stroke="white" strokeWidth="2"/>
            <polyline points="22,6 12,13 2,6" fill="none" stroke="white" strokeWidth="2"/>
          </svg>
        </button>
        <p className="compact-hint">{showForm ? 'Tap to close' : 'Tap to email route'}</p>
        {showForm && (
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
                disabled={isSending || !route}
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </form>
            {successMessage && <p className="route-email-success">{successMessage}</p>}
            {errorMessage && <p className="route-email-error">{errorMessage}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="route-email-share-card" className="route-email-share">
      <h2>Send Route To Phone</h2>
      <p className="route-email-hint">
        Enter an email address to receive a Google Maps link that opens directly on mobile.
      </p>
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
          disabled={isSending || !route}
        >
          {isSending ? 'Sending...' : 'Send Link'}
        </button>
      </form>
      {successMessage && <p className="route-email-success">{successMessage}</p>}
      {errorMessage && <p className="route-email-error">{errorMessage}</p>}
    </div>
  );
}

export default RouteEmailShare;
