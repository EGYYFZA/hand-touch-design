import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createWebHandler } from '../../server/web-handler.mjs';
import { readBody } from '../../server/security.mjs';
import { readFile } from 'node:fs/promises';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'synthetic', SUPABASE_SECRET_KEY: 'synthetic',
  SESSION_SECRET: randomBytes(32).toString('base64'), CRON_SECRET: randomBytes(32).toString('base64url'), APP_ORIGIN: 'https://studio.example' };

test('Netlify adapter preserves binary PNG and separate secure cookies while trusting platform IP only', async () => {
  const body = Buffer.from([137, 80, 78, 71, 0, 255]);
  const handler = createWebHandler({ env, handler: async (req, res) => {
    assert.equal(req.socket.remoteAddress, '192.0.2.1');
    assert.equal(req.url, '/api/studio?action=upload');
    assert.deepEqual(await readBody(req), body);
    res.setHeader('Set-Cookie', ['__Host-egz_session=one; Path=/; HttpOnly; Secure', '__Host-egz_csrf=two; Path=/; HttpOnly; Secure']);
    assert.equal(res.getHeader('Set-Cookie').length, 2);
    res.writeHead(200, { 'Content-Type': 'image/png' }).end(body);
  } });
  const result = await handler(new Request(env.APP_ORIGIN + '/api/studio?action=upload', { method: 'POST', headers: { 'X-Forwarded-For': 'evil', 'X-Nf-Client-Connection-Ip': 'evil' }, body }), { ip: '192.0.2.1' });
  assert.equal(result.status, 200); assert.deepEqual(Buffer.from(await result.arrayBuffer()), body);
  assert.equal(result.headers.getSetCookie().length, 2);
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
  assert.match(result.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});

test('preview domains, HTTP and missing configuration cannot reach the production handler', async () => {
  let calls = 0;
  const handler = createWebHandler({ env, handler: () => { calls++; } });
  for (const origin of ['https://preview.example', 'http://studio.example']) {
    assert.equal((await handler(new Request(origin + '/api/studio'))).status, 403);
  }
  assert.equal((await createWebHandler({ env: {} })(new Request(env.APP_ORIGIN))).status, 503);
  assert.equal(calls, 0);
});

test('Netlify request streaming preserves server byte limits and sanitizes uncaught errors', async () => {
  const handler = createWebHandler({ env, handler: async req => { await readBody(req, 4); } });
  const result = await handler(new Request(env.APP_ORIGIN + '/api/studio', { method: 'POST', body: 'oversized-body' }));
  assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /oversized-body|stack|body_too_large/);
});

test('Netlify and Vercel use the same security header policy', async () => {
  const policy = JSON.parse(await readFile(new URL('../../config/security-headers.json', import.meta.url)));
  const vercel = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url)));
  assert.deepEqual(Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value])), policy);
});
