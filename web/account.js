import { api, refreshSession, currentSession, logout, CONSENT_VERSION, message } from './cloud-client.js';
import { activatePhotoOwner, clearPhotoOwner } from './photo-store.js';
const $ = id => document.getElementById(id);
// A default provider confirmation link may return a fragment. Never persist,
// forward, or use its tokens; the BFF requires a fresh verified password login.
if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
let factorId = null;
const channel = globalThis.BroadcastChannel ? new BroadcastChannel('egz-account') : null;

function status(text, error = false) { message($('account-status'), text, error); }
function setBusy(busy) { for (const button of document.querySelectorAll('button')) button.disabled = busy; }

async function showSession() {
  const session = await refreshSession();
  $('signed-out').hidden = !!session.user || !session.configured;
  $('signed-in').hidden = !session.user;
  $('registration-note').hidden = session.registrationEnabled !== false;
  if (!session.configured) { status('Pratinjau lokal tanpa layanan akun.'); return; }
  if (!session.user) {
    $('mfa-secret').textContent = ''; $('mfa-qr').removeAttribute('src');
    await activatePhotoOwner(null); status('Masuk untuk melanjutkan ke studio.'); return;
  }
  await activatePhotoOwner(session.user.id);
  $('user-email').textContent = session.user.email || 'Akun pengguna';
  $('cloud-consent').checked = !!session.consent?.active;
  $('admin-link').hidden = !session.isAdmin;
  $('mfa-section').hidden = !session.isAdmin;
  factorId = session.mfaFactors?.find(factor => factor.factor_type === 'totp' && factor.status === 'verified')?.id || null;
  $('mfa-enroll').hidden = !!factorId;
  $('mfa-form').hidden = !factorId;
  status(session.mfaRequired ? 'Masuk berhasil. Verifikasi autentikator diperlukan untuk arsip admin.' : 'Anda sudah masuk.');
}

async function auth(action) {
  if (!$('login-form').reportValidity()) return;
  const email = $('email').value.trim(); const password = $('password').value;
  if (action === 'signup' && password.length < 12) { status('Gunakan password minimal 12 karakter untuk akun baru.', true); return; }
  setBusy(true);
  try {
    const result = await api(action, { method: 'POST', body: { email, password } });
    $('password').value = '';
    if (action === 'signup' && result?.confirmationRequired) {
      $('confirm-form').hidden = false; $('confirm-code').focus();
      status('Periksa email untuk mengonfirmasi akun. Jika tersedia kode, masukkan di bawah.');
    } else { await showSession(); }
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
}

$('login-form').addEventListener('submit', event => { event.preventDefault(); auth('login'); });
$('signup').addEventListener('click', () => auth('signup'));
$('confirm-form').addEventListener('submit', async event => {
  event.preventDefault(); setBusy(true);
  try {
    await api('confirm', { method: 'POST', body: { email: $('email').value.trim(), token: $('confirm-code').value.trim() } });
    $('confirm-code').value = ''; $('confirm-form').hidden = true; await showSession();
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
});
$('cloud-consent').addEventListener('change', async () => {
  const box = $('cloud-consent'); const desired = box.checked; box.disabled = true;
  try {
    await api('consent', { method: 'POST', body: { granted: desired, version: CONSENT_VERSION } });
    await refreshSession();
    status(desired ? 'Persetujuan aktif untuk foto baru. Foto lama tidak otomatis diunggah.' : 'Persetujuan dicabut. Pengiriman foto baru dihentikan.');
    channel?.postMessage({ type: 'consent' });
  } catch (error) { box.checked = !desired; status(error.message, true); }
  finally { box.disabled = false; }
});
$('logout').addEventListener('click', async () => {
  setBusy(true); const owner = currentSession()?.user?.id;
  try {
    await logout();
    $('signed-in').hidden = true; $('mfa-secret').textContent = ''; $('mfa-qr').removeAttribute('src');
    try { await clearPhotoOwner(owner); } catch { status('Sesi berakhir, tetapi pembersihan cache gagal. Hapus data situs pada perangkat bersama.', true); return; }
    channel?.postMessage({ type: 'logout', ownerId: owner });
    location.replace('account.html');
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
});
$('mfa-enroll').addEventListener('click', async () => {
  setBusy(true);
  try {
    const result = await api('mfa-enroll', { method: 'POST', body: {} }); factorId = result.id;
    const qr = result.qrCode;
    if (typeof qr === 'string' && (qr.startsWith('data:image/svg+xml') || qr.trim().startsWith('<svg'))) {
      $('mfa-qr').src = qr.startsWith('data:') ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
      $('mfa-qr').hidden = false;
    }
    $('mfa-secret').textContent = result.secret || '';
    $('mfa-setup').hidden = false; $('mfa-form').hidden = false; $('mfa-code').focus();
    status('Pindai QR atau masukkan kunci ke autentikator, lalu verifikasi kode.');
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
});
$('mfa-form').addEventListener('submit', async event => {
  event.preventDefault(); setBusy(true);
  try {
    if (!factorId) throw new Error('Siapkan autentikator terlebih dahulu.');
    await api('mfa-verify', { method: 'POST', body: { factorId, code: $('mfa-code').value.trim() } });
    $('mfa-code').value = ''; $('mfa-secret').textContent = ''; $('mfa-qr').removeAttribute('src'); $('mfa-setup').hidden = true;
    await showSession(); status('Verifikasi admin berhasil. Anda dapat membuka arsip admin.');
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
});
window.addEventListener('egz-session-expired', () => {
  const owner = currentSession()?.user?.id;
  $('signed-in').hidden = true; $('signed-out').hidden = false; $('mfa-secret').textContent = ''; $('mfa-qr').removeAttribute('src');
  status('Sesi berakhir. Masuk kembali.', true);
  clearPhotoOwner(owner).catch(() => status('Sesi berakhir. Pembersihan cache gagal; hapus data situs pada perangkat bersama.', true));
});
async function recheckSession() {
  const previous = currentSession()?.user?.id;
  if (!previous) return;
  try {
    const next = await refreshSession();
    if (next.user?.id !== previous) {
      $('signed-in').hidden = true; $('mfa-secret').textContent = ''; $('mfa-qr').removeAttribute('src');
      await clearPhotoOwner(previous); await showSession();
    }
  } catch (error) {
    $('signed-in').hidden = true; $('mfa-secret').textContent = ''; $('mfa-qr').removeAttribute('src');
    status(error.message, true);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) recheckSession(); });
setInterval(recheckSession, 60000);
channel?.addEventListener('message', event => {
  if (event.data?.type === 'logout') {
    $('signed-in').hidden = true; $('mfa-secret').textContent = ''; $('mfa-qr').removeAttribute('src');
    clearPhotoOwner(currentSession()?.user?.id).catch(() => {}); location.replace('account.html');
  }
});
showSession().catch(error => status(error.message, true));
