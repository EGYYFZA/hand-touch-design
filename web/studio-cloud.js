import { api, refreshSession, logout, CONSENT_VERSION } from './cloud-client.js';
import { setPhotoOwner, activatePhotoOwner, clearPhotoOwner, claimGuestPhotos, GUEST_OWNER } from './photo-store.js';
import { createCloudViewer } from './cloud-viewer.js';
let state = null, epoch = 0, hooks = null, ready = false, pendingExport = null, changing = Promise.resolve();
let authGeneration = 0, verifyGeneration = 0, authBusy = false;
let viewer = null;
const $ = id => document.getElementById(id);
const channel = globalThis.BroadcastChannel ? new BroadcastChannel('egz-account') : null;
export const MAX_CLOUD_BYTES = 3 * 1024 * 1024;

export async function prepareCloudImage(original) {
  if (!(original instanceof Blob) || original.type !== 'image/png') throw new Error('Salinan cloud memerlukan foto PNG.');
  if (original.size <= MAX_CLOUD_BYTES) return { blob: original, resized: false };
  const image = await createImageBitmap(original).catch(() => { throw new Error('Foto belum dapat dibaca untuk membuat salinan cloud. Foto asli tetap dapat diunduh.'); });
  try {
    if (!image.width || !image.height) throw new Error('Foto belum dapat dibaca.');
    let scale = Math.min(1, Math.sqrt(700000 / (image.width * image.height)));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser belum dapat membuat salinan cloud. Foto asli tetap dapat diunduh.');
    for (let attempt = 0; attempt < 8; attempt++) {
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      if (Math.min(width, height) < 64) break;
      canvas.width = width; canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob && blob.size <= MAX_CLOUD_BYTES) return { blob, resized: true, width, height };
      scale *= 0.8;
    }
    throw new Error('Salinan cloud belum dapat diperkecil ke batas 3 MB. Foto asli tetap lokal dan dapat diunduh.');
  } finally { image.close(); }
}
export function cloudIdentity() { return { ownerId: state?.user?.id || (state?.configured === false ? null : GUEST_OWNER), epoch, configured: state?.configured !== false }; }
export function sameCloudIdentity(identity) { return identity.epoch === epoch && identity.ownerId === cloudIdentity().ownerId; }
export function canUseStudio() { return ready; }
export function needsGuestPreview() { return state?.configured !== false && !state?.user; }

function renderAccount() {
  const signedIn = !!state?.user;
  $('studio-signed-out').hidden = signedIn;
  $('studio-signed-in').hidden = !signedIn;
  $('studio-account-title').textContent = signedIn ? 'Akun' : 'Masuk untuk unduh';
  $('studio-user-email').textContent = state?.user?.email || '';
  $('studio-consent').checked = !!state?.consent?.active;
  $('studio-admin-link').hidden = !state?.isAdmin;
  $('studio-security-link').hidden = !state?.isAdmin;
  $('studio-registration-note').hidden = state?.registrationEnabled !== false;
  $('studio-signup').disabled = state?.registrationEnabled === false;
  $('account-open').textContent = signedIn ? 'Akun' : 'Masuk';
}

function adoptSession(next, claim = false, valid = () => true) {
  const task = changing.then(async () => {
    if (!valid()) return;
    const previous = cloudIdentity().ownerId;
    const owner = next.user?.id || (next.configured === false ? null : GUEST_OWNER);
    if (previous === owner) {
      state = next;
      if (owner === GUEST_OWNER) await activatePhotoOwner(GUEST_OWNER).catch(() => hooks.notice('Pembersihan cache akun sebelumnya gagal. Pada perangkat bersama, hapus data situs.'));
      renderAccount(); return;
    }
    const claimGuest = claim && previous === GUEST_OWNER && !!next.user;
    if (claimGuest) await hooks.settle();
    ready = false; epoch++;
    viewer?.clear();
    const temporary = hooks.reset({ claimGuest });
    if (claimGuest) {
      try { await claimGuestPhotos(owner); }
      catch { $('studio-account-status').textContent = 'Foto tamu belum dapat dipindahkan. Salinan tamu tetap di perangkat.'; }
    }
    let cleanupWarning = '';
    if (previous && previous !== GUEST_OWNER) await clearPhotoOwner(previous).catch(() => { cleanupWarning = 'Pembersihan cache gagal. Pada perangkat bersama, hapus data situs.'; });
    state = next;
    // Guest captures are retained until explicit login claims them. Changing a
    // verified account never adopts another account's data or legacy demo data.
    setPhotoOwner(owner);
    if (owner !== GUEST_OWNER) await activatePhotoOwner(owner).catch(() => { cleanupWarning = 'Pembersihan cache gagal. Foto sementara tetap tersedia; hapus data situs setelah selesai pada perangkat bersama.'; });
    else {
      try { localStorage.removeItem('egz-cache-owner'); } catch { /* Optional metadata. */ }
    }
    renderAccount(); ready = true;
    await hooks.restore(temporary);
    if (cleanupWarning) hooks.notice(cleanupWarning);
  });
  changing = task.catch(() => { ready = true; });
  return task;
}

