import { useMemo, useState } from 'react';
import './CoffeeShopRecommendations.css';

// Colors matching MapDisplay stop colors
const STOP_COFFEE_COLORS = [
  '#22c55e', // Green - Stop 0 (origin)
  '#3b82f6', // Blue - Stop 1
  '#8b5cf6', // Purple - Stop 2
  '#f59e0b', // Amber - Stop 3
  '#ec4899', // Pink - Stop 4
  '#14b8a6', // Teal - Stop 5
];

function getStopColor(stopIndex) {
  return STOP_COFFEE_COLORS[stopIndex % STOP_COFFEE_COLORS.length];
}

function CoffeeShopRecommendations({ shops = [], grouped = null, groupedMeta = null, onShopSelect, routeStops = [] }) {
  const [expandedStops, setExpandedStops] = useState({});

  // Build grouped display data: array of { stopKey, stopLabel, stopIndex, shops }
  const stopGroups = useMemo(() => {
    if (!grouped || !groupedMeta?.order?.length) return [];

    return groupedMeta.order.map((key) => ({
      stopKey: key,
      stopLabel: groupedMeta.labels?.[key] || key,
      stopIndex: groupedMeta.indexes?.[key] ?? 0,
      shops: grouped[key] || []
    }));
  }, [grouped, groupedMeta]);

  const hasGroupedData = stopGroups.length > 0;

  // If no grouped data and no flat shops, don't render
  if (!hasGroupedData && (!shops || shops.length === 0)) return null;

  const toggleExpand = (key) => {
    setExpandedStops((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const formatDistance = (shop) => {
    if (shop.distanceValue != null) {
      const miles = (shop.distanceValue / 1000) * 0.621371;
      return `${miles.toFixed(1)} mi`;
    }
    if (shop.distance) return shop.distance;
    return 'N/A';
  };

  // Determine destination name for display
  const destinationName = routeStops.length > 0
    ? routeStops[routeStops.length - 1]?.name || 'Final Destination'
    : 'Final Destination';

  // Grouped tree display
  if (hasGroupedData) {
    return (
      <div className="coffee-shop-recommendations">
        <div className="recommendations-header">
          <h3>Coffee Shops Along Route</h3>
          <span className="recommendations-subtitle">
            Top 5 per stop (excluding destination)
          </span>
        </div>

        <div className="stop-groups-list">
          {stopGroups.map((group) => {
            const isExpanded = expandedStops[group.stopKey] !== false; // default expanded
            const color = getStopColor(group.stopIndex);

            return (
              <div key={group.stopKey} className="stop-group">
                <button
                  className={`stop-group-header ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => toggleExpand(group.stopKey)}
                >
                  <span className="stop-group-indicator" style={{ backgroundColor: color }} />
                  <span className="stop-group-label">{group.stopLabel}</span>
                  <span className="stop-group-count">{group.shops.length} shops</span>
                  <svg
                    className={`stop-group-chevron ${isExpanded ? 'expanded' : ''}`}
                    width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="stop-group-shops">
                    {group.shops.length === 0 ? (
                      <div className="no-results-tab">No coffee shops found near this stop</div>
                    ) : (
                      group.shops.map((shop, idx) => (
                        <div key={shop.placeId} className="grouped-shop-item">
                          <div className="grouped-shop-rank" style={{ color }}>
                            {idx + 1}
                          </div>
                          <div className="grouped-shop-content">
                            <div className="grouped-shop-name">{shop.name}</div>
                            <div className="grouped-shop-meta">
                              <span className="grouped-shop-distance">{formatDistance(shop)}</span>
                              <span className="grouped-shop-rating">
                                {shop.rating ? `${shop.rating.toFixed(1)}★` : 'N/A'}
                              </span>
                              {shop.openNow !== undefined && (
                                <span className={`grouped-shop-status ${shop.openNow ? 'open' : 'closed'}`}>
                                  {shop.openNow ? 'Open' : 'Closed'}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className="grouped-shop-add-btn"
                            onClick={() => onShopSelect?.(shop, group.stopKey)}
                            title={`Add after ${group.stopLabel}`}
                          >
                            Add
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Show destination (no coffee shops) */}
          <div className="stop-group destination-stop">
            <div className="stop-group-header destination">
              <span className="stop-group-indicator" style={{ backgroundColor: '#ef4444' }} />
              <span className="stop-group-label">{destinationName}</span>
              <span className="stop-group-note">Final destination</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: flat list when no grouped data (single location search)
  const sortedShops = [...shops].sort((a, b) => {
    const distA = a.distanceValue || 0;
    const distB = b.distanceValue || 0;
    const distDiff = distA - distB;
    if (Math.abs(distDiff) < 500) {
      return (b.rating || 0) - (a.rating || 0);
    }
    return distDiff;
  });

  return (
    <div className="coffee-shop-recommendations">
      <div className="recommendations-header">
        <h3>Nearby Coffee Shops</h3>
      </div>
      <div className="recommendations-list">
        {sortedShops.map((shop, index) => (
          <div key={shop.placeId} className="grouped-shop-item">
            <div className="grouped-shop-rank">{index + 1}</div>
            <div className="grouped-shop-content">
              <div className="grouped-shop-name">{shop.name}</div>
              <div className="grouped-shop-meta">
                <span className="grouped-shop-distance">{formatDistance(shop)}</span>
                <span className="grouped-shop-rating">
                  {shop.rating ? `${shop.rating.toFixed(1)}★` : 'N/A'}
                </span>
              </div>
            </div>
            <button
              className="grouped-shop-add-btn"
              onClick={() => onShopSelect?.(shop, null)}
              title="Add to route"
            >
              Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CoffeeShopRecommendations;
