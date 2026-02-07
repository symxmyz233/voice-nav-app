import { useState } from 'react';
import './CoffeeShopRecommendations.css';

function CoffeeShopRecommendations({ shops = [], onShopSelect }) {
  const [sortBy, setSortBy] = useState('score');

  if (!shops || shops.length === 0) {
    return null;
  }

  // Sort shops based on selected criteria
  const sortedShops = [...shops].sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return (b.recommendationScore || 0) - (a.recommendationScore || 0);
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      case 'distance':
        return (a.distanceValue || 0) - (b.distanceValue || 0);
      case 'reviews':
        return (b.reviewCount || 0) - (a.reviewCount || 0);
      default:
        return 0;
    }
  });

  const getRatingColor = (rating) => {
    if (!rating) return '#ccc';
    if (rating >= 4.5) return '#22c55e'; // green
    if (rating >= 4.0) return '#84cc16'; // lime
    if (rating >= 3.5) return '#eab308'; // yellow
    if (rating >= 3.0) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const getScoreIcon = (score) => {
    if (score >= 8.5) return '🌟';
    if (score >= 8.0) return '⭐';
    return '☆';
  };

  return (
    <div className="coffee-shop-recommendations">
      <div className="recommendations-header">
        <h3>Recommended Coffee Shops</h3>
        <div className="sort-controls">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="score">Recommendation Score</option>
            <option value="rating">Rating</option>
            <option value="distance">Distance</option>
            <option value="reviews">Review Count</option>
          </select>
        </div>
      </div>

      <div className="recommendations-list">
        {sortedShops.map((shop, index) => (
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
                    {shop.openNow ? '🔓 Open Now' : '🔒 Closed'}
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
              title="Set as destination"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"></polyline>
              </svg>
              Navigate
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CoffeeShopRecommendations;
