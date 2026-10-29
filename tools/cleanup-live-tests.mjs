import { readFile, writeFile } from 'node:fs/promises';
import { operatorDatabase } from './operator-db.mjs';
import { configuration, serviceClient } from '../server/config.mjs';
export async function cleanupLiveTests() {
  const path = new URL('../secrets/live-test-cleanup.json', import.meta.url);
  const record = JSON.parse(await readFile(path, 'utf8'));
  if (!record.account_ids?.length) return;
  const service = serviceClient(configuration()), ids = [];
  for (const id of record.account_ids) {
    const { data, error } = await service.auth.admin.getUserById(id);
    if (error || !/^egz-(a|b|admin)-[a-f0-9-]+@example\.invalid$/.test(data.user?.email || '')) throw new Error('Refusing to clean an account outside synthetic fixtures');
    ids.push(id);
  }
  const rows = await service.from('egz_photos').select('object_path').in('owner_id', ids);
  if (rows.error) throw new Error('Fixture lookup failed');
  if (rows.data.length) {
    const removed = await service.storage.from('photo-archive').remove(rows.data.map(row => row.object_path));
    if (removed.error) throw new Error('Fixture Storage cleanup failed');
  }
  const db = await operatorDatabase(); await db.connect();
  try {
    await db.query('begin');
    await db.query('delete from public.egz_audit_events where actor_id=any($1::uuid[]) or photo_id in(select id from public.egz_photos where owner_id=any($1::uuid[]))', [ids]);
    for (const [table, column] of [['egz_sessions','owner_id'],['egz_photos','owner_id'],['egz_consents','owner_id'],['egz_admin_memberships','user_id']]) {
      await db.query(`delete from public.${table} where ${column}=any($1::uuid[])`, [ids]);
    }
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; } finally { await db.end(); }
  for (const id of ids) { const result = await service.auth.admin.deleteUser(id); if (result.error) throw new Error('Synthetic Auth cleanup failed'); }
  await writeFile(path, JSON.stringify({ account_ids: [] }));
  console.log(`Removed ${ids.length} synthetic Auth accounts and their own test rows/objects.`);
}
if (process.argv[1] && new URL(import.meta.url).pathname.toLowerCase().endsWith(process.argv[1].replaceAll('\\','/').split('/').at(-1).toLowerCase())) {
  process.loadEnvFile(new URL('../.env.local', import.meta.url)); await cleanupLiveTests();
}
