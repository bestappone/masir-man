import { HttpError, json } from '../lib/http.js';
import { first, run, all, getSettings, prep, batch } from '../lib/db.js';
import { hashPassword, verifyPassword, randomCode, sha256Hex } from '../lib/crypto.js';
import { cleanFields, isEmail, strongPassword, toEnDigits, need } from '../lib/validate.js';
import { createSession, requireUser } from '../lib/auth.js';
import { rateLimit, audit } from '../lib/limits.js';
import { makeCoupon } from '../services/common.js';

const cleanEmail = (e) => String(e || '').trim().toLowerCase();

async function newReferralCode(env) {
  for (let i = 0; i < 6; i++) {
    const c = randomCode(8);
    if (!(await first(env, 'SELECT id FROM users WHERE referral_code=?', c))) return c;
  }
  return randomCode(10);
}

export async function register(ctx) {
  const { env, ip } = ctx;
  await rateLimit(env, `reg:${ip}`, 8, 3600);
  const s = await getSettings(env, true);
  if (s.registration_open === '0') throw new HttpError(403, 'ثبت‌نام فعلاً بسته است.');
  const b = await ctx.body();
  const d = cleanFields(b, { name: 't!', email: 't!', password: 't!', phone: 't', ref: 't' });
  const email = cleanEmail(d.email);
  need(d.name.length >= 2, 'نام را وارد کن.');
  need(isEmail(email), 'ایمیل معتبر نیست.');
  need(strongPassword(d.password), 'رمز عبور باید حداقل ۸ نویسه و شامل حرف و عدد باشد.');
  need(b.consent_privacy === true || b.consent_privacy === 1, 'برای ثبت‌نام باید سیاست حریم خصوصی را بپذیری.');
  const phone = d.phone ? toEnDigits(d.phone).replace(/[^0-9+]/g, '').slice(0, 15) : null;
  if (await first(env, 'SELECT id FROM users WHERE email=?', email)) throw new HttpError(409, 'با این ایمیل قبلاً ثبت‌نام شده است.');

  let inviter = null;
  if (d.ref && s.referral_enabled !== '0') inviter = await first(env, "SELECT id FROM users WHERE referral_code=? AND status='active'", String(d.ref).trim().toUpperCase());

  const hash = await hashPassword(d.password);
  const code = await newReferralCode(env);
  const r = await run(env, 'INSERT INTO users (email, phone, name, password_hash, password_salt, role, referral_code, referred_by) VALUES (?,?,?,?,?,?,?,?)',
    email, phone, d.name, hash, '', 'student', code, inviter?.id ?? null);
  const uid = r.meta.last_row_id;
  await run(env, 'INSERT INTO user_profiles (user_id, consent_privacy) VALUES (?,1)', uid);

  let reward = null;
  if (inviter) {
    try {
      await run(env, 'INSERT INTO referrals (inviter_id, invitee_id) VALUES (?,?)', inviter.id, uid);
      const days = Number(s.referral_coupon_days || 180);
      const inv = Number(s.referral_invitee_percent || 5);
      const out = Number(s.referral_inviter_percent || 10);
      const max = Number(s.referral_max_rewards || 10);
      reward = { invitee_coupon: await makeCoupon(env, uid, inv, 'referral_invitee', days), percent: inv };
      const cnt = await first(env, "SELECT COUNT(*) n FROM coupons WHERE user_id=? AND kind='referral_inviter'", inviter.id);
      if ((cnt?.n || 0) < max) await makeCoupon(env, inviter.id, out, 'referral_inviter', days);
    } catch { /* دعوت تکراری/خطا نباید ثبت‌نام را خراب کند */ }
  }
  const token = await createSession(env, uid, ip);
  await audit(env, { ip, user: { id: uid } }, 'register', 'users', uid);
  return json({ token, user: { id: uid, name: d.name, email, role: 'student', referral_code: code }, reward }, 201);
}

