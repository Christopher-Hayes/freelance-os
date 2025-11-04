"use client";

import { memo, useMemo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { HOUR_HEIGHT, TIMELINE_PADDING_TOP } from "./utils";

interface CurrentTimeLineProps {
  selectedDate: Temporal.PlainDate;
  isClient: boolean;
  currentTime: Temporal.ZonedDateTime; // Passed from parent for memoization
}

// Helper function moved outside component
const timeToY = (time: Temporal.ZonedDateTime): number => {
  const startOfDay = time.withPlainTime(Temporal.PlainTime.from("00:00"));
  const diffNs = time.epochNanoseconds - startOfDay.epochNanoseconds;
  const diffMs = Number(diffNs / 1_000_000n);
  const totalHours = diffMs / (1000 * 60 * 60);
  return totalHours * HOUR_HEIGHT;
};

// Memoized component - only recalculates when selectedDate or currentTime changes
const CurrentTimeLine = memo(function CurrentTimeLine({ 
  selectedDate, 
  isClient, 
  currentTime 
}: CurrentTimeLineProps) {
  // Memoize isToday calculation - only recalculate when selectedDate changes
  const isToday = useMemo(() => {
    const today = Temporal.Now.plainDateISO();
    return selectedDate.year === today.year && 
           selectedDate.month === today.month && 
           selectedDate.day === today.day;
  }, [selectedDate]);

  // Memoize top position calculation - only recalculate when currentTime changes
  const topPosition = useMemo(
    () => Math.round(timeToY(currentTime) + TIMELINE_PADDING_TOP),
    [currentTime]
  );

  // Only render on client side to avoid hydration mismatch
  if (!isClient) return null;

  // Only show if viewing today
  if (!isToday) return null;

  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-0"
      style={{ top: `${topPosition}px`, width: 'calc(100% + 1rem)' }}
    >
      {/* Line */}
      <div className="h-0.5 bg-red-500 dark:bg-red-400 shadow-sm" />
      {/* Circle indicator on the left */}
      <div className="absolute -left-1 top-[-5px] w-3 h-3 bg-red-500 dark:bg-red-400 rounded-full border-2 border-gray-50 dark:border-gray-900" />
    </div>
  );
});

export default CurrentTimeLine;
