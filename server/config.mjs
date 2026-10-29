import { createClient } from '@supabase/supabase-js';

export function configuration(env = process.env) {
  const value = { url: env.SUPABASE_URL, publishable: env.SUPABASE_PUBLISHABLE_KEY,
    secret: env.SUPABASE_SECRET_KEY, encryptionKey: env.SESSION_SECRET,
    origin: env.APP_ORIGIN, cronSecret: env.CRON_SECRET,
    bootstrapEmail: (env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase(),
    uploadsEnabled: env.UPLOADS_ENABLED !== 'false', publicSignupEnabled: env.PUBLIC_SIGNUP_ENABLED === 'true', vercel: env.VERCEL === '1' };
  if ([value.url, value.publishable, value.secret, value.encryptionKey, value.origin, value.cronSecret].some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error('Backend configuration incomplete');
  }
  const origin = new URL(value.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.origin !== value.origin || !(origin.protocol === 'https:' || (local && origin.protocol === 'http:')) ||
      !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(value.url) ||
      !/^[A-Za-z0-9+/]{43}=$/.test(value.encryptionKey) || Buffer.from(value.encryptionKey, 'base64').length !== 32 ||
      value.cronSecret.trim().length < 32 || value.cronSecret === value.encryptionKey) throw new Error('Invalid backend configuration');
  value.secure = origin.protocol === 'https:';
  value.cookieName = value.secure ? '__Host-egz_session' : 'egz_session';
  value.csrfCookie = value.secure ? '__Host-egz_csrf' : 'egz_csrf';
  return value;
}
const timedFetch = (url, options = {}) => fetch(url, { ...options,
  signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: timedFetch } };
export const serviceClient = cfg => createClient(cfg.url, cfg.secret, options);
export const publicClient = cfg => createClient(cfg.url, cfg.publishable, options);
export const userClient = (cfg, accessToken) => createClient(cfg.url, cfg.publishable, {
  ...options, global: { fetch: timedFetch, headers: { Authorization: `Bearer ${accessToken}` } },
});
