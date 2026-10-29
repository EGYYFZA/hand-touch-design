// Local to this site's origin and browser profile. No network or cloud access.
export const MAX_PHOTOS = 12;
export const MAX_LOCAL_BYTES = 40 * 1024 * 1024;
export const GUEST_OWNER = 'guest';
let activeOwner = null;
export function setPhotoOwner(ownerId) { activeOwner = ownerId || null; }
export function photoOwner() { return activeOwner; }
export async function activatePhotoOwner(ownerId) {
  const owner = ownerId || null;
  let previous = null;
  try { previous = localStorage.getItem('egz-cache-owner'); } catch { /* Blocked metadata storage does not unlock account data. */ }
  if (previous && previous !== owner && previous !== GUEST_OWNER) await clearPhotoOwner(previous);
  setPhotoOwner(owner);
  try {
    if (owner) localStorage.setItem('egz-cache-owner', owner);
    else localStorage.removeItem('egz-cache-owner');
  } catch { /* Browser may disable localStorage independently from IndexedDB. */ }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Local storage unavailable')); return; }
    const request = indexedDB.open('egz-local-photos', 2);
    let expired = false;
    const timeout = setTimeout(() => { expired = true; reject(new Error('Local storage timed out')); }, 5000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('photos')) request.result.createObjectStore('photos', { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains('account_photos')) request.result.createObjectStore('account_photos', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (expired) { request.result.close(); return; }
      resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
    request.onblocked = () => { clearTimeout(timeout); expired = true; reject(new Error('Local storage blocked')); };
  });
}

async function transaction(mode, operation, owner = activeOwner) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const storeName = owner ? 'account_photos' : 'photos';
      const tx = database.transaction(storeName, mode);
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Local storage operation failed'));
      try { operation(tx.objectStore(storeName), result => { value = result; }, tx); }
      catch (error) { tx.abort(); reject(error); }
    });
  } finally { database.close(); }
}

export function listPhotos() {
  const owner = activeOwner;
  return transaction('readonly', (store, done) => {
    const request = store.getAll();
    request.onsuccess = () => done(request.result.filter(item => !owner || item.ownerId === owner).sort((a, b) => a.createdAt - b.createdAt));
  }, owner);
}

export function storePhoto(photo, owner = activeOwner) {
  if (photo.ownerId && photo.ownerId !== owner) return Promise.reject(new Error('Photo owner changed'));
  if (!(photo.blob instanceof Blob) || photo.blob.type !== 'image/png' || !photo.blob.size) {
    return Promise.reject(new Error('Invalid photo'));
  }
  return transaction('readwrite', (store, done, tx) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const others = request.result.filter(item => (!owner || item.ownerId === owner) && item.id !== photo.id);
      const bytes = others.reduce((total, item) => total + item.blob.size, photo.blob.size);
      if (others.length >= MAX_PHOTOS || bytes > MAX_LOCAL_BYTES) { tx.abort(); return; }
      store.put(owner ? { ...photo, ownerId: owner, key: `${owner}:${photo.id}` } : photo);
    };
  }, owner);
}

export function deletePhoto(id, owner = activeOwner) {
  return transaction('readwrite', store => { store.delete(owner ? `${owner}:${id}` : id); }, owner);
}

export function clearPhotoOwner(ownerId) {
  if (!ownerId) return Promise.resolve();
  return transaction('readwrite', store => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (cursor.value.ownerId === ownerId) cursor.delete();
      cursor.continue();
    };
  }, ownerId);
}

// An explicit login claims only the current guest namespace, never legacy demo
// data or another UID. Copy and removal commit together, preserving originals.
// A merge may exceed the capture cap; new captures stay blocked until space is freed.
export function claimGuestPhotos(ownerId) {
  if (!ownerId || ownerId === GUEST_OWNER) return Promise.reject(new Error('Invalid account owner'));
  return transaction('readwrite', store => {
    const request = store.getAll();
    request.onsuccess = () => {
      for (const photo of request.result.filter(item => item.ownerId === GUEST_OWNER)) {
        store.put({ ...photo, ownerId, key: `${ownerId}:${photo.id}`, cloudConsentAtCapture: false });
        store.delete(photo.key);
      }
    };
  }, ownerId);
}
