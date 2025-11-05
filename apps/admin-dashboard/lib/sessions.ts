// Shared session store for admin authentication
// In production, replace with Redis or database

export interface Session {
  createdAt: number;
  expiresAt: number;
}

// Use globalThis to ensure we have a single instance across hot reloads
declare global {
  var adminSessions: Map<string, Session> | undefined;
}

export const sessions = globalThis.adminSessions ?? new Map<string, Session>();

if (process.env.NODE_ENV !== 'production') {
  globalThis.adminSessions = sessions;
}

// Clean up expired sessions every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
      if (session.expiresAt < now) {
        sessions.delete(token);
      }
    }
  }, 60 * 60 * 1000);
}

export const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
