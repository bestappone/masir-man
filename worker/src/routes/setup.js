// راه‌اندازی دیتابیس بدون خط فرمان: ساخت جداول و داده‌ی نمونه، مرحله‌به‌مرحله (هر مرحله = یک batch).
// محافظت: کلید SETUP_KEY (Secret در Cloudflare). اجرای دوباره بی‌خطر است (IF NOT EXISTS / INSERT OR IGNORE).
import { HttpError, json } from '../lib/http.js';
import { safeEqual } from '../lib/crypto.js';
import schema from '../sql/schema.js';
import seed from '../sql/seed.js';

const MAX_STMTS = 20, MAX_BYTES = 120000;
const ALL = [...schema, ...seed];
const STEPS = (() => { // گروه‌بندی ثابت (به‌ترتیب) بر اساس تعداد و حجم
  const out = []; let cur = [], size = 0; const enc = new TextEncoder();
  for (const s of ALL) { const n = enc.encode(s).length; if (cur.length && (cur.length >= MAX_STMTS || size + n > MAX_BYTES)) { out.push(cur); cur = []; size = 0; } cur.push(s); size += n; }
  if (cur.length) out.push(cur); return out;
})();

const attempts = new Map(); // ضدحدس ساده در هر isolate
function throttle(ip) {
  const now = Date.now(); const a = (attempts.get(ip) || []).filter(t => now - t < 600000);
  if (a.length >= 30) throw new HttpError(429, 'تلاش‌های زیاد. ۱۰ دقیقه بعد دوباره امتحان کن.');
  a.push(now); attempts.set(ip, a);
}

export async function status(ctx) {
  let initialized = false, majors = 0, hasAdmin = false;
  try {
    const t = await ctx.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','majors')").all();
    const names = (t.results || []).map(r => r.name);
    if (names.includes('majors')) { majors = (await ctx.env.DB.prepare('SELECT COUNT(*) n FROM majors').first())?.n || 0; initialized = majors > 0; }
    if (names.includes('users')) hasAdmin = !!(await ctx.env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first());
  } catch { /* دیتابیس هنوز آماده نیست */ }
  return json({ initialized, has_admin: hasAdmin, steps: STEPS.length, setup_key_set: !!ctx.env.SETUP_KEY });
}

export async function initDb(ctx) {
  const { env } = ctx; throttle(ctx.ip);
  if (!env.DB) throw new HttpError(503, 'دیتابیس D1 به Worker متصل نشده است (Binding با نام DB).');
  if (!env.SETUP_KEY) throw new HttpError(503, 'متغیر مخفی SETUP_KEY هنوز در Cloudflare ساخته نشده است.');
  const b = await ctx.body();
  if (!safeEqual(String(b.setup_key || ''), env.SETUP_KEY)) throw new HttpError(403, 'کلید راه‌اندازی درست نیست.');
  // پس از ساخت مدیر، اجرای دوباره مجاز نیست (وگرنه محتوایی که مدیر حذف کرده برمی‌گردد)
  try { if (await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first()) throw new HttpError(409, 'راه‌اندازی قبلاً انجام شده و مدیر ساخته شده است. برای امنیت، متغیر SETUP_KEY را از Cloudflare حذف کن.'); }
  catch (e) { if (e instanceof HttpError) throw e; /* جدول users هنوز وجود ندارد: ادامه */ }
  const step = Number(b.step ?? 0);
  if (!Number.isInteger(step) || step < 0 || step >= STEPS.length) throw new HttpError(400, 'شماره‌ی مرحله معتبر نیست.');
  try { await env.DB.batch(STEPS[step].map(s => env.DB.prepare(s))); }
  catch (e) { console.error('init_step_failed', step, e?.message); throw new HttpError(500, `مرحله‌ی ${step + 1} با خطا مواجه شد؛ دوباره اجرا کن (اجرای مجدد بی‌خطر است). ${String(e?.message || '').slice(0, 160)}`); }
  return json({ ok: true, step, steps: STEPS.length, done: step === STEPS.length - 1 });
}
