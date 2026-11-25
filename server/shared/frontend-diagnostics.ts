const staticRoutes = new Set([
  '/', '/app', '/login', '/register', '/organization', '/employees', '/admin', '/system-settings',
  '/quotation', '/quotation-intl', '/quotation-management', '/cost', '/assembly-scheduling', '/production-report',
  '/production-entry', '/production-entry-injection', '/process', '/materials', '/customers', '/suppliers',
  '/customer-products', '/product-standards', '/engineering-changes',
]);

export function diagnosticRoute(pathname: string) {
  if (staticRoutes.has(pathname)) return pathname;
  if (/^\/materials\/[^/]+$/.test(pathname)) return '/materials/:id';
  return '/app';
}

export function isReleaseIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(value);
}

export function browserDiagnostic(agent: string) {
  const input = agent.slice(0, 512);
  const matchers = [
    ['Edge', /(?:Edg(?:A|iOS)?|Edge)\/([\d.]{1,24})/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]{1,24})/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]{1,24})/],
    ['Safari', /Version\/([\d.]{1,24}).*Safari/],
    ['IE', /(?:MSIE\s|rv:)([\d.]{1,24})/],
  ] as const;
  for (const [browser, pattern] of matchers) {
    const match = pattern.exec(input);
    if (match) return { browser, browserVersion: match[1] };
  }
  return { browser: 'Unknown', browserVersion: 'unknown' };
}
