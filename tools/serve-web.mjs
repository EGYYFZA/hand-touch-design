import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
const config = JSON.parse(await readFile(resolve(import.meta.dirname, '../vercel.json'), 'utf8'));
const securityHeaders = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.svg': 'image/svg+xml' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const rel = relative(root, file);
    if (rel === '..' || rel.startsWith(`..${sep}`) || request.method !== 'GET') {
      response.writeHead(403).end(); return;
    }
    const data = await readFile(file);
    response.writeHead(200, { ...securityHeaders, 'Content-Type': types[extname(file)] || 'text/plain' });
    response.end(data);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('GestureCanvas: http://127.0.0.1:4173'));