export async function login(ctx) {
  const { env, ip } = ctx;
  const b = await ctx.body();
  const email = cleanEmail(b.email); const password = String(b.password || '');
  await rateLimit(env, `login-ip:${ip}`, 30, 600);
  await rateLimit(env, `login-em:${await sha256Hex(email)}`, 8, 600);
  const u = await first(env, 'SELECT * FROM users WHERE email=?', email);
  const ok = u ? await verifyPassword(password, u.password_hash) : (await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), false);
  if (!u || !ok) { await audit(env, { ip }, 'login_failed', 'users', null, email.slice(0, 80)); throw new HttpError(401, 'ایمیل یا رمز عبور درست نیست.'); }
  if (u.status !== 'active') throw new HttpError(403, 'این حساب مسدود شده است. با پشتیبانی تماس بگیر.');
  await run(env, "UPDATE users SET last_login_at=datetime('now') WHERE id=?", u.id);
  const token = await createSession(env, u.id, ip);
  await audit(env, { ip, user: u }, 'login', 'users', u.id);
  return json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, referral_code: u.referral_code } });
}

export async function logout(ctx) {
  const u = requireUser(ctx);
  await run(ctx.env, 'DELETE FROM sessions WHERE token_hash=?', await sha256Hex(u._token));
  return json({ ok: true });
}

export async function me(ctx) {
  const u = requireUser(ctx);
  const p = await first(ctx.env, 'SELECT grade, field_of_study, city, birth_year, favorite_lessons, goal_text, about, avatar_url, chosen_major_slug, chosen_job_slug FROM user_profiles WHERE user_id=?', u.id);
  const prov = await first(ctx.env, 'SELECT id, provider_type, status FROM providers WHERE user_id=?', u.id);
  const { _token, ...user } = u;
  return json({ user, profile: p || {}, provider: prov });
}

export async function updateProfile(ctx) {
  const u = requireUser(ctx);
  const b = await ctx.body();
  const d = cleanFields(b, { grade: 't', field_of_study: 't', city: 't', birth_year: 'i', favorite_lessons: 'x', goal_text: 'x', about: 'x', avatar_url: 'u', chosen_major_slug: 's', chosen_job_slug: 's' }, { partial: true });
  if (d.birth_year !== undefined && (d.birth_year < 1300 || d.birth_year > 1420)) throw new HttpError(400, 'سال تولد را شمسی و معتبر وارد کن (مثلاً ۱۳۸۷).');
  const keys = Object.keys(d);
  if (b.name !== undefined) { const nm = String(b.name).trim(); need(nm.length >= 2 && nm.length <= 100, 'نام معتبر نیست.'); await run(ctx.env, 'UPDATE users SET name=? WHERE id=?', nm, u.id); }
  if (keys.length) {
    await run(ctx.env, `UPDATE user_profiles SET ${keys.map(k => k + '=?').join(',')}, updated_at=datetime('now') WHERE user_id=?`, ...keys.map(k => d[k]), u.id);
  }
  return json({ ok: true });
}

export async function changePassword(ctx) {
  const u = requireUser(ctx);
  await rateLimit(ctx.env, `pw:${u.id}`, 6, 900);
  const b = await ctx.body();
  const row = await first(ctx.env, 'SELECT password_hash FROM users WHERE id=?', u.id);
  if (!(await verifyPassword(String(b.old_password || ''), row.password_hash))) throw new HttpError(400, 'رمز فعلی درست نیست.');
  need(strongPassword(b.new_password), 'رمز جدید باید حداقل ۸ نویسه و شامل حرف و عدد باشد.');
  await run(ctx.env, 'UPDATE users SET password_hash=? WHERE id=?', await hashPassword(b.new_password), u.id);
  await run(ctx.env, 'DELETE FROM sessions WHERE user_id=? AND token_hash!=?', u.id, await sha256Hex(u._token));
  await audit(ctx.env, ctx, 'change_password', 'users', u.id);
  return json({ ok: true });
}

