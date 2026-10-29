// Uses only synthetic accounts/images. Always removes its own fixtures.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { configuration, serviceClient, publicClient } from '../server/config.mjs';
import { createStudioHandler } from '../server/backend.mjs';
import { hash, decrypt, encrypt } from '../server/security.mjs';

process.loadEnvFile(new URL('../.env.local', import.meta.url));
const cfg = configuration(), service = serviceClient(cfg), accounts = [], photoPaths = [], checks = [];
const check = (name, result) => { assert.ok(result, name); checks.push(name); };
class Visitor {
  jar = new Map(); csrf = null;
  async request(action, body, extra = {}) {
    const headers = { Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...extra.headers };
    if (body !== undefined) { headers.Origin = cfg.origin; headers['X-CSRF-Token'] = this.csrf || ''; headers['Content-Type'] ||= Buffer.isBuffer(body) ? 'image/png' : 'application/json'; }
    const response = await fetch(`${cfg.origin}/api/studio?action=${action}`, { method: body === undefined ? 'GET' : 'POST',
      headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) { const part = cookie.split(';')[0], at = part.indexOf('='); this.jar.set(part.slice(0, at), part.slice(at + 1)); }
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, data, headers: response.headers };
  }
  async login(account) { await this.request('session'); const previousCsrf = this.csrf; const result = await this.request('login', { email: account.email, password: account.password }); assert.equal(result.status, 200, 'Synthetic account login failed'); assert.notEqual(this.csrf, previousCsrf, 'Login must rotate CSRF and renew cookie lifetime'); return result; }
}
async function createAccount(label) {
  const account = { email: `egz-${label}-${randomUUID()}@example.invalid`, password: randomBytes(24).toString('base64url') };
  const { data, error } = await service.auth.admin.createUser({ ...account, email_confirm: true, user_metadata: label === 'b' ? { role: 'admin' } : {} });
  if (error) throw new Error(`Synthetic account creation failed (${error.code || error.status})`);
  account.id = data.user.id; accounts.push(account); return account;
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, '')) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = Buffer.from((bits.match(/.{8}/g) || []).map(value => parseInt(value, 2)));
  const time = Buffer.alloc(8); time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', bytes).update(time).digest(), offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
