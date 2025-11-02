/**
 * DateTime Utilities using Temporal API
 * 
 * This module provides utility functions for handling dates and times consistently
 * across the application using the Temporal API.
 * 
 * Key principles:
 * 1. Server always sends UTC ISO strings
 * 2. Client converts to local timezone for display
 * 3. Use Temporal API for all date/time operations
 */

import { Temporal } from './temporal-polyfill';

/**
 * Parse an ISO string (UTC) to a Temporal.Instant
 */
export function parseUTC(isoString: string): Temporal.Instant {
  return Temporal.Instant.from(isoString);
}

/**
 * Parse an ISO string to a ZonedDateTime in the user's local timezone
 */
export function parseLocal(isoString: string): Temporal.ZonedDateTime {
  const instant = Temporal.Instant.from(isoString);
  return instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
}

/**
 * Get the current instant (UTC)
 */
export function now(): Temporal.Instant {
  return Temporal.Now.instant();
}

/**
 * Get the current date/time in the user's local timezone
 */
export function nowLocal(): Temporal.ZonedDateTime {
  return Temporal.Now.zonedDateTimeISO();
}

/**
 * Format a datetime for display
 * Uses Intl.DateTimeFormat for localized formatting
 */
export function formatDateTime(
  instant: Temporal.Instant | string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  }
): string {
  const instantObj = typeof instant === 'string' ? parseUTC(instant) : instant;
  return new Intl.DateTimeFormat(undefined, options).format(
    new Date(instantObj.epochMilliseconds)
  );
}

/**
 * Format a date (no time)
 */
export function formatDate(
  instant: Temporal.Instant | string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
  }
): string {
  const instantObj = typeof instant === 'string' ? parseUTC(instant) : instant;
  return new Intl.DateTimeFormat(undefined, options).format(
    new Date(instantObj.epochMilliseconds)
  );
}

/**
 * Format a time (no date)
 */
export function formatTime(
  instant: Temporal.Instant | string,
  options: Intl.DateTimeFormatOptions = {
    timeStyle: 'short',
  }
): string {
  const instantObj = typeof instant === 'string' ? parseUTC(instant) : instant;
  return new Intl.DateTimeFormat(undefined, options).format(
    new Date(instantObj.epochMilliseconds)
  );
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelative(instant: Temporal.Instant | string): string {
  const instantObj = typeof instant === 'string' ? parseUTC(instant) : instant;
  const nowInstant = now();
  
  const diff = nowInstant.since(instantObj);
  const seconds = diff.total('seconds');
  
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  
  const absSec = Math.abs(seconds);
  
  if (absSec < 60) {
    return rtf.format(-Math.round(seconds), 'seconds');
  } else if (absSec < 3600) {
    return rtf.format(-Math.round(seconds / 60), 'minutes');
  } else if (absSec < 86400) {
    return rtf.format(-Math.round(seconds / 3600), 'hours');
  } else if (absSec < 604800) {
    return rtf.format(-Math.round(seconds / 86400), 'days');
  } else if (absSec < 2592000) {
    return rtf.format(-Math.round(seconds / 604800), 'weeks');
  } else if (absSec < 31536000) {
    return rtf.format(-Math.round(seconds / 2592000), 'months');
  } else {
    return rtf.format(-Math.round(seconds / 31536000), 'years');
  }
}

/**
 * Check if a date is today (in local timezone)
 */
export function isToday(instant: Temporal.Instant | string): boolean {
  const instantObj = typeof instant === 'string' ? parseUTC(instant) : instant;
  const local = instantObj.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const today = nowLocal();
  
  return Temporal.PlainDate.compare(local.toPlainDate(), today.toPlainDate()) === 0;
}

/**
 * Check if a date is yesterday (in local timezone)
 */
export function isYesterday(instant: Temporal.Instant | string): boolean {
  const instantObj = typeof instant === 'string' ? parseUTC(instant) : instant;
  const local = instantObj.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const yesterday = nowLocal().subtract({ days: 1 });
  
  return Temporal.PlainDate.compare(local.toPlainDate(), yesterday.toPlainDate()) === 0;
}

/**
 * Get a PlainDate for a given instant in local timezone
 */
export function toLocalDate(instant: Temporal.Instant | string): Temporal.PlainDate {
  const instantObj = typeof instant === 'string' ? parseUTC(instant) : instant;
  return instantObj.toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDate();
}

/**
 * Create an Instant from a PlainDate (at midnight local time)
 */
export function fromLocalDate(date: Temporal.PlainDate): Temporal.Instant {
  const zdt = date.toZonedDateTime({
    timeZone: Temporal.Now.timeZoneId(),
    plainTime: Temporal.PlainTime.from('00:00:00'),
  });
  return zdt.toInstant();
}

/**
 * Duration formatting helpers
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}m`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${mins}m`;
  }
}

export function formatDurationLong(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (mins > 0) {
    parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  }
  
  return parts.join(' ') || '0 minutes';
}
