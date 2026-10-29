// Deployed as a Supabase Edge Function. No browser or public client credentials.
const base = Deno.env.get('SUPABASE_URL');
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const jobSecret = Deno.env.get('EGZ_RETENTION_SECRET');
const headers = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
async function authorized(value) {
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const a = await digest(value || ''), b = await digest(jobSecret || '');
  let different = 0; for (let index = 0; index < a.length; index++) different |= a[index] ^ b[index];
  return different === 0;
}
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Retention operation failed');
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
async function erase(rows, tombstones = false) {
  if (!rows.length) return 0;
  const filter = `id=in.(${rows.map(row => row.id).join(',')})`;
  if (!tombstones) await request(`/rest/v1/egz_photos?${filter}`, 'PATCH', { status: 'deleting' });
  await request('/storage/v1/object/photo-archive', 'DELETE', { prefixes: rows.map(row => row.object_path) });
  await request(`/rest/v1/egz_photos?${filter}`, 'PATCH', { status: 'deleted' });
  return rows.length;
}
Deno.serve(async req => {
  const reply = (status, body) => new Response(JSON.stringify(body), { status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (!base || !secret || !jobSecret) return reply(503, { error: 'Retention configuration unavailable' });
  if (req.method !== 'POST' || !await authorized(req.headers.get('x-egz-retention-secret'))) return reply(401, { error: 'Unauthorized' });
  let removed = 0, reconciled = 0;
  try {
    const query = new URLSearchParams({ select: 'id,object_path', status: 'neq.deleted', limit: '100', order: 'created_at.asc',
      or: `(expires_at.lte.${new Date().toISOString()},status.eq.deleting,and(status.in.(reserved,failed),created_at.lt.${new Date(Date.now() - 3600000).toISOString()}))` });
    removed = await erase(await request(`/rest/v1/egz_photos?${query}`));
    const old = new URLSearchParams({ select: 'id,object_path', status: 'eq.deleted', deleted_at: `gt.${new Date(Date.now() - 86400000).toISOString()}`,
      order: 'updated_at.asc', limit: '25' });
    reconciled = await erase(await request(`/rest/v1/egz_photos?${old}`), true);
    await request('/rest/v1/rpc/egz_housekeeping', 'POST', {});
    await request('/rest/v1/egz_audit_events', 'POST', { action: 'retention.run', details: { removed, reconciled, failed: 0 } });
    return reply(200, { removed, reconciled, failed: 0 });
  } catch {
    try { await request('/rest/v1/egz_audit_events', 'POST', { action: 'retention.run', details: { removed, reconciled, failed: 1 } }); } catch { /* Function status remains failed. */ }
    return reply(503, { removed, reconciled, failed: 1 });
  }
});
