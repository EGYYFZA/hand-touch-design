import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
export async function operatorDatabase() {
  const root = resolve(import.meta.dirname, '..');
  const setup = JSON.parse(await readFile(resolve(root, 'secrets/supabase-project-setup.json'), 'utf8'));
  if (setup.project_ref !== 'chznehpvkuuooclyjhqg') throw new Error('Wrong operator target');
  return new pg.Client({ host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 5432,
    database: 'postgres', user: `postgres.${setup.project_ref}`, password: setup.database_password,
    ssl: { rejectUnauthorized: true, ca: await readFile(resolve(root, 'config/supabase-ca.crt'), 'utf8') },
    connectionTimeoutMillis: 20000, application_name: 'egz-operator' });
}
