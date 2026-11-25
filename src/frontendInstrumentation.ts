import { init, reactErrorHandler } from '@sentry/react';
import { frontendMonitoringOptions } from './lib/frontendMonitoring';

const dsn = import.meta.env.PROD ? import.meta.env.VITE_SENTRY_DSN?.trim() : '';
const release = import.meta.env.VITE_APP_RELEASE?.trim();

if (dsn && release) {
  init(frontendMonitoringOptions(dsn, release, () => ({
    origin: window.location.origin,
    pathname: window.location.pathname,
    userAgent: window.navigator.userAgent,
  })));
}

export const captureReactError = dsn && release ? reactErrorHandler() : undefined;
