import { Readable } from 'node:stream';
import { configuration } from './config.mjs';
import { createStudioHandler } from './backend.mjs';
import securityHeaders from '../config/security-headers.json' with { type: 'json' };

// Adapt the shared Node handler to Netlify's Request/Response API. The body is
// streamed so the shared byte limits apply before buffering untrusted input.
export function createWebHandler({ env = process.env, handler = createStudioHandler({ env }) } = {}) {
  return async (request, context = {}) => {
    const headers = new Headers(securityHeaders);
    headers.set('Cache-Control', 'private, no-store');
    const failure = status => Response.json({ error: status === 403 ? 'Origin tidak diizinkan.' : 'Backend belum tersedia.' }, { status, headers });
    let cfg;
    try { cfg = configuration(env); } catch { return failure(503); }
    const url = new URL(request.url);
    // A preview URL must never silently share production credentials/cookies.
    if (url.origin !== cfg.origin) return failure(403);
    const req = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
    req.method = request.method; req.url = url.pathname + url.search;
    req.headers = Object.fromEntries(request.headers);
    // Netlify supplies this separately from user-controlled forwarding headers.
    req.socket = { remoteAddress: context.ip || 'unknown' };
    req.requestId = /^[A-Za-z0-9_-]{1,100}$/.test(context.requestId || '') ? context.requestId : undefined;
    let status = 200, result = null, ended = false;
    const res = {
      headersSent: false,
      getHeader(name) { return name.toLowerCase() === 'set-cookie' ? headers.getSetCookie() : headers.get(name); },
      setHeader(name, value) {
        headers.delete(name);
        if (Array.isArray(value)) for (const item of value) headers.append(name, String(item));
        else headers.set(name, String(value));
      },
      writeHead(code, values = {}) { status = code; for (const [name, value] of Object.entries(values)) this.setHeader(name, value); this.headersSent = true; return this; },
      end(value = null) { result = value; ended = true; this.headersSent = true; return this; },
    };
    try {
      await handler(req, res);
      if (!ended) return failure(503);
      return new Response(result, { status, headers });
    } catch { return failure(503); }
    finally { req.destroy(); }
  };
}
