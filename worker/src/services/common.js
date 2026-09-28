import { HttpError } from '../lib/http.js';
import { all, first, run, prep, batch, getSettings, parseJson, csv, tehranNow, tehranToday, addDays, weekday, multiInsert, jalaliYearNow, qmarks } from '../lib/db.js';
import { randomCode } from '../lib/crypto.js';

export const SERVICE_TYPES = ['counseling', 'mentoring', 'coaching', 'professional', 'package', 'group'];
// ماشین وضعیت خدمات پولی: وضعیت فعلی -> وضعیت‌های مجاز بعدی
export const TRANSITIONS = {
  draft: ['requested', 'cancelled'],
  requested: ['pending_payment', 'rejected', 'cancelled'],
  pending_payment: ['payment_submitted', 'rejected', 'cancelled'],
  payment_submitted: ['approved', 'pending_payment', 'rejected', 'cancelled'],
  approved: ['active', 'completed', 'cancelled', 'paused'],
  active: ['completed', 'paused', 'cancelled'],
  paused: ['active', 'cancelled', 'completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};
export const STUDENT_CANCELLABLE = ['draft', 'requested', 'pending_payment', 'payment_submitted'];
export const PROVIDER_ALLOWED = { approved: ['active', 'completed'], active: ['completed', 'paused'], paused: ['active'] };

export function canTransition(from, to) { return (TRANSITIONS[from] || []).includes(to); }

export async function userAge(env, userId) {
  const p = await first(env, 'SELECT birth_year, grade FROM user_profiles WHERE user_id=?', userId);
  if (p?.birth_year) return jalaliYearNow() - p.birth_year;
  return null;
}
export function isMinorProfile(age, grade) {
  if (age !== null && age !== undefined) return age < 18;
  return ['هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'].includes(grade || '');
}

// ساخت زمان‌های آزاد از الگوی هفتگی (روز هفته: ۰=یکشنبه … ۶=شنبه)
export async function ensureSlots(env, providerId, days = 14) {
  const pats = await all(env, 'SELECT weekday, start_time, end_time, slot_minutes FROM coach_availability WHERE provider_id=?', providerId);
  if (!pats.length) return 0;
  const today = tehranToday(); const rows = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i); const wd = weekday(d);
    for (const p of pats.filter(x => x.weekday === wd)) {
      const step = Math.max(15, p.slot_minutes || 45);
      let [h, m] = p.start_time.split(':').map(Number); const [eh, em] = p.end_time.split(':').map(Number);
      let cur = h * 60 + m; const end = eh * 60 + em;
      while (cur + step <= end && rows.length < 400) {
        const f = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
        rows.push([providerId, `${d}T${f(cur)}`, `${d}T${f(cur + step)}`, 0]);
        cur += step;
      }
    }
  }
  if (rows.length) await batch(env, multiInsert(env, 'availability_slots', ['provider_id', 'start_at', 'end_at', 'is_booked'], rows, 'INSERT OR IGNORE'));
  return rows.length;
}

export async function pickCoupon(env, user, code, settings) {
  if (!code) return null;
  const c = await first(env, 'SELECT * FROM coupons WHERE code=?', String(code).trim().toUpperCase());
  if (!c || c.is_used) throw new HttpError(400, 'کد تخفیف معتبر نیست یا قبلاً استفاده شده است.');
  if (c.user_id && c.user_id !== user.id) throw new HttpError(400, 'این کد تخفیف برای حساب دیگری است.');
  if (c.expires_at && c.expires_at < tehranToday()) throw new HttpError(400, 'مهلت این کد تخفیف تمام شده است.');
  const max = Number(settings.max_discount_percent || 50);
  return { ...c, effective: Math.min(c.percent, max) };
}

export async function releaseRequestResources(env, req) {
  const st = [];
  if (req.slot_id) {
    st.push(prep(env, 'UPDATE availability_slots SET is_booked=0 WHERE id=?', req.slot_id));
    st.push(prep(env, 'DELETE FROM bookings WHERE request_id=?', req.id));
  }
  if (req.coupon_id) st.push(prep(env, 'UPDATE coupons SET is_used=0, used_request_id=NULL WHERE id=? AND used_request_id=?', req.coupon_id, req.id));
  if (req.group_program_id) st.push(prep(env, 'DELETE FROM group_coaching_members WHERE program_id=? AND user_id=? AND status!=\'active\'', req.group_program_id, req.user_id));
  await batch(env, st);
}

export async function createProgramFromTemplate(env, { userId, coachId, coachType, title, weeks, requestId }) {
  const s = await getSettings(env);
  const tpl = parseJson(s.coaching_templates, {});
  const steps = tpl[coachType] || tpl.goal || [];
  const total = Math.min(Math.max(weeks || steps.length || 8, 1), 26);
  const r = await run(env, 'INSERT INTO coaching_programs (user_id, coach_id, coach_type, title, weeks, status, request_id) VALUES (?,?,?,?,?,?,?)', userId, coachId || null, coachType, title, total, 'active', requestId || null);
  const pid = r.meta.last_row_id; const goals = [];
  for (let i = 0; i < Math.min(total, steps.length || total); i++) goals.push([pid, `هفته ${i + 1}: ${steps[i] || 'مرور و ادامه'}`, i + 1, 'not_started', 0]);
  if (goals.length) await batch(env, multiInsert(env, 'coaching_goals', ['program_id', 'title', 'week_no', 'status', 'progress'], goals));
  const g = await all(env, 'SELECT id, title, week_no FROM coaching_goals WHERE program_id=? ORDER BY week_no', pid);
  const acts = g.map(x => [pid, x.id, x.week_no, `انجام تمرین‌های ${x.title}`, 'pending']);
  if (acts.length) await batch(env, multiInsert(env, 'coaching_actions', ['program_id', 'goal_id', 'week_no', 'title', 'status'], acts));
  return pid;
}

export async function activateRequest(env, req) {
  // بعد از تأیید پرداخت: سرویس مناسب هر نوع درخواست فعال می‌شود
  if (req.service_type === 'package' && req.package_id) {
    const pk = await first(env, 'SELECT * FROM coaching_packages WHERE id=?', req.package_id);
    if (pk) {
      const exists = await first(env, 'SELECT id FROM coaching_programs WHERE request_id=?', req.id);
      if (!exists) await createProgramFromTemplate(env, { userId: req.user_id, coachId: req.provider_id, coachType: pk.coach_type, title: pk.title, weeks: pk.weeks, requestId: req.id });
    }
    return 'active';
  }
  if (req.service_type === 'group' && req.group_program_id) {
    await run(env, "UPDATE group_coaching_members SET status='active' WHERE program_id=? AND user_id=?", req.group_program_id, req.user_id);
    return 'active';
  }
  return 'approved';
}

export async function makeCoupon(env, userId, percent, kind, days) {
  for (let i = 0; i < 5; i++) {
    const code = 'MM-' + randomCode(7);
    const exp = addDays(tehranToday(), days);
    try { await run(env, 'INSERT INTO coupons (code, user_id, percent, kind, expires_at) VALUES (?,?,?,?,?)', code, userId, percent, kind, exp); return code; } catch { /* کد تکراری؛ دوباره */ }
  }
  return null;
}
export { qmarks };
