import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, secureEqual, validateOrigin, normalizePng } from '../../server/security.mjs';
import { tokenEnvelope, createSession } from '../../server/sessions.mjs';
import { configuration } from '../../server/config.mjs';
import { createStudioHandler } from '../../server/backend.mjs';

test('encrypted session data cannot be read after tampering or used with another session', () => {
  const key = randomBytes(32).toString('base64');
  const value = encrypt({ access_token: 'private-token' }, key, 'session-a');
  assert.equal(value.includes('private-token'), false);
  assert.deepEqual(decrypt(value, key, 'session-a'), { access_token: 'private-token' });
  assert.throws(() => decrypt(value, key, 'session-b'));
  assert.throws(() => decrypt(value.slice(0, -5) + 'xxxxx', key, 'session-a'));
  assert.equal(secureEqual('same', 'same'), true);
  assert.equal(secureEqual('same', 'different'), false);
});

test('state changes require an explicit configured same origin', () => {
  assert.equal(validateOrigin('https://studio.example', 'https://studio.example'), true);
  for (const origin of [undefined, 'null', 'https://studio.example.evil.test', 'https://evil.test']) {
    assert.equal(validateOrigin(origin, 'https://studio.example'), false);
  }
});

test('upload validation rejects non-PNG and corrupt PNG rather than trusting MIME', async () => {
  await assert.rejects(normalizePng(Buffer.from('<svg>not a PNG</svg>')));
  await assert.rejects(normalizePng(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
});

test('MFA provider results without expires_at retain a refreshable expiry', () => {
  const now = Date.now() / 1000;
  const tokens = tokenEnvelope({ access_token: 'mfa-token', refresh_token: 'mfa-refresh', expires_in: 3600 });
  assert.ok(tokens.expires_at >= now + 3598 && tokens.expires_at <= now + 3601);
  assert.throws(() => tokenEnvelope({ access_token: 'broken' }));
});

test('public signup stays closed before any provider email request when SMTP is pending', async () => {
  const csrf = 'x'.repeat(43); let rateCalls = 0;
  const handler = createStudioHandler({ env: {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SECRET_KEY: 'test',
    SESSION_SECRET: randomBytes(32).toString('base64'), CRON_SECRET: 'synthetic-test-secret-32-characters', APP_ORIGIN: 'http://127.0.0.1:4173',
  }, clientFactory: () => ({ rpc: async () => { rateCalls++; return { data: true, error: null }; } }) });
  const headers = {}; let status, body;
  await handler({ method: 'POST', url: '/api/studio?action=signup', socket: { remoteAddress: '127.0.0.1' },
    headers: { origin: 'http://127.0.0.1:4173', cookie: `egz_csrf=${csrf}`, 'x-csrf-token': csrf },
    body: { email: 'synthetic@example.invalid', password: 'synthetic-password' },
  }, { setHeader(name,value) { headers[name] = value; }, getHeader(name) { return headers[name]; },
    writeHead(code) { status = code; }, end(value) { body = JSON.parse(value); } });
  assert.equal(rateCalls, 2);
  assert.equal(status, 503);
  assert.match(body.error, /Pendaftaran umum belum dibuka/);
});

test('backend fails closed for invalid origins, weak retention secrets and shared keys', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SECRET_KEY: 'test',
    SESSION_SECRET: randomBytes(32).toString('base64'), CRON_SECRET: randomBytes(32).toString('base64url'), APP_ORIGIN: 'https://studio.example' };
  assert.equal(configuration(env).cookieName, '__Host-egz_session');
  for (const override of [{ APP_ORIGIN: 'http://studio.example' }, { APP_ORIGIN: 'ftp://localhost' },
    { SUPABASE_SECRET_KEY: ' ' }, { CRON_SECRET: 'weak' }, { CRON_SECRET: env.SESSION_SECRET }, { SESSION_SECRET: env.SESSION_SECRET + 'ignored!' }]) {
    assert.throws(() => configuration({ ...env, ...override }));
  }
});

test('session upgrade cannot resurrect a revoked session or issue cookies on failed revocation', async () => {
  const cfg = { encryptionKey: randomBytes(32).toString('base64'), cookieName: 'egz_session', csrfCookie: 'egz_csrf', secure: false };
  const session = { user: { id: 'test-user' }, access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600 };
  for (const revokeResult of [{ data: [], error: null }, { data: null, error: { message: 'synthetic failure' } }]) {
    const rows = new Map(); let cookies = 0;
    const service = { from() { return {
      async insert(row) { rows.set(row.token_hash, row); return { error: null }; },
      delete() { return { eq(key, value) {
        rows.delete(value);
        return { ...Promise.resolve({ error: null }), then(resolve) { resolve({ error: null }); }, select: async () => revokeResult };
      } }; },
    }; } };
    await assert.rejects(createSession(session, 'old-csrf', cfg, service, { setHeader() { cookies++; } }, 'revoked-old-hash', true));
    assert.equal(rows.size, 0, 'new orphan session is removed');
    assert.equal(cookies, 0, 'no upgraded cookie issued');
  }
});
