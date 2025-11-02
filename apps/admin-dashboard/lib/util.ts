
import { Temporal } from '@/lib/temporal-polyfill';

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
