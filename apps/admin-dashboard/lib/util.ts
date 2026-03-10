
import { ActivitySession } from '@/app/time/components/timeline/utils';
import { Temporal } from '@/lib/temporal-polyfill';

const APP_TITLE_RENAMES_STORAGE_KEY = 'appTitleRenames';

/**
 * Fetch wrapper that redirects to login on 401 Unauthorized
 * Use this for all authenticated API calls from client components
 */
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  
  if (response.status === 401) {
    // Redirect to login with callback URL
    const callbackUrl = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?callbackUrl=${callbackUrl}`;
    // Throw to prevent further processing
    throw new Error('Unauthorized - redirecting to login');
  }
  
  return response;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    const context = this;
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    if (immediate && timeout === null) {
      func.apply(context, args);
    }
    
    timeout = setTimeout(() => {
      timeout = null;
      if (!immediate) {
        func.apply(context, args);
      }
    }, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  timeFrame: number
): (...args: Parameters<T>) => void {
  let lastTime: Temporal.Instant | null = null;
  
  return function(...args: Parameters<T>) {
    const now = Temporal.Now.instant();
    
    if (lastTime === null || now.since(lastTime).total('milliseconds') >= timeFrame) {
      func(...args);
      lastTime = now;
    }
  };
}

const REMOVE_TITLE_PREFIXES = ['org.gnome.', 'com.microsoft.'];
const APP_NAME_OVERRIDES: Record<string, string> = {
  'code': 'VS Code',
  'code-oss': 'VS Code',
  'google-chrome': 'Google Chrome',
  'nautilus': 'Files',
  'systemmonitor': 'System Monitor',
  'ptyxis': 'Terminal',
  'Soffice': 'LibreOffice',
};

function getUserAppTitleRenames(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(APP_TITLE_RENAMES_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return {};
    }

    return parsed.reduce<Record<string, string>>((acc, entry) => {
      if (typeof entry !== 'string') {
        return acc;
      }

      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) {
        return acc;
      }

      const source = entry.slice(0, separatorIndex).trim();
      const target = entry.slice(separatorIndex + 1).trim();

      if (source && target) {
        acc[source.toLowerCase()] = target;
      }

      return acc;
    }, {});
  } catch {
    return {};
  }
}

export function formatAppTitle(appClass: string): string {
  let appName = appClass || "Unknown App";

  const userOverrides = getUserAppTitleRenames();
  const directUserOverride = userOverrides[appName.toLowerCase()];
  if (directUserOverride) {
    return directUserOverride;
  }

  // Remove common prefixes
  for (const prefix of REMOVE_TITLE_PREFIXES) {
    if (appName.startsWith(prefix)) {
      appName = appName.slice(prefix.length);
      break;
    }
  }

  // If it's in "firefox_firefox" format, take first part
  if (appName.includes('_')) {
    if (appName.split('_').length === 2 && appName.split('_')[0] === appName.split('_')[1]) {
      appName = appName.split('_')[0]!;
    }
  }

  // If it's in a org.example.example type of format, then take the last part
  if (appName.includes('.') && appName.split('.').length >= 2) {
    const parts = appName.split('.');
    appName = parts[parts.length - 1]!;
  }

  // If there are any hyphens, replace them with spaces and capitalize words
  if (appName.includes('-')) {
    appName = appName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  // Apply name overrides
  appName = userOverrides[appName.toLowerCase()] || APP_NAME_OVERRIDES[appName.toLowerCase()] || appName;

  return `${appName?.[0]?.toUpperCase() ?? ''}${appName.slice(1)}`;
}

/**
 * Get the Monday (start) of the week for a given date (ISO week)
 * @param date Any date in the week
 * @returns PlainDate representing Monday of that week
 */
export function getWeekStart(date: Date | Temporal.PlainDate): Temporal.PlainDate {
  const plainDate = date instanceof Date 
    ? Temporal.PlainDate.from(date.toISOString().split('T')[0]!)
    : date;
  
  // Get day of week (1 = Monday, 7 = Sunday in ISO)
  const dayOfWeek = plainDate.dayOfWeek;
  
  // Subtract days to get to Monday
  const daysToSubtract = dayOfWeek - 1;
  return plainDate.subtract({ days: daysToSubtract });
}

/**
 * Get the Sunday (end) of the week for a given date (ISO week)
 * @param date Any date in the week
 * @returns PlainDate representing Sunday of that week
 */
export function getWeekEnd(date: Date | Temporal.PlainDate): Temporal.PlainDate {
  const weekStart = getWeekStart(date);
  return weekStart.add({ days: 6 });
}

/**
 * Format a week range as "MMM D - D, YYYY" or "MMM D - MMM D, YYYY" if crossing months
 * @param weekStart Monday of the week
 * @returns Formatted string like "Jan 15 - 21, 2024" or "Jan 29 - Feb 4, 2024"
 */
export function formatWeekRange(weekStart: Date | Temporal.PlainDate): string {
  const start = weekStart instanceof Date 
    ? Temporal.PlainDate.from(weekStart.toISOString().split('T')[0]!)
    : weekStart;
  const end = start.add({ days: 6 });
  
  const startMonth = start.toLocaleString('en-US', { month: 'short' });
  const endMonth = end.toLocaleString('en-US', { month: 'short' });
  const startDay = start.day;
  const endDay = end.day;
  const year = end.year;
  
  if (start.month === end.month) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  } else {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  }
}

/**
 * Convert a PlainDate to a Date object at midnight UTC
 */
export function plainDateToUTC(plainDate: Temporal.PlainDate): Date {
  return new Date(plainDate.toString() + 'T00:00:00.000Z');
}
