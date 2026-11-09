import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { createStudioHandler } from '../../server/backend.mjs';
import { MAX_UPLOAD, readBody, readJson, normalizePng, hash, encrypt } from '../../server/security.mjs';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'synthetic', SUPABASE_SECRET_KEY: 'synthetic',
  SESSION_SECRET: randomBytes(32).toString('base64'), CRON_SECRET: randomBytes(32).toString('base64url'), APP_ORIGIN: 'https://studio.example' };
const csrf = 'x'.repeat(43);
const validHeaders = { origin: env.APP_ORIGIN, cookie: `__Host-egz_csrf=${csrf}`, 'x-csrf-token': csrf };
async function invoke(action, { method = 'GET', headers = {}, body, service = {} } = {}) {
  let status, result;
  const output = {};
  const handler = createStudioHandler({ env, clientFactory: () => service, logger() {} });
  await handler({ method, url: `/api/studio?action=${action}`, headers, body, socket: { remoteAddress: '127.0.0.1' } }, {
    setHeader(name, value) { output[name] = value; }, getHeader(name) { return output[name]; },
    writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); },
  });
  return { status, result, headers: output };
}

test('anonymous access to every private action is denied without provider queries', async () => {
  for (const action of ['photos', 'admin-photos', 'photo&id=11111111-1111-4111-8111-111111111111']) {
    assert.equal((await invoke(action)).status, 401);
  }
  for (const action of ['upload', 'remove', 'consent', 'logout', 'mfa-enroll', 'mfa-verify']) {
    assert.equal((await invoke(action, { method: 'POST', headers: validHeaders, body: {} })).status, 401);
  }
  assert.equal((await invoke('retention', { headers: { authorization: 'Bearer forged' } })).status, 401);
});

test('missing origin, mismatched CSRF and hostile origins fail before persistence', async () => {
  for (const headers of [{}, { ...validHeaders, origin: 'null' }, { ...validHeaders, origin: 'https://studio.example.evil.test' },
    { ...validHeaders, cookie: '' }, { ...validHeaders, 'x-csrf-token': 'forged' }]) {
    assert.equal((await invoke('login', { method: 'POST', headers, body: {} })).status, 403);
  }
});

test('declared and chunked request bodies enforce the same byte ceiling and JSON shape', async () => {
  await assert.rejects(readBody({ headers: { 'content-length': '8193' }, body: '' }), { status: 413 });
  const chunks = Readable.from([Buffer.alloc(4096), Buffer.alloc(4097)]); chunks.headers = {};
  await assert.rejects(readBody(chunks), { status: 413 });
  for (const body of ['null', '[]', 'true', '"value"', '{invalid']) {
    await assert.rejects(readJson({ headers: {}, body }), { status: 400 });
  }
});

test('rate-limit rejection and limiter outages fail closed without returning provider errors', async () => {
  for (const [rateResult, status] of [[{ data: false, error: null }, 429], [{ data: null, error: { message: 'private-provider-detail' } }, 503]]) {
    let calls = 0;
    const result = await invoke('login', { method: 'POST', headers: validHeaders, body: {}, service: {
      async rpc(name) { calls++; assert.equal(name, 'egz_rate_limit'); return rateResult; },
    } });
    assert.equal(calls, 1); assert.equal(result.status, status);
    assert.doesNotMatch(JSON.stringify(result), /private-provider-detail/);
  }
});

test('invalid encrypted and expired sessions cannot reach an identity provider', async () => {
  const token = 'y'.repeat(43), tokenHash = hash(token);
  const session = { expires_at: new Date(Date.now() + 60000).toISOString(), owner_id: 'dummy-owner' };
  const validTokens = { access_token: 'dummy-token', refresh_token: 'dummy-refresh', expires_at: Date.now() / 1000 + 3600 };
  for (const row of [{ ...session, expires_at: '2000-01-01T00:00:00Z' }, { ...session, tokens_encrypted: 'broken' },
    { ...session, tokens_encrypted: encrypt(validTokens, env.SESSION_SECRET, 'another-session') }]) {
    const result = await invoke('admin-photos', { headers: { cookie: `__Host-egz_session=${token}` }, service: {
      from(name) { assert.equal(name, 'egz_sessions'); return { select() { return this; }, eq(key, value) {
        assert.equal(key, 'token_hash'); assert.equal(value, tokenHash); return this;
      }, async maybeSingle() { return { data: row, error: null }; } }; },
    } });
    assert.equal(result.status, 401);
  }
});

test('PNG re-encoding removes appended payloads and rejects oversized or invalid images', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#bcff72' } }).png().toBuffer();
  const normalized = await normalizePng(Buffer.concat([png, Buffer.from('<script>synthetic-payload</script>')]));
  assert.equal(normalized.buffer.includes(Buffer.from('synthetic-payload')), false);
  assert.equal(normalized.width, 2); assert.equal(normalized.height, 2);
  await assert.rejects(normalizePng(Buffer.alloc(MAX_UPLOAD + 1)));
  const tooWide = await sharp({ create: { width: 8193, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(normalizePng(tooWide));
});

test('isolated HTTP loopback denies private requests and emits no permissive CORS', async () => {
  const handler = createStudioHandler({ env, clientFactory: () => ({}), logger() {} });
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(origin + '/api/studio?action=admin-photos');
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const hostile = await fetch(origin + '/api/studio?action=remove', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' });
    assert.equal(hostile.status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
