import { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/current`, {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.user) {
        setCurrentUser(data.user);
        setIsAuthenticated(true);
      } else {
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
      setCurrentUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, email) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, email })
      });

      const data = await response.json();

      if (data.success) {
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        // Save to localStorage for auto-fill and login persistence
        localStorage.setItem('lastUsername', username);
        localStorage.setItem('dismissedLogin', 'true');
        if (email) {
          localStorage.setItem('lastEmail', email);
        }
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: 'Failed to login' };
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE_URL}/users/logout`, {
        method: 'POST',
        credentials: 'include'
      });

      setCurrentUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem('dismissedLogin');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getLastUsername = () => {
    return localStorage.getItem('lastUsername') || '';
  };

  const getLastEmail = () => {
    return localStorage.getItem('lastEmail') || '';
  };

  const value = {
    currentUser,
    isAuthenticated,
    loading,
    login,
    logout,
    checkAuth,
    getLastUsername,
    getLastEmail
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
