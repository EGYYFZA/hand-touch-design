import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';

export const MAX_UPLOAD = 3 * 1024 * 1024;
export const CONSENT_VERSION = '2026-10-29';
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const hash = value => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const privateHash = (value, key) => createHmac('sha256', key).update(value).digest('hex');
export function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function validateOrigin(origin, expected) { return typeof origin === 'string' && origin === expected; }
function encryptionKey(secret) {
  const key = Buffer.from(secret || '', 'base64');
  if (key.length !== 32) throw new Error('SESSION_SECRET must be 32 random bytes in base64');
  return key;
}
export function encrypt(value, secret, context) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}
export function decrypt(value, secret, context) {
  const data = Buffer.from(value, 'base64url');
  if (data.length < 29) throw new Error('Invalid encrypted session');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
}
export async function normalizePng(input) {
  if (!Buffer.isBuffer(input) || input.length < 33 || input.length > MAX_UPLOAD ||
      !input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('invalid_png');
  const image = sharp(input, { limitInputPixels: 16_000_000, failOn: 'warning', animated: false });
  const metadata = await image.metadata();
  if (metadata.format !== 'png' || !metadata.width || !metadata.height || metadata.width > 8192 ||
      metadata.height > 8192 || (metadata.pages || 1) !== 1) throw new Error('invalid_png');
  // Re-encoding removes ancillary metadata and payloads after the image stream.
  const buffer = await image.png({ compressionLevel: 6 }).toBuffer();
  if (buffer.length > MAX_UPLOAD) throw new Error('png_too_large');
  return { buffer, width: metadata.width, height: metadata.height, sha256: hash(buffer) };
}
export async function readBody(req, maximum = 8192) {
  const declared = Number(req.headers['content-length']);
  if (declared > maximum) throw Object.assign(new Error('body_too_large'), { status: 413 });
  if (req.body !== undefined) {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    if (body.length > maximum) throw Object.assign(new Error('body_too_large'), { status: 413 });
    return body;
  }
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk); length += bytes.length;
    if (length > maximum) throw Object.assign(new Error('body_too_large'), { status: 413 });
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  let value;
  try { value = JSON.parse((await readBody(req)).toString('utf8')); }
  catch (error) { if (error.status === 413) throw error; throw Object.assign(new Error('Invalid JSON'), { status: 400, publicMessage: 'Isian tidak valid.' }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Invalid JSON object'), { status: 400, publicMessage: 'Isian tidak valid.' });
  return value;
}
