import { hash, randomToken, encrypt, decrypt } from './security.mjs';
import { publicClient, userClient } from './config.mjs';

export const sessionLifetime = 24 * 60 * 60;
export function cookies(req) {
  const result = {};
  for (const pair of (req.headers.cookie || '').split(';')) {
    const at = pair.indexOf('='); if (at < 0) continue;
    const name = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
    if (/^[A-Za-z0-9_-]{1,100}$/.test(name) && /^[A-Za-z0-9_-]{1,200}$/.test(value)) result[name] = value;
  }
  return result;
}
export function setCookie(res, cfg, name, token, maxAge) {
  const list = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(list) ? list : [list]),
    `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.secure ? '; Secure' : ''}`]);
}
export function csrfToken(req, res, cfg) {
  let token = cookies(req)[cfg.csrfCookie];
  if (!token || token.length !== 43) {
    token = randomToken(); setCookie(res, cfg, cfg.csrfCookie, token, sessionLifetime);
  }
  return token;
}
export function tokenEnvelope(session) {
  const expiresAt = Number(session.expires_at) || (Number.isFinite(session.expires_in) ? Math.floor(Date.now() / 1000) + session.expires_in : 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0 || !session.access_token || !session.refresh_token) throw new Error('Invalid provider session');
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: expiresAt };
}
export async function createSession(session, csrf, cfg, service, res, previousHash = null, requirePrevious = false) {
  const authenticatedCsrf = randomToken();
  const token = randomToken(), tokenHash = hash(token), expiresAt = new Date(Date.now() + sessionLifetime * 1000).toISOString();
  const { error } = await service.from('egz_sessions').insert({ token_hash: tokenHash, owner_id: session.user.id,
    tokens_encrypted: encrypt(tokenEnvelope(session), cfg.encryptionKey, tokenHash), csrf_hash: hash(authenticatedCsrf), expires_at: expiresAt });
  if (error) throw new Error('Session persistence failed');
  // Replace the browser's previous session, including an AAL1 session upgraded
  // by MFA. Other devices retain their independently issued session IDs.
  if (previousHash) {
    const { data: revoked, error: revokeError } = await service.from('egz_sessions').delete().eq('token_hash', previousHash).select('token_hash');
    if (revokeError || (requirePrevious && !revoked?.length)) {
      await service.from('egz_sessions').delete().eq('token_hash', tokenHash);
      throw new Error('Session rotation failed');
    }
  }
  setCookie(res, cfg, cfg.cookieName, token, sessionLifetime);
  setCookie(res, cfg, cfg.csrfCookie, authenticatedCsrf, sessionLifetime);
  return { user: session.user, tokens: tokenEnvelope(session), tokenHash, csrfToken: authenticatedCsrf };
}
export async function resolveSession(req, cfg, service) {
  const token = cookies(req)[cfg.cookieName];
  if (!token || token.length !== 43) return null;
  const tokenHash = hash(token);
  for (let attempt = 0; attempt < 60; attempt++) {
    const { data: row, error } = await service.from('egz_sessions').select('*').eq('token_hash', tokenHash).maybeSingle();
    if (error) throw new Error('Session lookup failed');
    if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
    let tokens;
    try { tokens = decrypt(row.tokens_encrypted, cfg.encryptionKey, tokenHash); }
    catch { return null; }
    if (tokens.expires_at * 1000 < Date.now() + 45000) {
      const lock = randomToken();
      const { data: claimed, error: lockError } = await service.rpc('egz_claim_refresh', { p_hash: tokenHash, p_lock_token: lock });
      if (lockError) throw new Error('Session refresh unavailable');
      if (!claimed?.length) { await new Promise(r => setTimeout(r, 100)); continue; }
      // Another process may have refreshed between our SELECT and claiming the lock.
      const latest = decrypt(claimed[0].tokens_encrypted, cfg.encryptionKey, tokenHash);
      let fresh = latest;
      if (latest.expires_at * 1000 < Date.now() + 45000) {
        const { data, error: refreshError } = await publicClient(cfg).auth.refreshSession({ refresh_token: latest.refresh_token });
        if (refreshError || !data.session) {
          await service.from('egz_sessions').delete().eq('token_hash', tokenHash).eq('refresh_lock_token', lock); return null;
        }
        fresh = tokenEnvelope(data.session);
      }
      const { data: saved, error: saveError } = await service.from('egz_sessions').update({
        tokens_encrypted: encrypt(fresh, cfg.encryptionKey, tokenHash), refresh_lock_token: null, refresh_lock_until: null,
      }).eq('token_hash', tokenHash).eq('refresh_lock_token', lock).select('token_hash');
      if (saveError || !saved?.length) return null; // Logout must never recreate a deleted session.
      tokens = fresh;
    }
    const { data, error: userError } = await publicClient(cfg).auth.getUser(tokens.access_token);
    if (userError || !data.user || data.user.id !== row.owner_id || !data.user.email_confirmed_at) return null;
    return { user: data.user, tokens, tokenHash, csrfHash: row.csrf_hash, client: userClient(cfg, tokens.access_token) };
  }
  throw Object.assign(new Error('Session refresh busy'), { status: 503 });
}

export async function mfaClient(auth, cfg) {
  const client = publicClient(cfg);
  const { error } = await client.auth.setSession(auth.tokens);
  if (error) throw Object.assign(new Error('Session expired'), { status: 401 });
  return client;
}
export function assurance(auth) {
  try { return JSON.parse(Buffer.from(auth.tokens.access_token.split('.')[1], 'base64url').toString('utf8')).aal; }
  catch { return 'aal1'; }
}
