"use client";

import { memo } from "react";
import { HOUR_HEIGHT, TIMELINE_PADDING_TOP } from "./utils";

// Memoized component - generates markers on each render (but memo prevents unnecessary re-renders)
const TimelineHourMarkers = memo(function TimelineHourMarkers() {
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
        className="absolute left-0 right-0 border-t border-gray-300 dark:border-gray-700 data-[is-noon-midnight=true]:border-t-3"
        style={{ top: `${i * HOUR_HEIGHT + TIMELINE_PADDING_TOP}px`, width: 'calc(100% + 1rem)' }}
      >
        <span className="absolute -top-2 left-1 text-xs text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 px-1 select-none">
          {label}
        </span>
      </div>
    );
  }
  
  return <>{hours}</>;
});

export default TimelineHourMarkers;
