// Read-only checks against an explicitly selected deployment; no credentials.
import assert from 'node:assert/strict';

const origin = process.argv[2];
if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('Provide the exact authorized HTTPS origin, without trailing slash');
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const request = (path, options = {}) => fetch(origin + path, { ...options, redirect: 'manual', signal: AbortSignal.timeout(30000) });
const http = await fetch(origin.replace('https:', 'http:') + '/', { redirect: 'manual', signal: AbortSignal.timeout(30000) });
check('HTTP redirects to the canonical HTTPS origin', [301, 302, 307, 308].includes(http.status) && http.headers.get('location')?.startsWith(origin));
const home = await request('/');
check('public studio returns HTML over HTTPS', home.status === 200 && home.headers.get('content-type')?.includes('text/html'));
for (const [name, fragment] of Object.entries({ 'content-security-policy': "form-action 'self'", 'strict-transport-security': 'max-age=', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'permissions-policy': 'microphone=()' })) {
  check(`static ${name} is present`, home.headers.get(name)?.includes(fragment));
}
for (const path of ['/.env', '/.env.local', '/.git/config', '/secrets/netlify-production.env', '/server/config.mjs', '/core/pipeline.py', '/captures/private.png', '/.netlify/state.json']) {
  check(`private path is not published: ${path}`, [403, 404].includes((await request(path)).status));
}
const session = await request('/api/studio?action=session');
check('API returns configured anonymous JSON', session.status === 200 && (await session.clone().json()).configured === true && (await session.json()).user === null);
check('API is not cacheable and shares security headers', session.headers.get('cache-control')?.includes('no-store') && session.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
check('CSRF cookie uses Secure HttpOnly host-only prefix', session.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-egz_csrf=') && cookie.includes('Secure') && cookie.includes('HttpOnly') && cookie.includes('Path=/') && !cookie.includes('Domain=')));
for (const action of ['photos', 'admin-photos']) check(`anonymous ${action} denied`, (await request(`/api/studio?action=${action}`)).status === 401);
const denied = await request('/api/studio?action=login', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
check('cross-origin mutation is denied without permissive CORS', denied.status === 403 && !denied.headers.has('access-control-allow-origin'));
const options = await request('/api/studio?action=session', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
check('cross-origin preflight is not allowed', options.status === 405 && !options.headers.has('access-control-allow-origin'));
check('unsupported API method is denied', (await request('/api/studio?action=session', { method: 'DELETE' })).status === 405);
check('default function URL does not bypass the custom API route', (await request('/.netlify/functions/studio')).status === 404);
console.log(JSON.stringify({ origin, passed: checks.length, checks }, null, 2));
