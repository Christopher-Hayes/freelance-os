"use client";

/**
 * Hooks for working with Temporal API in React components
 */

import { useEffect, useState } from 'react';
import { Temporal } from '@/lib/temporal-polyfill';
import { nowLocal } from '@/lib/datetime';

/**
 * Hook that returns the current time and updates every interval
 * 
 * @param intervalMs - Update interval in milliseconds (default 1000)
 * @returns Current ZonedDateTime in local timezone
 */
export function useNow(intervalMs: number = 1000): Temporal.ZonedDateTime | null {
  const [now, setNow] = useState<Temporal.ZonedDateTime | null>(null);

  useEffect(() => {
    // Set initial value
    setNow(nowLocal());

    // Update on interval
    const timer = setInterval(() => {
      setNow(nowLocal());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/**
 * Hook that returns true once component is mounted on client
 * Use this to prevent hydration mismatches for client-only content
 */
export function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}

/**
 * Hook for formatting a datetime value that updates when the value changes
 * 
 * @param value - UTC ISO string or Temporal.Instant
 * @param formatter - Function that formats the instant
 * @returns Formatted string or null if not mounted
 */
export function useFormattedTime(
  value: string | Temporal.Instant,
  formatter: (instant: Temporal.Instant) => string
): string | null {
  const [formatted, setFormatted] = useState<string | null>(null);
  const isClient = useIsClient();

  useEffect(() => {
    if (!isClient) return;

    try {
      const instant = typeof value === 'string' 
        ? Temporal.Instant.from(value)
        : value;
      setFormatted(formatter(instant));
    } catch (error) {
      console.error('Error formatting time:', error);
      setFormatted('Invalid date');
    }
  }, [value, formatter, isClient]);

  return formatted;
}
