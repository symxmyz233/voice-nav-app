import './NearbyInfoCard.css';

function NearbyInfoCard({ shops, selectedShop, onNavigate, onDismiss }) {
  if (!shops || shops.length === 0) return null;

  const getRatingStars = (rating) => {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let stars = '';
    for (let i = 0; i < full; i++) stars += '\u2605';
    if (half) stars += '\u00BD';
    return stars;
  };

  const formatDistance = (meters) => {
    if (!meters) return '';
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <div className="nearby-info-card">
      <div className="nearby-header">
        <h3>Nearby Coffee Shops</h3>
        <button className="nearby-dismiss" onClick={onDismiss} title="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="nearby-list">
        {shops.map((shop, index) => {
          const isSelected = selectedShop && selectedShop.placeId === shop.placeId;
          const isNearest = index === 0;

          return (
            <div
              key={shop.placeId}
              className={`nearby-item ${isSelected ? 'selected' : ''} ${isNearest ? 'nearest' : ''}`}
            >
              <div className="nearby-item-rank">{index + 1}</div>
              <div className="nearby-item-content">
                <div className="nearby-item-top">
                  <div className="nearby-item-name">
                    {shop.name}
                    {isNearest && <span className="nearest-badge">Nearest</span>}
                  </div>
                  {shop.openNow !== undefined && (
                    <span className={`nearby-status ${shop.openNow ? 'open' : 'closed'}`}>
                      {shop.openNow ? 'Open' : 'Closed'}
                    </span>
                  )}
                </div>

                <div className="nearby-item-details">
                  {shop.rating > 0 && (
                    <span className="nearby-rating">
                      {getRatingStars(shop.rating)} {shop.rating}
                      {shop.totalRatings > 0 && <span className="nearby-review-count">({shop.totalRatings})</span>}
                    </span>
                  )}
                  {shop.distance > 0 && (
                    <span className="nearby-distance">{formatDistance(shop.distance)}</span>
                  )}
                </div>

                {shop.address && (
                  <div className="nearby-item-address">{shop.address}</div>
                )}

                <button
                  className="nearby-navigate-btn"
                  onClick={() => onNavigate(shop)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                  Navigate
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default NearbyInfoCard;
