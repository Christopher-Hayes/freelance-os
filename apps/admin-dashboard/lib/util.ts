
import { ActivitySession } from '@/app/time/components/timeline/utils';
import { Temporal } from '@/lib/temporal-polyfill';

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
};

export function formatAppTitle(appClass: string): string {
  let appName = appClass || "Unknown App";

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

  // If it's in org.example.example format, take last part
  if (appName.includes('.')) {
    const parts = appName.split('.');
    if (parts.length >= 2 && parts[parts.length - 1] === parts[parts.length - 2]) {
      appName = parts[parts.length - 1]!;
    }
  }

  // If there are any hyphens, replace them with spaces and capitalize words
  if (appName.includes('-')) {
    appName = appName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  // Apply name overrides
  appName = APP_NAME_OVERRIDES[appName.toLowerCase()] || appName;

  return `${appName?.[0]?.toUpperCase() ?? ''}${appName.slice(1)}`;
}
