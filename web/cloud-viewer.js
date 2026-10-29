import { api, photoUrl } from './cloud-client.js';

// One photo at a time, with bounded metadata pages and no page navigation.
export function createCloudViewer({ verify, identity, isCurrent, notice }) {
  const $ = id => document.getElementById(id), dialog = $('studio-cloud-gallery');
  let rows = [], index = 0, cursors = [null], page = 0, next = null, version = 0, busy = false;
  function clear() {
    version++; rows = []; $('cloud-view-body').replaceChildren(); busy = false;
    if (dialog.open) dialog.close();
  }
  function render() {
    const photo = rows[index]; $('cloud-view-body').replaceChildren();
    $('cloud-view-prev').disabled = busy || (!page && !index);
    $('cloud-view-next').disabled = busy || (!next && index >= rows.length - 1);
    $('cloud-view-position').textContent = photo ? `${page * 25 + index + 1}` : '0';
    if (!photo) { if (!busy && !$('cloud-view-status').textContent) $('cloud-view-status').textContent = 'Belum ada foto cloud.'; return; }
    const token = identity(), stamp = version;
    const card = document.createElement('article'); card.className = 'photo-card';
    const image = new Image(); image.src = photoUrl(photo.id); image.alt = `Foto ${photo.mode || 'studio'}`;
    const title = document.createElement('p'); title.textContent = `Tersimpan hingga ${new Date(photo.expires_at).toLocaleDateString('id-ID')}`;
    const actions = document.createElement('div'); actions.className = 'photo-actions';
    const download = document.createElement('button'); download.textContent = 'Unduh PNG';
    const remove = document.createElement('button'); remove.textContent = 'Hapus cloud';
    const confirm = document.createElement('button'); confirm.textContent = 'Ya, hapus cloud'; confirm.hidden = true;
    const cancel = document.createElement('button'); cancel.textContent = 'Batal'; cancel.hidden = true;
    remove.addEventListener('click', () => { remove.hidden = true; confirm.hidden = cancel.hidden = false; $('cloud-view-status').textContent = 'Hapus cloud untuk Anda dan admin? Foto lokal tetap ada.'; });
    cancel.addEventListener('click', () => { remove.hidden = false; confirm.hidden = cancel.hidden = true; $('cloud-view-status').textContent = ''; });
    confirm.addEventListener('click', async () => {
      confirm.disabled = cancel.disabled = true;
      try {
        await api('remove', { method: 'POST', body: { id: photo.id } });
        if (stamp !== version || !isCurrent(token)) return;
        await load(page, Math.min(index, Math.max(0, rows.length - 2)));
      } catch (error) { if (stamp === version) { $('cloud-view-status').textContent = error.message; confirm.disabled = cancel.disabled = false; } }
    });
    download.addEventListener('click', async () => {
      download.disabled = true;
      try {
        const response = await fetch(photoUrl(photo.id), { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) throw new Error('Foto tidak tersedia. Muat ulang galeri.');
        const blob = await response.blob(); if (stamp !== version || !isCurrent(token)) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = photo.name || `egz-${photo.id}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { if (stamp === version) $('cloud-view-status').textContent = error.message; }
      finally { download.disabled = false; }
    });
    image.onerror = () => { if (stamp === version && photo === rows[index]) $('cloud-view-status').textContent = 'Foto tidak tersedia atau sudah kedaluwarsa.'; };
    actions.append(download, remove, confirm, cancel); card.append(image, title, actions); $('cloud-view-body').append(card);
  }
  async function load(targetPage, targetIndex = 0) {
    if (busy) return; busy = true; const stamp = version, token = identity();
    $('cloud-view-status').textContent = 'Memuat…'; render();
    try {
      const result = await api('photos', { query: cursors[targetPage] ? { cursor: cursors[targetPage] } : {} });
      if (stamp !== version || !isCurrent(token)) return;
      page = targetPage; rows = result.photos || []; index = Math.min(targetIndex, Math.max(0, rows.length - 1)); next = result.nextCursor || null;
      cursors = cursors.slice(0, page + 1); if (next) cursors[page + 1] = next;
      $('cloud-view-status').textContent = '';
    } catch (error) { if (stamp === version) $('cloud-view-status').textContent = error.message; }
    finally { if (stamp === version) { busy = false; render(); } }
  }
  $('cloud-view-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { clear(); document.body.append($('gesture-cursor')); });
  $('cloud-view-prev').addEventListener('click', () => { if (busy) return; if (index) { index--; render(); } else if (page) load(page - 1, 24); });
  $('cloud-view-next').addEventListener('click', () => { if (busy) return; if (index < rows.length - 1) { index++; render(); } else if (next) load(page + 1); });
  return { clear, async open() {
    try {
      const session = await verify(); if (!session?.user) throw new Error('Masuk untuk membuka foto cloud.');
      clear(); page = 0; index = 0; cursors = [null]; next = null;
      dialog.append($('gesture-cursor')); dialog.showModal(); await load(0);
    } catch (error) { notice(error.message); }
  } };
}
