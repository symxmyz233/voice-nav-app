import { useEffect, useMemo, useState } from 'react';
import './CoffeeShopRecommendations.css';

const TAB_LABELS = {
  all: 'All',
  current: 'Near Me',
  route: 'Along Route',
  origin: 'At Start',
  midpoint: 'On Route',
  destination: 'At End'
};

const TAB_ORDER = ['current', 'route', 'origin', 'midpoint', 'destination'];

function CoffeeShopRecommendations({ shops = [], grouped = null, onShopSelect }) {
  const [sortBy, setSortBy] = useState('score');
  const [activeTab, setActiveTab] = useState('all');
  const [userChangedSort, setUserChangedSort] = useState(false);

  const tabs = useMemo(() => {
    const result = [{ key: 'all', label: TAB_LABELS.all }];
    if (!grouped) return result;

    TAB_ORDER.forEach((key) => {
      if (Array.isArray(grouped[key])) {
        result.push({ key, label: TAB_LABELS[key] });
      }
    });
    return result;
  }, [grouped]);

  const hasGrouped = grouped && tabs.length > 1;

  // Determine which shops to display based on active tab
  let displayShops;
  if (hasGrouped && activeTab !== 'all') {
    displayShops = grouped[activeTab] || [];
  } else {
    displayShops = shops;
  }

  if (!displayShops || displayShops.length === 0) {
    if (!hasGrouped && (!shops || shops.length === 0)) return null;
    // If grouped but current tab is empty, still render the tabs
  }

  useEffect(() => {
    if (grouped?.current?.length && !userChangedSort) {
      setSortBy('distance');
    }
  }, [grouped, userChangedSort]);

  useEffect(() => {
    if (grouped?.current?.length && activeTab === 'all') {
      setActiveTab('current');
      return;
    }

    if (!tabs.find(tab => tab.key === activeTab)) {
      setActiveTab('all');
    }
  }, [activeTab, grouped, tabs]);

  // Sort shops based on selected criteria
  const sortedShops = [...(displayShops || [])].sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return (b.recommendationScore || 0) - (a.recommendationScore || 0);
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      case 'distance':
        if ((a.distanceValue || 0) !== (b.distanceValue || 0)) {
          return (a.distanceValue || 0) - (b.distanceValue || 0);
        }
        return (b.rating || 0) - (a.rating || 0);
      case 'reviews':
        return (b.reviewCount || 0) - (a.reviewCount || 0);
      default:
        return 0;
    }
  });

  const getRatingColor = (rating) => {
    if (!rating) return '#ccc';
    if (rating >= 4.5) return '#22c55e';
    if (rating >= 4.0) return '#84cc16';
    if (rating >= 3.5) return '#eab308';
    if (rating >= 3.0) return '#f97316';
    return '#ef4444';
  };

  const getScoreIcon = (score) => {
    if (score >= 8.5) return '\u{1F31F}';
    if (score >= 8.0) return '\u2B50';
    return '\u2606';
  };

  const getTabCount = (key) => {
    if (key === 'all') return shops?.length || 0;
    return grouped?.[key]?.length || 0;
  };

  return (
    <div className="coffee-shop-recommendations">
      <div className="recommendations-header">
        <h3>Recommended Coffee Shops</h3>
        <div className="sort-controls">
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setUserChangedSort(true);
            }}
          >
            <option value="score">Recommendation Score</option>
            <option value="rating">Rating</option>
            <option value="distance">Distance</option>
            <option value="reviews">Review Count</option>
          </select>
        </div>
      </div>

      {hasGrouped && (
        <div className="location-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`location-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className="tab-count">{getTabCount(tab.key)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="recommendations-list">
        {sortedShops.length === 0 ? (
          <div className="no-results-tab">No coffee shops found in this area</div>
        ) : (
          sortedShops.map((shop, index) => (
            <div key={shop.placeId} className="recommendation-item">
              <div className="item-rank">#{index + 1}</div>

              <div className="item-content">
                <div className="item-header">
                  <h4 className="item-name">{shop.name}</h4>
                  <span className="item-score">
                    {getScoreIcon(shop.recommendationScore)}
                    {shop.recommendationScore}
                  </span>
                </div>

                <div className="item-address">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  {shop.address || shop.vicinity}
                </div>

                <div className="item-stats">
                  <div className="stat">
                    <span className="stat-label">Rating:</span>
                    <div className="rating-bar">
                      <div
                        className="rating-fill"
                        style={{
                          width: `${(shop.rating / 5) * 100}%`,
                          backgroundColor: getRatingColor(shop.rating)
                        }}
                      ></div>
                    </div>
                    <span className="stat-value">{shop.rating?.toFixed(1)}/5</span>
                  </div>

                  <div className="stat">
                    <span className="stat-label">Reviews:</span>
                    <span className="stat-value">{shop.reviewCount?.toLocaleString() || 0}</span>
                  </div>

                  <div className="stat">
                    <span className="stat-label">Distance:</span>
                    <span className="stat-value">{shop.distance}</span>
                  </div>
                </div>

                {shop.openNow !== undefined && (
                  <div className="item-status">
                    <span className={`status-badge ${shop.openNow ? 'open' : 'closed'}`}>
                      {shop.openNow ? 'Open Now' : 'Closed'}
                    </span>
                  </div>
                )}

                {shop.phone && (
                  <div className="item-contact">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                    <a href={`tel:${shop.phone}`}>{shop.phone}</a>
                  </div>
                )}

                {shop.website && (
                  <div className="item-website">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M2 12h20"></path>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                    <a href={shop.website} target="_blank" rel="noopener noreferrer">Visit Website</a>
                  </div>
                )}
              </div>

              <button
                className="item-action-btn"
                onClick={() => onShopSelect?.(shop)}
                title="Add as waypoint"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
                Add Stop
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default CoffeeShopRecommendations;
