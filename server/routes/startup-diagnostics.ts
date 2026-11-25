import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import { browserDiagnostic, diagnosticRoute, isReleaseIdentifier } from '../shared/frontend-diagnostics.ts';

const reasons = new Set(['resource_error', 'startup_timeout', 'startup_exception']);
const startupRoutes = new Set(['/', '/app', '/login', '/register']);

export function parseStartupDiagnostic(input: unknown, userAgent: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 3) return null;
  const { reason, route, release } = input as Record<string, unknown>;
  if (typeof reason !== 'string' || !reasons.has(reason) || typeof route !== 'string' ||
      !startupRoutes.has(route) || !isReleaseIdentifier(release)) return null;
  return { reason, route: diagnosticRoute(route), release, ...browserDiagnostic(userAgent) };
}

function sameOrigin(req: Request) {
  try {
    const origin = new URL(req.get('origin') ?? '');
    const proto = req.get('x-forwarded-proto') === 'https' ? 'https:' : req.protocol + ':';
    return origin.protocol === proto && origin.host === req.get('host');
  } catch { return false; }
}

export function registerStartupDiagnostics(app: Express, log = (entry: string) => console.info(entry)) {
  const path = '/api/diagnostics/startup';
  let nextWindow = 0;
  let accepted = 0;
  app.post(path, (req, res, next) => {
    if (!sameOrigin(req)) { res.sendStatus(403); return; }
    if (!req.is('application/json')) { res.sendStatus(415); return; }
    const now = Date.now();
    if (now >= nextWindow) {
      nextWindow = now + 60_000;
      accepted = 0;
    }
    if (accepted++ >= 60) { res.sendStatus(429); return; }
    next();
  }, express.json({ limit: '1kb' }), (req, res) => {
    const diagnostic = parseStartupDiagnostic(req.body, req.get('user-agent') ?? '');
    if (!diagnostic) { res.sendStatus(400); return; }
    log(JSON.stringify({ event: 'frontend_startup_failure', ...diagnostic }));
    res.sendStatus(204);
  });
  app.use(path, (error: { status?: number }, _req: Request, res: Response, next: NextFunction) => {
    if (error.status === 413 || error.status === 400) { res.sendStatus(error.status); return; }
    next(error);
  });
}
