const enc = new TextEncoder();
const toB64 = (buf) => { let s = ''; new Uint8Array(buf).forEach(b => s += String.fromCharCode(b)); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const toHex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// قالب ذخیره: pbkdf2$<تکرار>$<salt>$<hash>
export async function hashPassword(password, iterations = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
}
export async function verifyPassword(password, stored) {
  const [alg, it, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2') return false;
  const got = toB64(await derive(password, fromB64(salt), Number(it)));
  return safeEqual(got, hash);
}
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function sha256Hex(text) { return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
export function randomToken(bytes = 32) { return toHex(crypto.getRandomValues(new Uint8Array(bytes))); }
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 8) {
  const r = crypto.getRandomValues(new Uint8Array(len));
  return [...r].map(b => ALPHA[b % ALPHA.length]).join('');
}
