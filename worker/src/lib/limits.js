import { HttpError } from './http.js';
export async function rateLimit(env, key, max, windowSec) {
  const now = Math.floor(Date.now() / 1000); const ws = now - (now % windowSec);
  const k = `${key}:${ws}`;
  await env.DB.prepare('INSERT INTO rate_limits (rl_key, window_start, hits) VALUES (?,?,1) ON CONFLICT(rl_key) DO UPDATE SET hits = hits + 1').bind(k, ws).run();
  const r = await env.DB.prepare('SELECT hits FROM rate_limits WHERE rl_key=?').bind(k).first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86400).run();
  if (r && r.hits > max) throw new HttpError(429, 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کن.');
}
export async function audit(env, ctx, action, entity, entityId, detail) {
  try {
    await env.DB.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?)')
      .bind(ctx?.user?.id ?? null, action, entity ?? null, entityId == null ? null : String(entityId), detail ? String(detail).slice(0, 1000) : null, ctx?.ip ?? null).run();
  } catch { /* ثبت لاگ نباید عملیات اصلی را خراب کند */ }
}
