"use client";

/**
 * Example: Current Time Clock
 * 
 * Demonstrates correct pattern for displaying current time
 * without hydration mismatches.
 */

import { useNow } from '@/hooks/useTemporal';
import { formatTime, formatDate } from '@/lib/datetime';

export function CurrentTimeClock() {
  const now = useNow(1000); // Update every second

  // Return placeholder during SSR and initial client render
  if (!now) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Loading time...
      </div>
    );
  }

  const instant = now.toInstant();

  return (
    <div className="flex flex-col items-end text-sm">
      <div className="font-medium text-gray-900 dark:text-gray-100">
        {formatTime(instant, { timeStyle: 'medium' })}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {formatDate(instant, { dateStyle: 'medium' })}
      </div>
    </div>
  );
}