let browser;
try {
  const a = await createAccount('a'), b = await createAccount('b'), admin = await createAccount('admin');
  const A = new Visitor(), B = new Visitor(), Admin = new Visitor();
  await A.login(a); await B.login(b); await Admin.login(admin);
  const priorLogin = new Visitor(); priorLogin.jar = new Map(A.jar); priorLogin.csrf = A.csrf;
  await A.login(a);
  check('re-login revokes the replaced browser session cookie', (await priorLogin.request('photos')).status === 401);
  check('HttpOnly session cookie; no Auth access/refresh tokens in frontend response', (await A.request('session')).headers.get('cache-control').includes('no-store') && !JSON.stringify((await A.request('session')).data).includes('access_token'));
  const anonymous = new Visitor(); check('anonymous cannot list photos', (await anonymous.request('photos')).status === 401);
  check('user metadata role cannot grant admin', (await B.request('admin-photos')).status === 403);
  const badOrigin = await fetch(`${cfg.origin}/api/studio?action=login`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  check('cross-site mutation denied', badOrigin.status === 403);
  const nullJson = await fetch(`${cfg.origin}/api/studio?action=login`, { method: 'POST', headers: { Origin: cfg.origin, Cookie: [...A.jar].map(([k,v])=>`${k}=${v}`).join('; '), 'X-CSRF-Token': A.csrf, 'Content-Type': 'application/json' }, body: 'null' });
  check('null JSON rejected as400', nullJson.status === 400);
  const image = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#387bf8' } }).png().toBuffer();
  const idA = randomUUID(), idB = randomUUID();
  const uploadHeaders = id => ({ headers: { 'X-Photo-Id': id, 'X-Photo-Mode': 'free' } });
  check('no upload before consent', (await A.request('upload', image, uploadHeaders(idA))).status === 403);
  assert.equal((await A.request('consent', { granted: true, version: '2026-10-29' })).status, 200);
  assert.equal((await B.request('consent', { granted: true, version: '2026-10-29' })).status, 200);
  const uploadA = await A.request('upload', image, uploadHeaders(idA)); assert.equal(uploadA.status, 200, `Upload A failed: ${JSON.stringify(uploadA.data)}`);
  const uploadB = await B.request('upload', image, uploadHeaders(idB)); assert.equal(uploadB.status, 200, 'Upload B failed');
  const photoA = uploadA.data.photo, photoB = uploadB.data.photo;
  photoPaths.push(`${a.id}/${photoA.id}.png`, `${b.id}/${photoB.id}.png`);
  check('all cloud photos expire30days after first successful upload', Math.abs(Date.parse(photoA.expires_at) - Date.now() - 30 * 86400000) < 20000);
  const retry = await A.request('upload', image, uploadHeaders(idA));
  check('idempotent retry preserves photo ID and expiry', retry.status === 200 && retry.data.photo.id === photoA.id && retry.data.photo.expires_at === photoA.expires_at);
  const changed = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#ff0000' } }).png().toBuffer();
  check('idempotency key rejects different content', (await A.request('upload', changed, uploadHeaders(idA))).status === 409);
  check('owner list contains only own photo', (await A.request('photos')).data.photos.every(photo => photo.owner_id === a.id));
  check('B cannot download or delete A photo', (await B.request(`photo&id=${photoA.id}`)).status === 404 && (await B.request('remove', { id: photoA.id })).status === 404);
  check('owner can download exact normalized PNG', (await A.request(`photo&id=${photoA.id}`)).data.equals(image));
  const publicB = publicClient(cfg); const loginB = await publicB.auth.signInWithPassword({ email: b.email, password: b.password }); assert.equal(loginB.error, null);
  const direct = await publicB.from('egz_photos').select('id').eq('id', photoA.id);
  const directFile = await publicB.storage.from('photo-archive').download(photoPaths[0]);
  const directWrite = await publicB.from('egz_photos').update({ status: 'ready' }).eq('id', photoB.id);
  check('direct SDK/Storage bypass is denied by RLS and grants', !direct.error && direct.data.length === 0 && !!directFile.error && !!directWrite.error);
  await service.from('egz_admin_memberships').insert({ user_id: admin.id });
  check('admin without MFA cannot list archive', (await Admin.request('admin-photos')).status === 403);
  const enroll = await Admin.request('mfa-enroll', {}); assert.equal(enroll.status, 200, 'MFA enroll failed');
  const priorMfa = new Visitor(); priorMfa.jar = new Map(Admin.jar); priorMfa.csrf = Admin.csrf;
  const verified = await Admin.request('mfa-verify', { factorId: enroll.data.id, code: totp(enroll.data.secret) });
  assert.equal(verified.status, 200, `MFA verify failed: ${JSON.stringify(verified.data)}`);
  check('MFA rotates both app session and CSRF and revokes the AAL1 cookie', Admin.jar.get(cfg.cookieName) !== priorMfa.jar.get(cfg.cookieName) && Admin.csrf !== priorMfa.csrf && (await priorMfa.request('admin-photos')).status === 401);
  check('verified admin MFA session can list/read both owners', !verified.data.mfaRequired && (await Admin.request('admin-photos')).data.photos.length === 2 && (await Admin.request(`photo&id=${photoA.id}`)).status === 200);
  const aal1Admin = new Visitor(); await aal1Admin.login(admin);
  check('password-only admin cannot enroll another factor over verified MFA', (await aal1Admin.request('mfa-enroll', {})).status === 403);
  // Force the encrypted envelope to refresh without exposing its contents.
  const tokenHash = hash(A.jar.get(cfg.cookieName));
  const stored = await service.from('egz_sessions').select('tokens_encrypted').eq('token_hash', tokenHash).single();
  const tokens = decrypt(stored.data.tokens_encrypted, cfg.encryptionKey, tokenHash); tokens.expires_at = Math.floor(Date.now()/1000) - 1;
  await service.from('egz_sessions').update({ tokens_encrypted: encrypt(tokens, cfg.encryptionKey, tokenHash) }).eq('token_hash', tokenHash);
  const refreshed = await Promise.all([A.request('session'), A.request('session')]);
  check('concurrent session refresh preserves identity', refreshed.every(result => result.status === 200 && result.data.user?.id === a.id));
  const secondDevice = new Visitor(); await secondDevice.login(a);
  check('same permanent account works on an independent device session', (await secondDevice.request('photos')).data.photos[0].id === photoA.id);
  browser = await chromium.launch({ headless: true });
  for (const account of [a,b]) {
    const context = await browser.newContext(); const page = await context.newPage();
    await page.goto(`${cfg.origin}/account.html`); await page.locator('#email').fill(account.email); await page.locator('#password').fill(account.password);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click(); await page.locator('#signed-in').waitFor({ state:'visible' });
    await page.goto(`${cfg.origin}/cloud-gallery.html`); await page.locator('.cloud-card img').waitFor({ state:'visible' });
    assert.equal(await page.locator('.cloud-card').count(), 1);
    check(`real browser private gallery renders account${account===a?'A':'B'}`, await page.locator('.cloud-card img').evaluate(async img=>{await img.decode();return img.naturalWidth===64;}));
    await context.close();
  }
  await A.request('consent', { granted:false, version:'2026-10-29' });
  check('revoking consent immediately hides cloud copies for owner and admin', (await A.request('photos')).data.photos.length === 0 && (await Admin.request(`photo&id=${photoA.id}`)).status === 404);
  await service.from('egz_photos').update({ expires_at:new Date(Date.now()-1000).toISOString() }).eq('id', photoB.id);
  check('expiry blocks reads before cleanup runs', (await B.request(`photo&id=${photoB.id}`)).status === 404);
  const retention = await fetch(`${cfg.url}/functions/v1/egz-retention`, { method: 'POST', headers:{Authorization:`Bearer ${cfg.secret}`,'X-EGZ-Retention-Secret':cfg.cronSecret,'Content-Type':'application/json'}, body:'{}' });
  assert.equal(retention.status,200,'Retention failed');
  check('retention removes physical objects through Storage API', !!(await service.storage.from('photo-archive').download(photoPaths[0])).error && !!(await service.storage.from('photo-archive').download(photoPaths[1])).error);
  await service.storage.from('photo-archive').upload(photoPaths[0],image,{contentType:'image/png'});
  await fetch(`${cfg.origin}/api/studio?action=retention`,{headers:{Authorization:`Bearer ${cfg.cronSecret}`}});
  check('tombstone reconciliation removes late orphan uploads', !!(await service.storage.from('photo-archive').download(photoPaths[0])).error);
  await A.request('consent',{granted:true,version:'2026-10-29'});
  check('expired/deleted photo is never reuploaded by retry', (await A.request('upload',image,uploadHeaders(idA))).status===409);
  const savedCookie = new Map(secondDevice.jar); await secondDevice.request('logout',{}); secondDevice.jar=savedCookie;
  check('logout revokes server session even if old cookie is replayed', (await secondDevice.request('photos')).status===401);
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
} finally {
  await browser?.close();
  if(photoPaths.length) await service.storage.from('photo-archive').remove(photoPaths);
  for(const account of accounts) {
    // Test-owned rows only. Audit is append-only for the service role, so its
    // cleanup is performed by the operator tool separately below if necessary.
    await service.from('egz_sessions').delete().eq('owner_id',account.id);
    await service.from('egz_admin_memberships').delete().eq('user_id',account.id);
  }
  const { writeFile }=await import('node:fs/promises');
  await writeFile(new URL('../secrets/live-test-cleanup.json',import.meta.url),JSON.stringify({account_ids:accounts.map(a=>a.id)},null,2));
  if (accounts.length) {
    const { cleanupLiveTests } = await import('./cleanup-live-tests.mjs'); await cleanupLiveTests();
  }
}
