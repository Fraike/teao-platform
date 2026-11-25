import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { captureException, flush, init, reactErrorHandler } from '@sentry/react';
import { sanitizeFrontendEvent, frontendMonitoringOptions } from '../src/lib/frontendMonitoring.ts';
import { parseStartupDiagnostic, registerStartupDiagnostics } from '../server/routes/startup-diagnostics.ts';
import { allowedArtifact } from '../server/scripts/release-common.js';

test('frontend event keeps only typed diagnostics and first-party frames', () => {
  const origin = 'https://teao.work';
  const event = sanitizeFrontendEvent({
    type: undefined, user: { id: 'private-user' }, request: { url: origin + '/login?token=secret' },
    message: 'private-message', breadcrumbs: [{ message: 'private-breadcrumb' }],
    exception: { values: [{ type: 'TypeError', value: 'private-message', stacktrace: { frames: [
      { filename: origin + '/assets/index-abc.js?token=secret', lineno: 21, colno: 3, vars: { value: 'secret' } },
      { filename: 'chrome-extension://secret/content.js', lineno: 1 },
    ] } }] },
    debug_meta: { images: [{ type: 'sourcemap', debug_id: '7a1cff33-ebe2-42a4-9edc-4afb6548137f', code_file: origin + '/assets/index-abc.js?q=secret' }] },
  }, { origin, pathname: '/materials/PRIVATE-ID', userAgent: 'Chrome/154.0.0.0 Edg/154.0.0.0' });
  assert(event);
  assert.deepEqual(event.tags, { route: '/materials/:id', browser: 'Edge', browser_version: '154.0.0.0' });
  assert.equal(event.exception?.values?.[0].stacktrace?.frames?.[0].filename, origin + '/assets/index-abc.js');
  assert.equal(event.debug_meta?.images?.length, 1);
  assert(!JSON.stringify(event).match(/secret|private|PRIVATE-ID|chrome-extension/i));
  assert.equal(sanitizeFrontendEvent({
    type: undefined, exception: { values: [{ type: 'Error', stacktrace: { frames: [{ filename: 'https://external.test/script.js' }] } }] },
  }, { origin, pathname: '/login', userAgent: '' }), null);
});

test('startup collector validates fixed diagnostics and source maps stay out of release artifacts', () => {
  const diagnostic = parseStartupDiagnostic({ reason: 'startup_timeout', route: '/login', release: 'abc12345' }, 'Edg/154.0.4258.37');
  assert.deepEqual(diagnostic, { reason: 'startup_timeout', route: '/login', release: 'abc12345', browser: 'Edge', browserVersion: '154.0.4258.37' });
  assert.equal(parseStartupDiagnostic({ reason: 'startup_timeout', route: '/login?token=x', release: 'abc12345' }, ''), null);
  assert.equal(parseStartupDiagnostic({ reason: 'startup_timeout', route: '/login', release: 'abc12345', token: 'secret' }, ''), null);
  assert(!allowedArtifact('dist/assets/index-abc.js.map'));
  assert(!allowedArtifact('dist/.env.sentry-build-plugin'));
});

test('React and SDK capture of the same exception use one sanitized envelope', async () => {
  const output: unknown[] = [];
  const origin = 'https://teao.work';
  const client = init({
    ...frontendMonitoringOptions('https://abc123@example.invalid/1', 'test-release', () => ({ origin, pathname: '/login', userAgent: 'Edg/154.0' })),
    transport: () => ({
      send: async envelope => { output.push(envelope); return { statusCode: 200 }; },
      flush: async () => true,
    }),
  });
  const error = new TypeError('PRIVATE_EXCEPTION');
  error.stack = `TypeError: PRIVATE_EXCEPTION\n    at handler (${origin}/assets/index-123.js?token=PRIVATE_VALUE:1:7)`;
  reactErrorHandler()(error, { componentStack: 'PRIVATE_COMPONENT' });
  captureException(error);
  await flush(1000);
  assert.equal(output.length, 1, JSON.stringify(output));
  const body = JSON.stringify(output[0]);
  assert(body.includes('test-release') && body.includes('index-123.js') && body.includes('Frontend'));
  assert(!body.match(/PRIVATE|token=/));
  await client?.close();
});

test('startup HTTP endpoint logs valid same-origin events and bounds unsolicited input', async () => {
  const require = createRequire(new URL('../server/package.json', import.meta.url));
  const express = require('express');
  const app = express();
  const entries: string[] = [];
  registerStartupDiagnostics(app, value => entries.push(value));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ reason: 'resource_error', route: '/login', release: 'test-release' });
  function post(payload: string, origin = base) {
    return fetch(base + '/api/diagnostics/startup', { method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'user-agent': 'Chrome/154.0 Edg/154.0' }, body: payload });
  }
  try {
    assert.equal((await post(body, 'https://external.test')).status, 403);
    assert.equal((await post(JSON.stringify({ raw: 'x'.repeat(2000) }))).status, 413);
    assert.equal((await post(JSON.stringify({ reason: 'resource_error', route: '/login?token=x', release: 'test-release' }))).status, 400);
    assert.equal((await post(body)).status, 204);
    assert.deepEqual(entries.map(value => JSON.parse(value)), [{
      event: 'frontend_startup_failure', reason: 'resource_error', route: '/login', release: 'test-release', browser: 'Edge', browserVersion: '154.0',
    }]);
    await Promise.all(Array.from({ length: 57 }, () => post(body)));
    assert.equal((await post(body)).status, 429);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
