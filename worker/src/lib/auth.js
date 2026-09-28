import { HttpError } from './http.js';
import { sha256Hex, randomToken } from './crypto.js';
import { first, run, parseJson } from './db.js';

export async function createSession(env, userId, ip) {
  const token = randomToken(32);
  const days = Number(env.SESSION_DAYS || 7);
  const exp = new Date(Date.now() + days * 86400e3).toISOString();
  await run(env, 'INSERT INTO sessions (token_hash, user_id, expires_at, ip) VALUES (?,?,?,?)', await sha256Hex(token), userId, exp, ip || null);
  return token;
}
export async function loadUser(req, env) {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer ([a-f0-9]{64})$/.exec(h);
  if (!m) return null;
  const row = await first(env, `SELECT u.id, u.name, u.email, u.role, u.status, u.referral_code, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, await sha256Hex(m[1]));
  if (!row) return null;
  if (row.expires_at < new Date().toISOString() || row.status !== 'active') return null;
  const { expires_at, ...user } = row;
  user._token = m[1];
  return user;
}
export function requireUser(ctx) { if (!ctx.user) throw new HttpError(401, 'برای ادامه وارد حساب خود شو.'); return ctx.user; }
export const PROVIDER_ROLES = ['counselor', 'professional', 'mentor', 'coach'];
export const STAFF_ROLES = ['admin', 'editor'];
export function requireRole(ctx, roles) {
  const u = requireUser(ctx);
  if (!roles.includes(u.role)) throw new HttpError(403, 'دسترسی به این بخش برای تو مجاز نیست.');
  return u;
}
// مجوزها از جدول roles خوانده می‌شود: ["*"] همه، ["content"] گروه، یا نام منبع
export async function canManage(env, user, resName, group) {
  if (user.role === 'admin') return true;
  const r = await first(env, 'SELECT permissions FROM roles WHERE code=?', user.role);
  const perms = parseJson(r?.permissions, []);
  return perms.includes('*') || perms.includes(group) || perms.includes(resName);
}
