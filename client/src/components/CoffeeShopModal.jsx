import { useMemo } from 'react';
import './CoffeeShopModal.css';

const STOP_COLORS = [
  '#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6'
];

function getStopColor(index) {
  return STOP_COLORS[index % STOP_COLORS.length];
}

function CoffeeShopModal({ isOpen, onClose, grouped, groupedMeta, onAddShop }) {
  const stopGroups = useMemo(() => {
    if (!grouped || !groupedMeta?.order?.length) return [];
    return groupedMeta.order.map((key) => ({
      stopKey: key,
      stopLabel: groupedMeta.labels?.[key] || key,
      stopIndex: groupedMeta.indexes?.[key] ?? 0,
      shops: grouped[key] || []
    }));
  }, [grouped, groupedMeta]);

  if (!isOpen || stopGroups.length === 0) return null;

  const totalShops = stopGroups.reduce((sum, g) => sum + g.shops.length, 0);

  const formatDistance = (shop) => {
    if (shop.distanceValue != null) {
      const miles = (shop.distanceValue / 1000) * 0.621371;
      return `${miles.toFixed(1)} mi`;
    }
    if (shop.distance) return shop.distance;
    return 'N/A';
  };

  return (
    <div className="csm-overlay" onClick={onClose}>
      <div className="csm-content" onClick={(e) => e.stopPropagation()}>
        <div className="csm-header">
          <div>
            <h2 className="csm-title">Coffee Shops Along Your Route</h2>
            <span className="csm-subtitle">
              {totalShops} shops near {stopGroups.length} stop{stopGroups.length > 1 ? 's' : ''} (excluding destination). Click a shop to add after your current location.
            </span>
          </div>
          <button className="csm-close" onClick={onClose} type="button">
            &times;
          </button>
        </div>

        <div className="csm-body">
          {stopGroups.map((group) => {
            const color = getStopColor(group.stopIndex);
            return (
              <div key={group.stopKey} className="csm-group">
                <div className="csm-group-header">
                  <span className="csm-group-dot" style={{ backgroundColor: color }} />
                  <span className="csm-group-label">Near {group.stopLabel}</span>
                  <span className="csm-group-count">{group.shops.length}</span>
                </div>

                <div className="csm-group-shops">
                  {group.shops.length === 0 ? (
                    <div className="csm-no-shops">No coffee shops found near this stop</div>
                  ) : (
                    group.shops.map((shop) => (
                      <div
                        key={shop.placeId}
                        className="csm-shop-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => onAddShop(shop)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onAddShop(shop);
                          }
                        }}
                        title="Add to route after your current location"
                      >
                        <div className="csm-shop-info">
                          <div className="csm-shop-name">{shop.name}</div>
                          <div className="csm-shop-details">
                            <span className="csm-shop-rating">
                              {shop.rating ? `${shop.rating.toFixed(1)}★` : 'N/A'}
                            </span>
                            <span className="csm-shop-distance">
                              {formatDistance(shop)} from {group.stopLabel}
                            </span>
                            {shop.openNow !== undefined && (
                              <span className={`csm-shop-status ${shop.openNow ? 'open' : 'closed'}`}>
                                {shop.openNow ? 'Open' : 'Closed'}
                              </span>
                            )}
                          </div>
                          {shop.address && (
                            <div className="csm-shop-address">{shop.address}</div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CoffeeShopModal;
