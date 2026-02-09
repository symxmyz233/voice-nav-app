import { useAuth } from '../contexts/AuthContext';
import './UserProfile.css';

export default function UserProfile() {
  const { currentUser, logout } = useAuth();

  if (!currentUser) return null;

  return (
    <div className="user-profile">
      <div className="user-info">
        <div className="user-avatar">{currentUser.username.charAt(0).toUpperCase()}</div>
        <span className="user-name">{currentUser.username}</span>
      </div>
      <button onClick={logout} className="logout-button" title="Logout">
        Logout
      </button>
    </div>
  );
}
