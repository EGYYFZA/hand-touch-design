import { createHash } from 'node:crypto';

// Preserve historical LF/CRLF checksums while writing new records canonically.
export function migrationDigests(sql) {
  const lf = sql.replace(/\r\n/g, '\n');
  return [lf, lf.replace(/\n/g, '\r\n')].map(text => createHash('sha256').update(text).digest('hex'));
}
