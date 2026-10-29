import { api, refreshSession, photoUrl, message } from './cloud-client.js';
import { activatePhotoOwner, clearPhotoOwner } from './photo-store.js';
const $ = id => document.getElementById(id);
const admin = document.body.dataset.gallery === 'admin';
let cursor = null, ownerId = null, busy = false, generation = 0;
const channel = globalThis.BroadcastChannel ? new BroadcastChannel('egz-account') : null;

function lock(text) {
  generation++;
  for (const img of document.querySelectorAll('#cloud-grid img')) img.removeAttribute('src');
  $('cloud-grid').replaceChildren(); $('load-more').hidden = true;
  message($('gallery-status'), text, true);
}

function makeCard(photo) {
  const card = document.createElement('article'); card.className = 'cloud-card'; card.dataset.photo = photo.id;
  const image = new Image(); image.loading = 'lazy'; image.alt = `Foto ${photo.mode || 'studio'}`; image.src = photoUrl(photo.id);
  const name = document.createElement('p'); name.textContent = photo.name || 'Hasil studio';
  const expiry = document.createElement('p'); expiry.textContent = `Kedaluwarsa: ${new Date(photo.expires_at).toLocaleString('id-ID')}`;
  const actions = document.createElement('div'); actions.className = 'button-row';
  const download = document.createElement('a'); download.className = 'button primary'; download.href = photoUrl(photo.id);
  download.download = photo.name || `egz-${photo.id}.png`; download.textContent = 'Unduh PNG';
  const remove = document.createElement('button'); remove.textContent = 'Hapus cloud'; remove.className = 'danger';
  const confirmRow = document.createElement('div'); confirmRow.className = 'confirm-row'; confirmRow.hidden = true;
  const warning = document.createElement('p'); warning.textContent = 'Hapus foto dari cloud untuk pengguna dan admin? Salinan lokal dan unduhan tetap ada.';
  const confirm = document.createElement('button'); confirm.textContent = 'Ya, hapus cloud';
  const cancel = document.createElement('button'); cancel.textContent = 'Batal';
  remove.addEventListener('click', () => { confirmRow.hidden = false; remove.hidden = true; });
  cancel.addEventListener('click', () => { confirmRow.hidden = true; remove.hidden = false; });
  confirm.addEventListener('click', async () => {
    confirm.disabled = cancel.disabled = true;
    try { await api('remove', { method: 'POST', body: { id: photo.id } }); image.removeAttribute('src'); card.remove(); message($('gallery-status'), 'Foto cloud dihapus. Salinan lokal dan unduhan tidak berubah.'); }
    catch (error) { warning.textContent = error.message; confirm.disabled = cancel.disabled = false; }
  });
  image.onerror = () => { expiry.textContent = 'Foto tidak tersedia atau sudah kedaluwarsa. Muat ulang daftar.'; };
  actions.append(download, remove); confirmRow.append(warning, confirm, cancel); card.append(image, name, expiry);
  if (admin) { const owner = document.createElement('p'); owner.textContent = `Pemilik: ${photo.owner_id}`; card.append(owner); }
  card.append(actions, confirmRow); return card;
}

async function load() {
  if (busy) return; busy = true; $('load-more').disabled = true;
  const version = generation;
  try {
    const result = await api(admin ? 'admin-photos' : 'photos', { query: cursor ? { cursor } : {} });
    if (version !== generation) return;
    for (const photo of result.photos || []) $('cloud-grid').append(makeCard(photo));
    cursor = result.nextCursor || null; $('load-more').hidden = !cursor;
    message($('gallery-status'), $('cloud-grid').children.length ? `${$('cloud-grid').children.length} foto ditampilkan.` : 'Belum ada foto cloud. Ambil foto di studio setelah menyetujui penyimpanan cloud.');
  } catch (error) { message($('gallery-status'), error.message, true); }
  finally { busy = false; $('load-more').disabled = false; }
}

async function verify() {
  const session = await refreshSession();
  if (!session.configured || !session.user) {
    lock('Masuk terlebih dahulu untuk membuka foto cloud.');
    if (session.configured) await activatePhotoOwner(null);
    location.replace('account.html'); return false;
  }
  if (ownerId && ownerId !== session.user.id) { lock('Akun telah berubah. Buka ulang galeri dari akun aktif.'); await clearPhotoOwner(ownerId); return false; }
  if (!ownerId) await activatePhotoOwner(session.user.id);
  ownerId = session.user.id;
  if (admin && (!session.isAdmin || session.mfaRequired)) { lock(session.isAdmin ? 'Verifikasi autentikator di halaman Akun sebelum membuka arsip admin.' : 'Akun ini tidak memiliki akses admin.'); return false; }
  return true;
}
$('load-more').addEventListener('click', load);
window.addEventListener('egz-session-expired', () => {
  lock('Sesi berakhir. Masuk kembali dari halaman Akun.'); clearPhotoOwner(ownerId).catch(() => {});
});
channel?.addEventListener('message', event => {
  if (event.data?.type === 'logout') { lock('Akun telah keluar di tab lain.'); clearPhotoOwner(ownerId).catch(() => {}); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) verify().catch(error => lock(error.message)); });
setInterval(() => verify().catch(error => lock(error.message)), 60000);
verify().then(ok => { if (ok) load(); }).catch(error => lock(error.message));
