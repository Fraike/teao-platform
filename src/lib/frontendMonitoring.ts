import { dedupeIntegration, globalHandlersIntegration } from '@sentry/react';
import type { BrowserOptions, ErrorEvent, StackFrame } from '@sentry/react';
import { browserDiagnostic, diagnosticRoute, isReleaseIdentifier } from '../../server/shared/frontend-diagnostics.ts';

interface PageContext {
  origin: string;
  pathname: string;
  userAgent: string;
}

const knownTypes = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError',
  'AggregateError', 'UnhandledRejection', 'DOMException', 'ChunkLoadError',
]);

function scriptUrl(value: string | undefined, origin: string) {
  if (!value) return;
  try {
    const url = new URL(value, origin);
    if (url.origin === origin && /^\/(assets|src)\/[A-Za-z0-9._/-]+\.(?:[cm]?js|tsx?)$/.test(url.pathname)) {
      return url.origin + url.pathname;
    }
  } catch { /* Other sources are excluded. */ }
}

function safeFrame(frame: StackFrame, origin: string): StackFrame[] {
  const filename = scriptUrl(frame.filename, origin);
  if (!filename) return [];
  return [{ filename, abs_path: filename,
    ...(Number.isSafeInteger(frame.lineno) ? { lineno: frame.lineno } : {}),
    ...(Number.isSafeInteger(frame.colno) ? { colno: frame.colno } : {}),
  }];
}

export function sanitizeFrontendEvent(event: ErrorEvent, context: PageContext): ErrorEvent | null {
  const sources = new Set<string>();
  const values = (event.exception?.values ?? []).slice(-5).flatMap(error => {
    const original = error.stacktrace?.frames ?? [];
    const frames = original.slice(-60).flatMap(frame => safeFrame(frame, context.origin));
    if (original.length && !frames.length) return [];
    for (const frame of frames) if (frame.filename) sources.add(frame.filename);
    const type = error.type && knownTypes.has(error.type) ? error.type : 'Error';
    const kind = error.mechanism?.handled === false ? 'unhandled' : 'runtime';
    return [{ type, value: `Frontend ${kind} exception`,
      ...(frames.length ? { stacktrace: { frames } } : {}),
    }];
  });
  if (!values.length) return null;
  const { browser, browserVersion } = browserDiagnostic(context.userAgent);
  const images = (event.debug_meta?.images ?? []).flatMap(image => {
    if (image.type !== 'sourcemap' || !/^[0-9a-f-]{36}$/i.test(image.debug_id)) return [];
    const code_file = scriptUrl(image.code_file, context.origin);
    return code_file && sources.has(code_file) ? [{ type: 'sourcemap' as const, code_file, debug_id: image.debug_id }] : [];
  });
  return {
    type: undefined,
    ...(event.event_id && /^[0-9a-f]{32}$/i.test(event.event_id) ? { event_id: event.event_id } : {}),
    ...(isReleaseIdentifier(event.release) ? { release: event.release } : {}),
    ...(typeof event.timestamp === 'number' && Number.isFinite(event.timestamp) ? { timestamp: event.timestamp } : {}),
    environment: 'production',
    platform: 'javascript',
    level: 'error',
    tags: { route: diagnosticRoute(context.pathname), browser, browser_version: browserVersion },
    exception: { values },
    ...(images.length ? { debug_meta: { images } } : {}),
  };
}

export function frontendMonitoringOptions(dsn: string, release: string, page: () => PageContext): BrowserOptions {
  return {
    dsn,
    release,
    environment: 'production',
    defaultIntegrations: false,
    integrations: [globalHandlersIntegration(), dedupeIntegration()],
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      stackFrameVariables: false, frameContextLines: 0 },
    sendClientReports: false,
    beforeSend(event, hint) {
      hint.attachments = [];
      return sanitizeFrontendEvent(event, page());
    },
  };
}
