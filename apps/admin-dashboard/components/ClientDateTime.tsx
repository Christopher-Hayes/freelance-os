"use client";

/**
 * ClientDateTime Component
 * 
 * A client-side component that safely renders dates and times from UTC ISO strings.
 * Prevents hydration mismatches by only rendering after client-side mount.
 * 
 * Usage:
 *   <ClientDateTime value={utcIsoString} />
 *   <ClientDateTime value={utcIsoString} format="date" />
 *   <ClientDateTime value={utcIsoString} format="time" />
 *   <ClientDateTime value={utcIsoString} format="relative" />
 */

import { useEffect, useState } from 'react';
import { formatDateTime, formatDate, formatTime, formatRelative } from '@/lib/datetime';

interface ClientDateTimeProps {
  value: string; // UTC ISO string
  format?: 'datetime' | 'date' | 'time' | 'relative';
  options?: Intl.DateTimeFormatOptions;
  className?: string;
  title?: string; // Tooltip text (defaults to full datetime)
}

export function ClientDateTime({
  value,
  format = 'datetime',
  options,
  className,
  title,
}: ClientDateTimeProps) {
  const [isClient, setIsClient] = useState(false);
  const [formatted, setFormatted] = useState('');

  useEffect(() => {
    setIsClient(true);
    
    try {
      let result: string;
      switch (format) {
        case 'date':
          result = formatDate(value, options);
          break;
        case 'time':
          result = formatTime(value, options);
          break;
        case 'relative':
          result = formatRelative(value);
          break;
        default:
          result = formatDateTime(value, options);
      }
      setFormatted(result);
    } catch (error) {
      console.error('Error formatting datetime:', error);
      setFormatted('Invalid date');
    }
  }, [value, format, options]);

  // Don't render during SSR to avoid hydration mismatch
  if (!isClient) {
    return <span className={className}>&nbsp;</span>;
  }

  const defaultTitle = title ?? formatDateTime(value, {
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return (
    <time dateTime={value} title={defaultTitle} className={className}>
      {formatted}
    </time>
  );
}

/**
 * Convenience components for common formats
 */
export function ClientDate(props: Omit<ClientDateTimeProps, 'format'>) {
  return <ClientDateTime {...props} format="date" />;
}

export function ClientTime(props: Omit<ClientDateTimeProps, 'format'>) {
  return <ClientDateTime {...props} format="time" />;
}

export function ClientRelativeTime(props: Omit<ClientDateTimeProps, 'format'>) {
  return <ClientDateTime {...props} format="relative" />;
}
