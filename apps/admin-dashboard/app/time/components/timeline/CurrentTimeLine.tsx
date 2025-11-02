"use client";

import { Temporal } from "@/lib/temporal-polyfill";
import { HOUR_HEIGHT, TIMELINE_PADDING_TOP } from "./utils";

interface CurrentTimeLineProps {
  selectedDate: Temporal.PlainDate;
  isClient: boolean;
}

export default function CurrentTimeLine({ selectedDate, isClient }: CurrentTimeLineProps) {
  // Only render on client side to avoid hydration mismatch
  if (!isClient) return null;

  // Only show if viewing today
  const isToday = () => {
    const today = Temporal.Now.plainDateISO();
    return selectedDate.year === today.year && 
           selectedDate.month === today.month && 
           selectedDate.day === today.day;
  };

  if (!isToday()) return null;

  const timeToY = (time: Temporal.ZonedDateTime): number => {
    const startOfDay = time.withPlainTime(Temporal.PlainTime.from("00:00"));
    const diffNs = time.epochNanoseconds - startOfDay.epochNanoseconds;
    const diffMs = Number(diffNs / 1_000_000n);
    const totalHours = diffMs / (1000 * 60 * 60);
    return totalHours * HOUR_HEIGHT;
  };

  const now = Temporal.Now.zonedDateTimeISO();
  const topPosition = Math.round(timeToY(now) + TIMELINE_PADDING_TOP);

  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-0"
      style={{ top: `${topPosition}px`, width: 'calc(100% + 1rem)' }}
    >
      {/* Line */}
      <div className="h-0.5 bg-black/40 dark:bg-white/40 shadow-sm" />
      {/* Circle indicator on the left */}
      <div className="absolute -left-1 top-[-5px] w-3 h-3 bg-black dark:bg-white rounded-full border-2 border-white dark:border-gray-900" />
    </div>
  );
}
