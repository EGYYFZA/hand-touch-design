import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
const demo = process.argv.includes('--demo');
const portAt = process.argv.indexOf('--port');
const port = portAt >= 0 ? Number(process.argv[portAt + 1]) : 4173;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid development port');
if (!demo) {
  try { process.loadEnvFile(resolve(import.meta.dirname, '../.env.local')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const { createStudioHandler } = await import('../server/backend.mjs');
const studio = createStudioHandler();
const config = JSON.parse(await readFile(resolve(import.meta.dirname, '../vercel.json'), 'utf8'));
const securityHeaders = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.vtt': 'text/vtt; charset=utf-8' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
    if (pathname === '/api/studio') {
      if (demo) {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ configured: false, user: null, csrfToken: null })); return;
      }
      return await studio(request, response);
    }
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const rel = relative(root, file);
    if (rel === '..' || rel.startsWith(`..${sep}`) || request.method !== 'GET') {
      response.writeHead(403).end(); return;
    }
    const data = await readFile(file);
    const contentType = types[extname(file)] || 'text/plain';
    // Native video seeking needs byte ranges in the local preview, just as on Netlify.
    if (extname(file) === '.mp4') {
      response.setHeader('Accept-Ranges', 'bytes');
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        let start = range?.[1] ? Number(range[1]) : 0;
        let end = range?.[2] ? Number(range[2]) : data.length - 1;
        if (range && !range[1] && range[2]) { start = Math.max(0, data.length - end); end = data.length - 1; }
        end = Math.min(end, data.length - 1);
        if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= data.length || end < start) {
          response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end(); return;
        }
        response.writeHead(206, { 'Content-Type': contentType, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
        response.end(data.subarray(start, end + 1)); return;
      }
    }
    response.writeHead(200, { ...securityHeaders, 'Content-Type': contentType, 'Content-Length': data.length, 'Cache-Control': 'no-store' });
    response.end(data);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`EGZ ${demo ? 'explicit local demo' : 'account backend'}: http://127.0.0.1:${port}`));
