import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..');
const setup = JSON.parse(await readFile(resolve(root, 'secrets/supabase-project-setup.json'), 'utf8'));
if (setup.project_ref !== 'chznehpvkuuooclyjhqg') throw new Error('Wrong target project');
const client = new pg.Client({ host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 5432,
  database: 'postgres', user: `postgres.${setup.project_ref}`, password: setup.database_password,
  ssl: { rejectUnauthorized: true, ca: await readFile(resolve(root, 'config/supabase-ca.crt'), 'utf8') }, connectionTimeoutMillis: 20000,
  application_name: 'egz-reviewed-migration-runner' });
const action = process.argv[2] || 'status';
try {
  await client.connect();
  if (action === 'migrate') {
    await client.query("select pg_advisory_lock(hashtextextended('egz-migrations',0))");
    await client.query('create schema if not exists egz_internal; revoke all on schema egz_internal from public, anon, authenticated; create table if not exists egz_internal.schema_migrations(version text primary key, sha256 text not null, applied_at timestamptz not null default now())');
    for (const file of (await readdir(resolve(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(resolve(root, 'supabase/migrations', file), 'utf8');
      const digest = createHash('sha256').update(sql).digest('hex');
      const applied = (await client.query('select sha256 from egz_internal.schema_migrations where version=$1', [file])).rows[0];
      if (applied) { if (applied.sha256 !== digest) throw new Error('Applied migration was modified'); console.log(`Already applied: ${file}`); continue; }
      const body = sql.replace(/(^|\n)begin;\r?\n/i, '$1').replace(/\ncommit;\s*$/i, '\n');
      await client.query('begin');
      try {
        await client.query(body);
        await client.query('insert into egz_internal.schema_migrations(version,sha256) values($1,$2)', [file, digest]);
        await client.query('commit'); console.log(`Applied: ${file}`);
      } catch (error) { await client.query('rollback'); throw error; }
    }
    await client.query("select pg_advisory_unlock(hashtextextended('egz-migrations',0))");
  } else if (action === 'test' || action === 'test-counts') {
    const file = action === 'test' ? 'authorization.sql' : 'global-counts.sql';
    await client.query(await readFile(resolve(root, 'supabase/tests', file), 'utf8'));
    console.log(`Database ${file} passed; all fixtures rolled back.`);
  } else if (action === 'status') {
    const result = await client.query("select count(*)::int as tables from information_schema.tables where table_schema='public' and table_name like 'egz_%'");
    console.log(JSON.stringify({ project: setup.project_ref, connected: true, applicationTables: result.rows[0].tables }));
  } else throw new Error('Unknown operation');
} catch (error) {
  console.error(`Database ${action} failed: ${error.code || 'error'} ${error.message}`); process.exitCode = 1;
} finally { await client.end(); }
