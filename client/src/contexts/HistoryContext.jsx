import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const HistoryContext = createContext(null);

export function HistoryProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [history, setHistory] = useState([]);
  const [recentDestinations, setRecentDestinations] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load history when user logs in
  useEffect(() => {
    if (isAuthenticated) {
      refreshHistory();
      refreshRecentDestinations();
    } else {
      // Clear data when logged out
      setHistory([]);
      setRecentDestinations([]);
    }
  }, [isAuthenticated]);

  const refreshHistory = async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/history?limit=20', {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success) {
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshRecentDestinations = async () => {
    if (!isAuthenticated) return;

    try {
      const response = await fetch('http://localhost:3001/api/history/recent-destinations?limit=10', {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success) {
        setRecentDestinations(data.destinations || []);
      }
    } catch (error) {
      console.error('Failed to load recent destinations:', error);
    }
  };

  const value = {
    history,
    recentDestinations,
    loading,
    refreshHistory,
    refreshRecentDestinations
  };

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
}
