"use client";

import { memo, useMemo } from "react";
import { HOUR_HEIGHT, TIMELINE_PADDING_TOP } from "./utils";

// Generate hours array outside component (static content)
const generateHourMarkers = () => {
  const hours = [];
  for (let i = 0; i <= 24; i++) {
    const label = i === 0 ? "12 AM"
      : i < 12 ? `${i} AM`
        : i === 12 ? "12 PM"
          : i === 24 ? "12 AM"
            : `${i - 12} PM`;

    hours.push(
      <div
        key={i}
        data-is-noon-midnight={i % 12 === 0 ? "true" : "false"}
        className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-800 data-[is-noon-midnight=true]:border-t-3 even:border-dashed"
        style={{ top: `${i * HOUR_HEIGHT + TIMELINE_PADDING_TOP}px`, width: 'calc(100% + 1rem)' }}
      >
        <span className="absolute -top-2 left-1 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 px-1 select-none">
          {label}
        </span>
      </div>
    );
  }
  return hours;
};

// Memoized component - static content that never changes
const TimelineHourMarkers = memo(function TimelineHourMarkers() {
  // Memoize the hours array generation (empty deps = only calculate once)
  const hours = useMemo(() => generateHourMarkers(), []);
  
  return <>{hours}</>;
});

export default TimelineHourMarkers;