export async function deleteAccount(ctx) {
  const u = requireUser(ctx);
  const b = await ctx.body();
  const row = await first(ctx.env, 'SELECT password_hash, role FROM users WHERE id=?', u.id);
  if (!(await verifyPassword(String(b.password || ''), row.password_hash))) throw new HttpError(400, 'رمز عبور درست نیست.');
  if (row.role === 'admin') throw new HttpError(400, 'حساب مدیر از این مسیر حذف نمی‌شود.');
  await audit(ctx.env, ctx, 'delete_account', 'users', u.id);
  await run(ctx.env, 'DELETE FROM users WHERE id=?', u.id);
  return json({ ok: true });
}

// ساخت اولین مدیر: فقط وقتی هیچ مدیری وجود ندارد و کلید SETUP_KEY درست است
export async function setupAdmin(ctx) {
  const { env, ip } = ctx;
  await rateLimit(env, `setup:${ip}`, 10, 3600);
  if (!env.SETUP_KEY) throw new HttpError(503, 'متغیر مخفی SETUP_KEY هنوز در Cloudflare ساخته نشده است.');
  const has = await first(env, "SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (has) throw new HttpError(403, 'مدیر قبلاً ساخته شده است. برای ورود از صفحه‌ی ورود استفاده کن.');
  const b = await ctx.body();
  const { safeEqual } = await import('../lib/crypto.js');
  if (!safeEqual(String(b.setup_key || ''), env.SETUP_KEY)) throw new HttpError(403, 'کلید راه‌اندازی درست نیست.');
  const d = cleanFields(b, { name: 't!', email: 't!', password: 't!' });
  const email = cleanEmail(d.email);
  need(isEmail(email), 'ایمیل معتبر نیست.');
  need(strongPassword(d.password), 'رمز عبور باید حداقل ۸ نویسه و شامل حرف و عدد باشد.');
  const code = await newReferralCode(env);
  const ex = await first(env, 'SELECT id FROM users WHERE email=?', email);
  let uid;
  if (ex) { uid = ex.id; await run(env, "UPDATE users SET role='admin', status='active', password_hash=? WHERE id=?", await hashPassword(d.password), uid); }
  else {
    const r = await run(env, 'INSERT INTO users (email, name, password_hash, password_salt, role, referral_code) VALUES (?,?,?,?,?,?)', email, d.name, await hashPassword(d.password), '', 'admin', code);
    uid = r.meta.last_row_id;
    await run(env, 'INSERT OR IGNORE INTO user_profiles (user_id, consent_privacy) VALUES (?,1)', uid);
  }
  await audit(env, { ip, user: { id: uid } }, 'setup_admin', 'users', uid);
  return json({ ok: true, message: 'مدیر ساخته شد. حالا وارد شو.' }, 201);
}

export async function referralInfo(ctx) {
  const u = requireUser(ctx);
  const s = await getSettings(ctx.env, true);
  const invited = await first(ctx.env, 'SELECT COUNT(*) n FROM referrals WHERE inviter_id=?', u.id);
  const coupons = await all(ctx.env, 'SELECT code, percent, kind, is_used, expires_at FROM coupons WHERE user_id=? ORDER BY id DESC LIMIT 50', u.id);
  return json({
    enabled: s.referral_enabled !== '0', code: u.referral_code, invited: invited?.n || 0, coupons,
    inviter_percent: Number(s.referral_inviter_percent || 10), invitee_percent: Number(s.referral_invitee_percent || 5),
    max_rewards: Number(s.referral_max_rewards || 10),
  });
}
export async function checkCoupon(ctx) {
  const u = requireUser(ctx);
  const s = await getSettings(ctx.env, true);
  const { pickCoupon } = await import('../services/common.js');
  const b = await ctx.body();
  const c = await pickCoupon(ctx.env, u, b.code, s);
  return json({ code: c.code, percent: c.effective });
}
