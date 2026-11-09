import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationDigests } from '../../tools/migration-checksum.mjs';

test('migration checksums tolerate OS newlines but reject SQL changes', () => {
  const sql = 'begin;\nselect 1;\ncommit;\n', hashes = migrationDigests(sql);
  assert.deepEqual(migrationDigests(sql.replace(/\n/g, '\r\n')), hashes);
  assert.notEqual(hashes[0], hashes[1]);
  assert.equal(migrationDigests(sql.replace('select 1', 'select 2')).some(hash => hashes.includes(hash)), false);
});
