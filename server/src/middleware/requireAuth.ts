import type { Request, Response, NextFunction } from 'express';
import { getXsuaaConfig, readSessionFromRequest } from '../services/authService.js';
import type { SessionPayload } from '../services/authService.js';
import { getSyncKey } from '../services/configService.js';

export interface AuthRequest extends Request {
  authSession?: SessionPayload;
}

function getSession(req: Request): SessionPayload | null {
  const x = getXsuaaConfig();
  if (!x) return null;
  return readSessionFromRequest(req.headers.cookie ?? '', x.clientsecret);
}

/** Requires any authenticated session. Pass-through when XSUAA is not configured. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!getXsuaaConfig()) { next(); return; }
  const session = getSession(req);
  if (!session) { res.status(401).json({ error: 'Authentication required' }); return; }
  (req as AuthRequest).authSession = session;
  next();
}

/**
 * Guards /api/download and /api/batch-download when a sync key is configured.
 * Allows the request if:
 *   - No sync key is configured (open access, backwards-compatible)
 *   - The x-sync-key request header matches the configured key
 *   - The request carries a valid XSUAA session cookie
 * Otherwise responds 401.
 */
export function requireSyncAuth(req: Request, res: Response, next: NextFunction): void {
  const syncKey = getSyncKey();
  if (!syncKey) { next(); return; }
  if (req.headers['x-sync-key'] === syncKey) { next(); return; }
  const x = getXsuaaConfig();
  if (x) {
    const session = readSessionFromRequest(req.headers.cookie ?? '', x.clientsecret);
    if (session) { next(); return; }
  }
  res.status(401).json({
    error: 'Unauthorized: provide a valid x-sync-key header or authenticate via XSUAA',
  });
}

/** Requires admin scope. Pass-through when XSUAA is not configured. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!getXsuaaConfig()) { next(); return; }
  const session = getSession(req);
  if (!session) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (!session.isAdmin) { res.status(403).json({ error: 'Admin role required' }); return; }
  (req as AuthRequest).authSession = session;
  next();
}