async function expire(text = 'Sesi berakhir. Studio tetap dapat digunakan.') {
  authGeneration++; verifyGeneration++;
  pendingExport = null;
  await adoptSession({ ...state, configured: true, user: null, consent: null });
  $('studio-account-status').textContent = text;
}

async function verify(claim = false) {
  if (authBusy && !claim) return state;
  const authVersion = authGeneration, request = ++verifyGeneration;
  const next = await refreshSession();
  if (authVersion !== authGeneration || request !== verifyGeneration) return state;
  await adoptSession(next, claim, () => authVersion === authGeneration && request === verifyGeneration);
  return state;
}

export async function authorizePhotoExport(action, ownerId = cloudIdentity().ownerId) {
  // --demo is an explicit operator-only loopback preview, never public auth.
  if (state?.configured === false) { action(); return; }
  try {
    const next = await verify(true);
    if (next.user) {
      if (ownerId === GUEST_OWNER || ownerId === next.user.id) action();
      else hooks.notice('Akun berubah. Buka kembali foto milik akun aktif.');
      return;
    }
  } catch { /* Local studio still works when the account service is offline. */ }
  pendingExport = { action, ownerId };
  $('studio-account-status').textContent = 'Foto tetap tersimpan di perangkat.';
  renderAccount();
  if (!$('studio-account').open) $('studio-account').showModal();
  $('studio-email').focus();
}

function controls() {
  const button = document.createElement('button'); button.id = 'account-open';
  document.querySelector('.header-actions').append(button);
  const dialog = $('studio-account'), result = $('studio-account-status');
  button.addEventListener('click', () => { renderAccount(); dialog.showModal(); verify().catch(error => { result.textContent = error.message; }); });
  $('studio-account-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { pendingExport = null; $('studio-password').value = ''; $('studio-confirm-code').value = ''; $('studio-login-form').hidden = false; $('studio-confirm-form').hidden = true; });
  function finishLogin(next) {
    const resume = pendingExport; pendingExport = null; dialog.close();
    if (resume && (resume.ownerId === GUEST_OWNER || resume.ownerId === next.user.id)) resume.action();
    else if (resume) hooks.notice('Foto tersebut milik akun sebelumnya.');
    channel?.postMessage({ type: 'login' });
  }
  async function auth(action) {
    if (!$('studio-login-form').reportValidity()) return;
    const password = $('studio-password').value;
    if (action === 'signup' && password.length < 12) { result.textContent = 'Password baru minimal 12 karakter.'; return; }
    const buttons = [...$('studio-signed-out').querySelectorAll('button')]; buttons.forEach(item => { item.disabled = true; });
    authBusy = true; authGeneration++; verifyGeneration++;
    try {
      await refreshSession();
      const response = await api(action, { method: 'POST', body: { email: $('studio-email').value.trim(), password } });
      $('studio-password').value = '';
      if (response?.confirmationRequired) { $('studio-login-form').hidden = true; $('studio-confirm-form').hidden = false; $('studio-confirm-code').focus(); result.textContent = 'Periksa email untuk konfirmasi.'; return; }
      const next = await verify(true);
      if (next.user) finishLogin(next);
    } catch (error) { result.textContent = error.message; }
    finally { authBusy = false; buttons.forEach(item => { item.disabled = false; }); renderAccount(); }
  }
  $('studio-login-form').addEventListener('submit', event => { event.preventDefault(); auth('login'); });
  $('studio-signup').addEventListener('click', () => auth('signup'));
  $('studio-confirm-form').addEventListener('submit', async event => {
    event.preventDefault(); const submit = event.submitter; if (submit) submit.disabled = true;
    authBusy = true; authGeneration++; verifyGeneration++;
    try {
      await api('confirm', { method: 'POST', body: { email: $('studio-email').value.trim(), token: $('studio-confirm-code').value.trim() } });
      $('studio-confirm-code').value = ''; $('studio-confirm-form').hidden = true; $('studio-login-form').hidden = false;
      const next = await verify(true);
      if (next.user) finishLogin(next);
      else result.textContent = 'Email terkonfirmasi. Masuk dengan password Anda.';
    } catch (error) { result.textContent = error.message; }
    finally { authBusy = false; if (submit) submit.disabled = false; }
  });
  $('studio-logout').addEventListener('click', async () => {
    const exit = $('studio-logout'); exit.disabled = true;
    authBusy = true; authGeneration++; verifyGeneration++;
    try { const previous = state.user.id; await logout(); await expire('Anda sudah keluar.'); dialog.close(); channel?.postMessage({ type: 'logout', ownerId: previous }); }
    catch (error) { result.textContent = error.message; }
    finally { authBusy = false; exit.disabled = false; }
  });
  $('studio-consent').addEventListener('change', async () => {
    const consent = $('studio-consent'), desired = consent.checked; consent.disabled = true;
    try { await api('consent', { method: 'POST', body: { granted: desired, version: CONSENT_VERSION } }); await verify(); result.textContent = desired ? 'Persetujuan aktif untuk foto baru.' : 'Pengiriman foto baru dihentikan.'; channel?.postMessage({ type: 'consent' }); }
    catch (error) { consent.checked = !desired; result.textContent = error.message; }
    finally { consent.disabled = false; }
  });
  renderAccount();
  viewer = createCloudViewer({ verify, identity: cloudIdentity, isCurrent: sameCloudIdentity, notice: text => hooks.notice(text) });
  $('studio-cloud-open').addEventListener('click', () => { dialog.close(); viewer.open(); });
}

export async function initializeCloud(callbacks) {
  hooks = callbacks;
  // Public camera/effects are local and independent of Auth availability.
  state = { configured: true, user: null, consent: null };
  setPhotoOwner(GUEST_OWNER); ready = true; controls();
  await hooks.restore();
  // Fetching Auth must not delay camera, capture or local gallery readiness.
  verify().then(next => {
    if (next.configured === false) document.body.dataset.localDemo = 'true';
  }).catch(() => { $('studio-account-status').textContent = 'Layanan akun belum tersedia. Studio tetap dapat digunakan.'; });
  window.addEventListener('egz-session-expired', () => expire());
  channel?.addEventListener('message', event => {
    if (event.data?.type === 'logout' && state.user?.id === event.data.ownerId) expire('Akun telah keluar di tab lain.');
    if (['login', 'consent'].includes(event.data?.type)) verify().catch(() => { if (state.user) expire(); });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state?.configured) verify().catch(() => { if (state.user) expire(); }); });
  setInterval(() => { if (state?.configured) verify().catch(() => { if (state.user) expire(); }); }, 60000);
  return true;
}

