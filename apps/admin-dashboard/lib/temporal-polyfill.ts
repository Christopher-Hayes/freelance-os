/**
 * Temporal API Polyfill Initialization
 * 
 * This module initializes the Temporal API polyfill and provides it as a global.
 * Import this once at the top of your app to enable Temporal support.
 */

import { Temporal } from '@js-temporal/polyfill';

// Make Temporal available globally (optional, for convenience)
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Temporal = Temporal;
}

export { Temporal };
