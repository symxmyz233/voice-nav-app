import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginScreen.css';

export default function LoginScreen({ onContinueAsGuest }) {
  const { login, getLastUsername, getLastEmail } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Auto-fill last username
    const lastUsername = getLastUsername();
    if (lastUsername) {
      setUsername(lastUsername);
    }
    const lastEmail = getLastEmail();
    if (lastEmail) {
      setEmail(lastEmail);
    }
  }, [getLastUsername, getLastEmail]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (username.trim().length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }

    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    const result = await login(username.trim(), email.trim());
    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Failed to login');
    }
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <h1>🗺️ Voice Navigation</h1>
          <p>Welcome! Your email is your unique ID</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="login-input"
              autoFocus
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="login-input"
              disabled={loading}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Continue'}
          </button>
        </form>

        {onContinueAsGuest && (
          <button
            onClick={onContinueAsGuest}
            className="guest-button"
            disabled={loading}
          >
            Continue as Guest
          </button>
        )}

        <div className="login-footer">
          <p className="login-hint">
            First time? Just enter any username to create your profile.
          </p>
        </div>
      </div>
    </div>
  );
}
