import { useState } from 'react';

function RouteEmailShare({ route }) {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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