export function preparePhotoCloud(entry, actions, title) {
  if (!state?.configured || !state.user) return;
  const identity = cloudIdentity();
  const upload = document.createElement('button'); upload.className = 'cloud-upload';
  const status = document.createElement('p'); status.className = 'cloud-photo-status';
  let sent = !!entry.cloudId;
  const eligibleAtCapture = entry.cloudConsentAtCapture === true;
  function show(text) { status.textContent = text; }
  upload.textContent = sent ? 'Sudah di cloud' : eligibleAtCapture || entry.cloudUploadApproved ? 'Kirim ulang cloud' : 'Simpan foto ini ke cloud'; upload.hidden = sent;
  show(sent ? 'Salinan cloud tersedia selama masa simpan.' : eligibleAtCapture ? 'Menyiapkan unggahan cloud…' : 'Lokal. Simpan ke cloud hanya jika Anda memilihnya: 30 hari, dapat dilihat pengelola.');
  async function send(manual = false) {
    if (!sameCloudIdentity(identity) || sent) return;
    upload.disabled = true;
    try {
      const latest = await refreshSession();
      if (!sameCloudIdentity(identity) || latest.user?.id !== identity.ownerId) throw new Error('Akun berubah. Unggahan dibatalkan.');
      state = latest;
      if (!state.consent?.active) {
        if (manual) {
          renderAccount(); $('studio-account-status').textContent = 'Aktifkan persetujuan cloud, lalu kembali dan pilih simpan foto ini. Belum ada foto yang dikirim.';
          if (!$('studio-account').open) $('studio-account').showModal();
          $('studio-consent').focus();
        }
        throw new Error('Persetujuan cloud belum aktif. Foto tetap lokal.');
      }
      if (manual) { entry.cloudUploadApproved = true; await hooks.persist(entry); }
      const prepared = await prepareCloudImage(entry.blob);
      if (!sameCloudIdentity(identity)) return;
      // Expiry is never silently refreshed by an automatic retry on reload.
      const result = await api('upload', { method: 'POST', body: prepared.blob, headers: {
        'Content-Type': 'image/png', 'X-Photo-Id': entry.id, 'X-Photo-Mode': entry.kind,
      } });
      if (!sameCloudIdentity(identity)) return;
      sent = true; entry.cloudId = result.photo.id; entry.cloudExpiresAt = result.photo.expires_at; upload.hidden = true;
      show(`Tersimpan di cloud hingga ${new Date(result.photo.expires_at).toLocaleString('id-ID')}.${prepared.resized ? ' Salinan cloud diperkecil; unduhan lokal tetap foto asli.' : ''}`);
      await hooks.persist(entry);
    } catch (error) { if (sameCloudIdentity(identity)) { upload.hidden = false; show(`Belum tersimpan di cloud: ${error.message}`); } }
    finally { upload.disabled = false; }
  }
  upload.addEventListener('click', () => send(true)); actions.append(upload); title.after(status);
  // Only a new capture starts an upload. Restored records require an explicit retry.
  if (entry.freshCapture && eligibleAtCapture && !sent) send();
}

export function captureConsent() { return !!state?.configured && !!state?.user && state.consent?.active === true; }
