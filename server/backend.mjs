import { randomUUID } from 'node:crypto';
import { configuration, serviceClient, publicClient } from './config.mjs';
import { MAX_UPLOAD, CONSENT_VERSION, uuidPattern, hash, secureEqual, validateOrigin, privateHash, normalizePng, readBody, readJson } from './security.mjs';
import { cookies, csrfToken, setCookie, createSession, resolveSession, mfaClient, assurance } from './sessions.mjs';

const modes = new Set(['free', 'painting', 'photobooth', 'meme']);
const knownActions = new Set(['session', 'login', 'signup', 'confirm', 'logout', 'photos', 'photo', 'upload', 'remove', 'consent', 'admin-photos', 'mfa-enroll', 'mfa-verify', 'retention']);
const photoFields = 'id,owner_id,mode,name,bytes,width,height,created_at,expires_at';
const fail = (status, message) => { throw Object.assign(new Error(message), { status, publicMessage: message }); };
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const single = data => Array.isArray(data) ? data[0] : data;
const checked = result => { if (result.error) throw new Error('Database operation failed'); return result.data; };

async function rate(service, key, limit, seconds) {
  const { data, error } = await service.rpc('egz_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: seconds });
  if (error) throw new Error('Rate limiter unavailable');
  if (!data) fail(429, 'Terlalu banyak permintaan. Coba lagi nanti.');
}
async function membership(auth, cfg, service) {
  // Only a server-configured, verified email may bootstrap; revoked memberships
  // remain revoked because duplicates are never updated here.
  if (cfg.bootstrapEmail && auth.user.email?.toLowerCase() === cfg.bootstrapEmail && auth.user.email_confirmed_at) {
    checked(await service.from('egz_admin_memberships').upsert({ user_id: auth.user.id }, { onConflict: 'user_id', ignoreDuplicates: true }));
  }
  const row = checked(await service.from('egz_admin_memberships').select('user_id,revoked_at').eq('user_id', auth.user.id).maybeSingle());
  return !!row && !row.revoked_at;
}
async function sessionInfo(auth, csrf, cfg, service) {
  if (!auth) return { configured: true, user: null, csrfToken: csrf, consent: null, isAdmin: false, mfaRequired: false, mfaFactors: [], registrationEnabled: cfg.publicSignupEnabled };
  const consent = checked(await auth.client.from('egz_consents').select('version,granted_at,revoked_at').eq('owner_id', auth.user.id).maybeSingle());
  const isAdmin = await membership(auth, cfg, service);
  let mfaFactors = [];
  if (isAdmin) {
    const client = await mfaClient(auth, cfg), result = await client.auth.mfa.listFactors();
    if (result.error) throw new Error('MFA status unavailable');
    mfaFactors = (result.data?.totp || []).map(({ id, factor_type, status }) => ({ id, factor_type, status }));
  }
  return { configured: true, user: { id: auth.user.id, email: auth.user.email }, csrfToken: csrf,
    consent: { active: !!consent && !consent.revoked_at && consent.version === CONSENT_VERSION, version: CONSENT_VERSION },
    isAdmin, mfaRequired: isAdmin && assurance(auth) !== 'aal2', mfaFactors, registrationEnabled: cfg.publicSignupEnabled };
}
async function audit(service, auth, action, photoId = null, details = {}) {
  checked(await service.from('egz_audit_events').insert({ actor_id: auth?.user.id || null, action, photo_id: photoId, details }));
}
async function removeObject(service, row) {
  // Storage API removes the file itself. Never DELETE storage.objects in SQL.
  const { error } = await service.storage.from('photo-archive').remove([row.object_path]);
  if (error) throw new Error('Storage removal failed');
  checked(await service.from('egz_photos').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', row.id));
}
export async function runRetention(service) {
  const now = new Date().toISOString(), stale = new Date(Date.now() - 3600000).toISOString();
  const rows = checked(await service.from('egz_photos').select('id,object_path').neq('status', 'deleted')
    .or(`expires_at.lte.${now},status.eq.deleting,and(status.in.(reserved,failed),created_at.lt.${stale})`).limit(100));
  let removed = 0, failed = 0;
  for (const row of rows) {
    try {
      checked(await service.from('egz_photos').update({ status: 'deleting' }).eq('id', row.id));
      await removeObject(service, row); removed++;
    } catch { failed++; }
  }
  // Reconcile tombstones for a full day after deletion. A request interrupted
  // between Storage upload and finalization must not leave a late orphan.
  const tombstones = checked(await service.from('egz_photos').select('id,object_path').eq('status', 'deleted')
    .gt('deleted_at', new Date(Date.now() - 86400000).toISOString()).order('updated_at', { ascending: true }).limit(25));
  for (const row of tombstones) { try { await removeObject(service, row); } catch { failed++; } }
  checked(await service.rpc('egz_housekeeping'));
  return { removed, failed, batchLimit: 100 };
}

export function createStudioHandler({ env = process.env, clientFactory = serviceClient, logger = console.warn } = {}) {
  return async function studio(req, res) {
    let logAction = 'unknown';
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      let cfg;
      try { cfg = configuration(env); } catch { fail(503, 'Backend belum dikonfigurasi. Hubungi pengelola.'); }
      const action = new URL(req.url, cfg.origin).searchParams.get('action') || 'session';
      if (knownActions.has(action)) logAction = action;
      const query = new URL(req.url, cfg.origin).searchParams;
      const service = clientFactory(cfg);
      if (action === 'retention') {
        if (!['GET', 'POST'].includes(req.method) || !secureEqual(req.headers.authorization, `Bearer ${cfg.cronSecret}`)) fail(401, 'Tidak diizinkan.');
        const result = await runRetention(service); return json(res, result.failed ? 503 : 200, result);
      }
      if (!['GET', 'POST'].includes(req.method)) fail(405, 'Metode tidak tersedia.');
      const readActions = new Set(['session', 'photos', 'admin-photos', 'photo']);
      if ((req.method === 'GET') !== readActions.has(action)) fail(405, 'Metode tidak tersedia.');
      const csrf = csrfToken(req, res, cfg);
      if (req.method === 'POST' && (!validateOrigin(req.headers.origin, cfg.origin) || !secureEqual(req.headers['x-csrf-token'], cookies(req)[cfg.csrfCookie]))) {
        fail(403, 'Permintaan tidak valid. Muat ulang halaman.');
      }
      const ip = cfg.vercel ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
      const ipKey = privateHash(String(ip || 'unknown').slice(0, 200), cfg.encryptionKey);
      if (['login', 'signup', 'confirm'].includes(action)) {
        await rate(service, `auth:ip:${ipKey}`, 20, 600);
        await rate(service, 'auth:global', 500, 3600);
        const body = await readJson(req);
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail(400, 'Alamat email tidak valid.');
        if (action === 'signup' && !cfg.publicSignupEnabled && email !== cfg.bootstrapEmail) fail(503, 'Pendaftaran umum belum dibuka. Hubungi pengelola studio.');
        const client = publicClient(cfg);
        let result;
        if (action === 'confirm') {
          if (!/^\d{6,10}$/.test(body.token || '')) fail(400, 'Kode konfirmasi tidak valid.');
          result = await client.auth.verifyOtp({ email, token: body.token, type: 'signup' });
        } else {
          if (typeof body.password !== 'string' || body.password.length < (action === 'signup' ? 12 : 1) || body.password.length > 128) fail(400, 'Password akun baru minimal 12 karakter.');
          result = action === 'login' ? await client.auth.signInWithPassword({ email, password: body.password }) :
            await client.auth.signUp({ email, password: body.password, options: { emailRedirectTo: `${cfg.origin}/account.html` } });
        }
        if (result.error) {
          if (action === 'signup') fail(400, 'Pendaftaran belum berhasil. Periksa email atau hubungi pengelola layanan email.');
          fail(401, action === 'login' ? 'Email atau password belum valid, atau email belum dikonfirmasi.' : 'Kode salah atau kedaluwarsa.');
        }
        if (!result.data.session) return json(res, 200, { confirmationRequired: true, message: 'Jika alamat memenuhi syarat, konfirmasi dikirim ke email Anda.' });
        if (!result.data.user?.email_confirmed_at) fail(403, 'Konfirmasikan email terlebih dahulu.');
        const previous = cookies(req)[cfg.cookieName];
        const auth = await createSession(result.data.session, csrf, cfg, service, res, previous?.length === 43 ? hash(previous) : null);
        auth.client = (await import('./config.mjs')).userClient(cfg, auth.tokens.access_token);
        return json(res, 200, await sessionInfo(auth, auth.csrfToken, cfg, service));
      }
      const auth = await resolveSession(req, cfg, service);
      if (action === 'session') return json(res, 200, await sessionInfo(auth, csrf, cfg, service));
      if (!auth) fail(401, 'Sesi berakhir. Masuk kembali.');
      if (req.method === 'POST' && !secureEqual(auth.csrfHash, hash(csrf))) fail(403, 'Sesi berubah. Muat ulang halaman.');
      await rate(service, `requests:${auth.user.id}`, 180, 60);
      if (action === 'logout') {
        checked(await service.from('egz_sessions').delete().eq('token_hash', auth.tokenHash));
        setCookie(res, cfg, cfg.cookieName, '', 0); setCookie(res, cfg, cfg.csrfCookie, '', 0);
        try { const client = await mfaClient(auth, cfg); await client.auth.signOut({ scope: 'local' }); } catch { /* App session is already revoked. */ }
        return json(res, 200, { ok: true });
      }
      const isAdmin = await membership(auth, cfg, service);
      const admin = isAdmin && assurance(auth) === 'aal2';
      if (action.startsWith('mfa-')) {
        if (!isAdmin) fail(403, 'Akses admin diperlukan.');
        const client = await mfaClient(auth, cfg);
        if (action === 'mfa-enroll') {
          const factors = await client.auth.mfa.listFactors();
          if (factors.error) fail(503, 'Pemeriksaan MFA belum tersedia. Coba lagi.');
          if (factors.data.totp.some(factor => factor.status === 'verified') && !admin) fail(403, 'Verifikasi MFA yang sudah terdaftar terlebih dahulu.');
          const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'EGZ Admin' });
          if (error) fail(400, 'Pendaftaran MFA gagal. Gunakan faktor yang sudah terdaftar.');
          return json(res, 200, { id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri });
        }
        if (action === 'mfa-verify') {
          const body = await readJson(req);
          if (!uuidPattern.test(body.factorId || '') || !/^\d{6}$/.test(body.code || '')) fail(400, 'Kode MFA tidak valid.');
          const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId: body.factorId, code: body.code });
          if (error || !data.access_token) fail(401, 'Kode MFA salah atau kedaluwarsa.');
          const upgraded = await createSession({ ...data, user: auth.user }, csrf, cfg, service, res, auth.tokenHash, true);
          upgraded.client = (await import('./config.mjs')).userClient(cfg, data.access_token);
          return json(res, 200, await sessionInfo(upgraded, upgraded.csrfToken, cfg, service));
        }
        fail(404, 'Tidak ditemukan.');
      }
      if (action === 'consent') {
        const body = await readJson(req);
        if (typeof body.granted !== 'boolean' || body.version !== CONSENT_VERSION) fail(400, 'Versi persetujuan tidak valid.');
        const row = single(checked(await service.rpc('egz_set_consent', { p_owner: auth.user.id, p_granted: body.granted, p_version: CONSENT_VERSION })));
        await audit(service, auth, body.granted ? 'consent.granted' : 'consent.revoked');
        return json(res, 200, { consent: { active: !!row && !row.revoked_at, version: CONSENT_VERSION } });
      }
      if (action === 'photos' || action === 'admin-photos') {
        if (action === 'admin-photos' && !admin) fail(403, 'Masuk sebagai admin dan verifikasi MFA terlebih dahulu.');
        let request = auth.client.from('egz_photos').select(photoFields).eq('status', 'ready').gt('expires_at', new Date().toISOString()).order('id', { ascending: false }).limit(25);
        if (action === 'photos') request = request.eq('owner_id', auth.user.id);
        const cursor = query.get('cursor');
        if (cursor) { if (!uuidPattern.test(cursor)) fail(400, 'Cursor tidak valid.'); request = request.lt('id', cursor); }
        const rows = checked(await request);
        if (action === 'admin-photos') await audit(service, auth, 'admin.list');
        return json(res, 200, { photos: rows, nextCursor: rows.length === 25 ? rows.at(-1).id : null });
      }
      if (action === 'photo' || action === 'remove') {
        let id = query.get('id');
        if (action === 'remove') id = (await readJson(req)).id;
        if (!uuidPattern.test(id || '')) fail(400, 'ID foto tidak valid.');
        // User JWT and RLS, including expiry and MFA, remain the read boundary.
        const row = checked(await auth.client.from('egz_photos').select('*').eq('id', id).maybeSingle());
        if (!row) fail(404, 'Foto tidak ditemukan atau sudah kedaluwarsa.');
        if (action === 'remove') {
          if (row.owner_id !== auth.user.id && !admin) fail(404, 'Foto tidak ditemukan.');
          checked(await service.from('egz_photos').update({ status: 'deleting' }).eq('id', id));
          try { await removeObject(service, row); } catch { fail(503, 'Penghapusan sedang diproses. Foto sudah tidak dapat diakses.'); }
          await audit(service, auth, 'photo.deleted', id); return json(res, 200, { ok: true });
        }
        const { data, error } = await auth.client.storage.from('photo-archive').download(row.object_path);
        if (error) fail(404, 'Foto tidak tersedia.');
        if (row.owner_id !== auth.user.id) await audit(service, auth, 'admin.read', id);
        const buffer = Buffer.from(await data.arrayBuffer());
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buffer.length, 'Content-Disposition': `inline; filename="${row.id}.png"` }); res.end(buffer); return;
      }
      if (action === 'upload') {
        if (!cfg.uploadsEnabled) fail(503, 'Unggahan sementara dinonaktifkan. Foto tetap lokal.');
        await rate(service, `upload:ip:${ipKey}`, 60, 60);
        const id = req.headers['x-photo-id'], mode = req.headers['x-photo-mode'];
        if (!uuidPattern.test(id || '') || !modes.has(mode) || req.headers['content-type']?.split(';')[0] !== 'image/png') fail(400, 'Format unggahan tidak valid.');
        let image;
        try { image = await normalizePng(await readBody(req, MAX_UPLOAD)); } catch (error) { fail(error.status || 400, 'PNG tidak valid, terlalu besar, atau melebihi batas dimensi.'); }
        const { data, error } = await service.rpc('egz_reserve_photo', { p_owner: auth.user.id, p_id: randomUUID(), p_idempotency_key: id,
          p_mode: mode, p_name: `egz-${mode}-${id}.png`, p_bytes: image.buffer.length, p_width: image.width, p_height: image.height, p_sha256: image.sha256 });
        if (error) {
          if (/consent/i.test(error.message)) fail(403, 'Persetujuan cloud diperlukan.');
          if (/quota|limit/i.test(error.message)) fail(429, 'Kuota unggahan tercapai. Foto tetap lokal.');
          if (/idempotency/i.test(error.message)) fail(409, 'Foto ini sudah diproses dengan isi berbeda.');
          if (/expired_or_deleted/i.test(error.message)) fail(409, 'Masa simpan foto berakhir; foto tidak diunggah ulang.');
          throw new Error('Photo reservation failed');
        }
        const row = single(data);
        if (!row || ['deleted', 'deleting'].includes(row.status) || Date.parse(row.expires_at) <= Date.now()) fail(409, 'Masa simpan foto berakhir; foto tidak diunggah ulang.');
        if (row.status === 'ready') return json(res, 200, { photo: Object.fromEntries(photoFields.split(',').map(key => [key, row[key]])) });
        const upload = await service.storage.from('photo-archive').upload(row.object_path, image.buffer, { contentType: 'image/png', upsert: false, cacheControl: '0' });
        if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) {
          checked(await service.from('egz_photos').update({ status: 'failed' }).eq('id', row.id).eq('status', 'reserved'));
          fail(503, 'Unggahan belum berhasil. Foto lokal tetap tersedia.');
        }
        // A concurrent retry may have uploaded the identical immutable path.
        const complete = await service.rpc('egz_complete_photo', { p_id: row.id, p_bytes: image.buffer.length });
        if (complete.error) {
          // Consent may have been revoked while encoding/uploading. Retention
          // handles deleting rows; never restore access with a blind UPDATE.
          const latest = checked(await service.from('egz_photos').select('*').eq('id', row.id).maybeSingle());
          if (latest && ['deleted', 'deleting'].includes(latest.status)) {
            try { await removeObject(service, latest); } catch { /* The scheduled tombstone sweep retries removal. */ }
          }
          fail(409, 'Status foto berubah. Periksa persetujuan atau coba lagi.');
        }
        const ready = single(complete.data); await audit(service, auth, 'photo.uploaded', ready.id);
        return json(res, 200, { photo: Object.fromEntries(photoFields.split(',').map(key => [key, ready[key]])) });
      }
      fail(404, 'Tidak ditemukan.');
    } catch (error) {
      // Provider errors can contain SQL, URLs, or tokens. Do not return or log them.
      const status = error.status || 503;
      if ([400, 401, 403, 413, 429, 503].includes(status)) {
        const requestId = /^[A-Za-z0-9_-]{1,100}$/.test(req.requestId || '') ? req.requestId : undefined;
        try { logger(JSON.stringify({ event: status === 503 ? 'backend.unavailable' : 'security.denied', action: logAction, status, requestId })); }
        catch { /* A logging outage cannot expose provider details or change authorization. */ }
      }
      if (!res.headersSent) json(res, status, { error: error.publicMessage || 'Layanan sementara tidak tersedia. Coba lagi.' });
      else res.end();
    }
  };
}

export default createStudioHandler();
