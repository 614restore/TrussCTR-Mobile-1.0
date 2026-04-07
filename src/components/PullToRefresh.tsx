import React, { useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  threshold?: number;
}

export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 70,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;
    // Only activate when scrolled to top
    if (container.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startYRef.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > 0) {
        // Dampen the pull with a rubber-band feel
        setPullDistance(Math.min(delta * 0.5, threshold * 1.2));
      }
    },
    [refreshing, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (startYRef.current === null) return;
    startYRef.current = null;

    if (pullDistance >= threshold) {
      setRefreshing(true);
      setPullDistance(threshold);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = pullDistance > 10 || refreshing;

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Pull indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center z-10 pointer-events-none"
        style={{
          height: `${Math.max(pullDistance, refreshing ? threshold : 0)}px`,
          transition: refreshing || pullDistance > 0 ? 'none' : 'height 0.25s ease',
          overflow: 'hidden',
        }}
      >
        {showIndicator && (
          <div className="flex items-center gap-2 text-blue-500">
            <RefreshCw
              className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
              style={{
                transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
                opacity: progress,
                transition: 'opacity 0.1s',
              }}
            />
            <span className="text-sm font-medium">
              {refreshing ? 'Refreshing...' : progress >= 1 ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        style={{
          transform: `translateY(${pullDistance > 0 || refreshing ? Math.max(pullDistance, refreshing ? threshold : 0) : 0}px)`,
          transition: refreshing || pullDistance > 0 ? 'none' : 'transform 0.25s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
