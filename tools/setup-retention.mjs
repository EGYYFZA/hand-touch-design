import { operatorDatabase } from './operator-db.mjs';
import { configuration } from '../server/config.mjs';
process.loadEnvFile(new URL('../.env.local', import.meta.url));
const cfg = configuration(), db = await operatorDatabase();
const action = process.argv[2] || 'check';
try {
  const url = `${cfg.url}/functions/v1/egz-retention`;
  const denied = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(20000) });
  if (denied.status !== 401) throw new Error('Retention endpoint did not reject anonymous call');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${cfg.secret}`, 'X-EGZ-Retention-Secret': cfg.cronSecret, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok || result.failed !== 0) throw new Error(`Retention function preflight failed (${response.status})`);
  console.log(JSON.stringify({ functionVerified: true, anonymousDenied: true, ...result }));
  await db.connect();
  if (action === 'bootstrap') {
    const row = (await db.query("select id, decrypted_secret=$1 as matches from vault.decrypted_secrets where name='egz_retention_auth'", [cfg.secret])).rows[0];
    if (!row) await db.query("select vault.create_secret($1,'egz_retention_auth','EGZ scheduled private Storage cleanup')", [cfg.secret]);
    else if (!row.matches) await db.query('select vault.update_secret($1,$2)', [row.id, cfg.secret]);
    const job = (await db.query("select id,decrypted_secret=$1 as matches from vault.decrypted_secrets where name='egz_retention_job_secret'", [cfg.cronSecret])).rows[0];
    if (!job) await db.query("select vault.create_secret($1,'egz_retention_job_secret','EGZ purpose-specific retention authorization')", [cfg.cronSecret]);
    else if (!job.matches) await db.query('select vault.update_secret($1,$2)', [job.id,cfg.cronSecret]);
    console.log('Retention authentication stored in encrypted Vault; credential suppressed.');
  } else if (action === 'check') {
    const job = (await db.query("select jobid,schedule,active from cron.job where jobname='egz-retention-30-days'")).rows[0];
    if (!job?.active) throw new Error('Retention cron is not active');
    const queued = (await db.query('select egz_internal.enqueue_retention() as id')).rows[0].id;
    let delivery;
    for (let i = 0; i < 30; i++) {
      const row = (await db.query('select status_code,timed_out,error_msg,content from net._http_response where id=$1', [queued])).rows[0];
      if (row) { delivery = row; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!delivery || delivery.status_code !== 200 || delivery.timed_out) throw new Error('Scheduled HTTP delivery failed');
    console.log(JSON.stringify({ cron: job, deliveryStatus: delivery.status_code, result: JSON.parse(delivery.content) }));
  } else throw new Error('Unknown retention setup action');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.end(); }
