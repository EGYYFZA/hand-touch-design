export const CONSENT_VERSION = '2026-10-29';
let session = null, readGeneration = 0;

export function currentSession() { return session; }
export function photoUrl(id) { return `/api/studio?action=photo&id=${encodeURIComponent(id)}`; }

export async function refreshSession() {
  const generation = ++readGeneration;
  const response = await fetch('/api/studio?action=session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  // The explicit standalone preview has no API; never silently downgrade a public deployment.
  if (response.status === 404 && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
    const preview = { configured: false, user: null, csrfToken: null, consent: null, isAdmin: false };
    if (generation === readGeneration) session = preview;
    return preview;
  }
  if (!response.ok) throw new Error('Layanan akun belum dapat dihubungi. Coba muat ulang halaman.');
  const next = await response.json();
  if (typeof next.configured !== 'boolean') throw new Error('Respons layanan akun tidak valid.');
  if (next.configured === false && !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
    throw new Error('Konfigurasi akun belum siap. Studio lokal tetap dapat digunakan.');
  }
  if (generation === readGeneration) session = next;
  return next;
}

export async function api(action, { method = 'GET', body, headers = {}, query = {} } = {}) {
  if (!session) await refreshSession();
  const params = new URLSearchParams({ action, ...query });
  const requestHeaders = new Headers(headers);
  if (method !== 'GET') {
    if (!session.csrfToken) throw new Error('Sesi formulir belum tersedia. Muat ulang halaman.');
    requestHeaders.set('X-CSRF-Token', session.csrfToken);
  }
  let payload = body;
  if (body !== undefined && !(body instanceof Blob)) {
    requestHeaders.set('Content-Type', 'application/json'); payload = JSON.stringify(body);
  }
  const authMutation = method !== 'GET' && ['login', 'confirm', 'logout', 'mfa-verify'].includes(action);
  if (authMutation) readGeneration++;
  const response = await fetch(`/api/studio?${params}`, {
    method, credentials: 'same-origin', cache: 'no-store', headers: requestHeaders, body: payload,
  });
  if (authMutation) readGeneration++;
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 401 && !['login', 'signup', 'confirm'].includes(action)) window.dispatchEvent(new Event('egz-session-expired'));
    const error = new Error(result?.error || result?.message || 'Permintaan belum berhasil. Coba lagi.');
    error.status = response.status; throw error;
  }
  return result;
}

export async function logout() {
  const previous = session?.user?.id;
  await api('logout', { method: 'POST', body: {} });
  session = { ...session, user: null, consent: null };
  window.dispatchEvent(new CustomEvent('egz-logout', { detail: { ownerId: previous } }));
  return previous;
}

export function message(element, text, error = false) {
  element.textContent = text; element.classList.toggle('error', error);
}
