import { HttpError, json } from '../lib/http.js';
import { all, first, run, batch, prep, getSettings, parseJson, csv, tehranNow, tehranToday, addDays } from '../lib/db.js';
import { requireUser, requireRole, PROVIDER_ROLES } from '../lib/auth.js';
import { cleanFields, need, toEnDigits } from '../lib/validate.js';
import { rateLimit, audit } from '../lib/limits.js';
import { TRANSITIONS, STUDENT_CANCELLABLE, PROVIDER_ALLOWED, canTransition, userAge, isMinorProfile, pickCoupon, releaseRequestResources, activateRequest, ensureSlots, createProgramFromTemplate } from '../services/common.js';

const TYPE_TO_PROVIDER = { counseling: 'counselor', mentoring: 'mentor', coaching: 'coach', professional: 'professional' };

// ---------- ایجاد درخواست خدمت (پولی) ----------
export async function createRequest(ctx) {
  const u = requireUser(ctx); const env = ctx.env;
  await rateLimit(env, `req:${u.id}`, 10, 3600);
  const b = await ctx.body();
  const d = cleanFields(b, { service_type: 'e:counseling|mentoring|coaching|professional|package|group!', provider_id: 'i', mode: 'e:chat|phone|in_person|video', slot_id: 'i', package_id: 'i', group_program_id: 'i', note: 'x', coupon_code: 't' });
  // قانون: نمایش «این خدمت پولی است.» و تأیید آگاهانه‌ی کاربر
  need(b.accept_paid === true || b.accept_paid === 1, 'برای ادامه باید تأیید کنی که این خدمت پولی است.');
  const s = await getSettings(env);
  const profile = await first(env, 'SELECT birth_year, grade FROM user_profiles WHERE user_id=?', u.id);
  const age = await userAge(env, u.id); const minor = isMinorProfile(age, profile?.grade);
  if (minor) {
    need(b.parent_consent === true || b.parent_consent === 1, 'برای کاربران زیر ۱۸ سال، رضایت والدین لازم است.');
    if (d.mode) { const allowed = parseJson(s.minor_allowed_modes, ['chat', 'phone']); need(allowed.includes(d.mode), 'برای کاربران زیر ۱۸ سال این روش ارتباط مجاز نیست. گزینه‌ی چت یا تلفن را انتخاب کن.'); }
  }
  if (d.mode === 'video') need(s.video_enabled === '1', 'جلسه‌ی ویدیویی فعلاً فعال نیست.');

  let provider = null, price = 0, pkg = null, grp = null;
  if (d.service_type === 'package') {
    pkg = await first(env, 'SELECT * FROM coaching_packages WHERE id=? AND is_active=1', d.package_id || 0); need(pkg, 'بسته‌ی کوچینگ پیدا نشد.', 404);
    price = pkg.price;
    if (d.provider_id) { provider = await first(env, "SELECT * FROM providers WHERE id=? AND status='approved' AND provider_type='coach'", d.provider_id); need(provider, 'کوچ انتخاب‌شده پیدا نشد.', 404); }
  } else if (d.service_type === 'group') {
    grp = await first(env, "SELECT * FROM group_coaching_programs WHERE id=? AND status='open'", d.group_program_id || 0); need(grp, 'برنامه‌ی گروهی پیدا نشد یا بسته است.', 404);
    const cnt = await first(env, "SELECT COUNT(*) n FROM group_coaching_members WHERE program_id=? AND status IN ('pending','active')", grp.id);
    need((cnt?.n || 0) < grp.capacity, 'ظرفیت این برنامه تکمیل شده است.', 409);
    price = grp.price;
  } else {
    provider = await first(env, "SELECT * FROM providers WHERE id=? AND status='approved'", d.provider_id || 0); need(provider, 'فرد انتخاب‌شده پیدا نشد.', 404);
    need(provider.provider_type === TYPE_TO_PROVIDER[d.service_type], 'نوع خدمت با نوع این فرد سازگار نیست.');
    price = provider.price;
    need(d.mode, 'روش ارتباط را انتخاب کن.');
    const m = await first(env, 'SELECT id FROM provider_modes WHERE provider_id=? AND mode=? AND is_enabled=1', provider.id, d.mode); need(m, 'این روش ارتباط برای این فرد فعال نیست.');
    need(d.slot_id, 'یک زمان آزاد را انتخاب کن.');
  }
  const coupon = await pickCoupon(env, u, d.coupon_code, s);
  const discount = coupon ? Math.floor(price * coupon.effective / 100) : 0;
  const final = Math.max(0, price - discount);

  const ins = await run(env, 'INSERT INTO consultation_requests (user_id, provider_id, service_type, mode, slot_id, group_program_id, package_id, status, price, discount, final_amount, coupon_id, note, parent_consent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    u.id, provider?.id ?? null, d.service_type, d.mode || null, null, grp?.id ?? null, pkg?.id ?? null, 'requested', price, discount, final, coupon?.id ?? null, (d.note || '').slice(0, 2000) || null, minor ? 1 : 0);
  const rid = ins.meta.last_row_id;
  try {
    if (d.slot_id) {
      const slot = await first(env, 'SELECT * FROM availability_slots WHERE id=? AND provider_id=?', d.slot_id, provider.id);
      need(slot && slot.start_at > tehranNow(), 'این زمان معتبر نیست.');
      // جلوگیری از رزرو دوباره: به‌روزرسانی شرطی + کلید یکتای slot_id در جدول bookings
      const up = await run(env, 'UPDATE availability_slots SET is_booked=1 WHERE id=? AND is_booked=0', slot.id);
      if (!up.meta.changes) throw new HttpError(409, 'این زمان همین الان رزرو شد. زمان دیگری را انتخاب کن.');
      try { await run(env, "INSERT INTO bookings (request_id, slot_id, user_id, provider_id, status) VALUES (?,?,?,?,'held')", rid, slot.id, u.id, provider.id); }
      catch { await run(env, 'UPDATE availability_slots SET is_booked=0 WHERE id=?', slot.id); throw new HttpError(409, 'این زمان همین الان رزرو شد. زمان دیگری را انتخاب کن.'); }
      await run(env, 'UPDATE consultation_requests SET slot_id=? WHERE id=?', slot.id, rid);
    }
    if (grp) {
      try { await run(env, "INSERT INTO group_coaching_members (program_id, user_id, request_id, status) VALUES (?,?,?,'pending')", grp.id, u.id, rid); }
      catch { throw new HttpError(409, 'قبلاً برای این برنامه ثبت‌نام کرده‌ای.'); }
    }
    if (coupon) {
      const cu = await run(env, 'UPDATE coupons SET is_used=1, used_request_id=? WHERE id=? AND is_used=0', rid, coupon.id);
      if (!cu.meta.changes) throw new HttpError(400, 'این کد تخفیف همین الان استفاده شد.');
    }
    // requested -> pending_payment (پذیرش خودکار درخواست؛ ادمین/ارائه‌دهنده می‌تواند بعداً رد کند)
    await run(env, "UPDATE consultation_requests SET status='pending_payment', updated_at=datetime('now') WHERE id=?", rid);
  } catch (e) {
    const req = await first(env, 'SELECT * FROM consultation_requests WHERE id=?', rid);
    if (req) { await releaseRequestResources(env, { ...req, slot_id: req.slot_id }); await run(env, 'DELETE FROM consultation_requests WHERE id=?', rid); }
    throw e;
  }
  await audit(env, ctx, 'request_create', 'consultation_requests', rid, d.service_type);
  return json({ id: rid, status: 'pending_payment', price, discount, final_amount: final }, 201);
}

const REQ_SELECT = `SELECT r.id, r.service_type, r.mode, r.status, r.price, r.discount, r.final_amount, r.note, r.admin_note, r.created_at, r.provider_id, r.slot_id, r.package_id, r.group_program_id,
 p.name provider_name, p.provider_type, s.start_at, pk.title package_title, g.title group_title,
 (SELECT status FROM payments WHERE request_id=r.id ORDER BY id DESC LIMIT 1) payment_status, (SELECT admin_note FROM payments WHERE request_id=r.id ORDER BY id DESC LIMIT 1) payment_note
 FROM consultation_requests r LEFT JOIN providers p ON p.id=r.provider_id LEFT JOIN availability_slots s ON s.id=r.slot_id LEFT JOIN coaching_packages pk ON pk.id=r.package_id LEFT JOIN group_coaching_programs g ON g.id=r.group_program_id`;
export async function myRequests(ctx) { const u = requireUser(ctx); return json({ items: await all(ctx.env, `${REQ_SELECT} WHERE r.user_id=? ORDER BY r.id DESC LIMIT 100`, u.id) }); }
export async function myRequest(ctx) {
  const u = requireUser(ctx);
  const r = await first(ctx.env, `${REQ_SELECT} WHERE r.id=? AND r.user_id=?`, Number(ctx.params.id), u.id);
  if (!r) throw new HttpError(404, 'پیدا نشد.'); return json({ item: r });
}

export async function submitPayment(ctx) {
  const u = requireUser(ctx); const env = ctx.env; const id = Number(ctx.params.id);
  await rateLimit(env, `pay:${u.id}`, 10, 3600);
  const req = await first(env, 'SELECT * FROM consultation_requests WHERE id=? AND user_id=?', id, u.id);
  if (!req) throw new HttpError(404, 'پیدا نشد.');
  if (req.status !== 'pending_payment') throw new HttpError(409, 'این درخواست در مرحله‌ی پرداخت نیست.');
  const ps = await first(env, 'SELECT * FROM payment_settings WHERE id=1');
  const b = await ctx.body();
  const d = cleanFields(b, { amount: 'i!', tracking_code: 't!', receipt_url: 'u' });
  const tc = toEnDigits(d.tracking_code).replace(/\s+/g, '');
  need(/^[A-Za-z0-9\-]{4,40}$/.test(tc), 'شماره‌ی پیگیری معتبر نیست.');
  need(d.amount === req.final_amount, `مبلغ باید دقیقاً ${req.final_amount.toLocaleString('en-US')} تومان باشد.`);
  if (req.final_amount > 0) { need(d.amount >= ps.min_amount || req.final_amount < ps.min_amount, 'مبلغ کمتر از حداقل مجاز است.'); need(d.amount <= ps.max_amount, 'مبلغ بیشتر از حداکثر مجاز است.'); }
  if (ps.receipt_required) need(d.receipt_url, 'آدرس تصویر رسید را وارد کن.');
  if (await first(env, "SELECT id FROM payments WHERE tracking_code=? AND status!='rejected'", tc)) throw new HttpError(409, 'این شماره‌ی پیگیری قبلاً ثبت شده است.');
  await batch(env, [
    prep(env, 'INSERT INTO payments (request_id, user_id, amount, tracking_code, receipt_url) VALUES (?,?,?,?,?)', id, u.id, d.amount, tc, d.receipt_url || null),
    prep(env, "UPDATE consultation_requests SET status='payment_submitted', updated_at=datetime('now') WHERE id=? AND status='pending_payment'", id),
  ]);
  await audit(env, ctx, 'payment_submit', 'consultation_requests', id);
  return json({ ok: true, status: 'payment_submitted' }, 201);
}

export async function cancelRequest(ctx) {
  const u = requireUser(ctx); const env = ctx.env;
  const req = await first(env, 'SELECT * FROM consultation_requests WHERE id=? AND user_id=?', Number(ctx.params.id), u.id);
  if (!req) throw new HttpError(404, 'پیدا نشد.');
  if (!STUDENT_CANCELLABLE.includes(req.status)) throw new HttpError(409, 'پس از تأیید، لغو با هماهنگی پشتیبانی انجام می‌شود.');
  await releaseRequestResources(env, req);
  await run(env, "UPDATE consultation_requests SET status='cancelled', updated_at=datetime('now') WHERE id=?", req.id);
  await audit(env, ctx, 'request_cancel', 'consultation_requests', req.id);
  return json({ ok: true });
}

// ---------- عملیات ادمین روی درخواست/پرداخت ----------
export async function adminTransition(ctx) {
  requireRole(ctx, ['admin']);
  const id = Number(ctx.params.id); const b = await ctx.body();
  const req = await first(ctx.env, 'SELECT * FROM consultation_requests WHERE id=?', id);
  if (!req) throw new HttpError(404, 'پیدا نشد.');
  return json(await doTransition(ctx, req, String(b.to || ''), b.note));
}
export async function doTransition(ctx, req, to, note) {
  const env = ctx.env;
  if (!canTransition(req.status, to)) throw new HttpError(409, `از وضعیت «${req.status}» نمی‌شود به «${to}» رفت.`);
  if (['rejected', 'cancelled'].includes(to)) await releaseRequestResources(env, req);
  let final = to;
  if (to === 'approved') final = await activateRequest(env, req);
  if (to === 'active' && req.service_type === 'package') final = 'active';
  if (['approved', 'active'].includes(final) && req.slot_id) await run(env, "UPDATE bookings SET status='confirmed' WHERE request_id=?", req.id);
  if (to === 'completed' && req.slot_id) await run(env, "UPDATE bookings SET status='done' WHERE request_id=?", req.id);
  await run(env, "UPDATE consultation_requests SET status=?, admin_note=COALESCE(?, admin_note), updated_at=datetime('now') WHERE id=?", final, note ? String(note).slice(0, 500) : null, req.id);
  await audit(env, ctx, 'request_transition', 'consultation_requests', req.id, `${req.status}->${final}`);
  return { ok: true, status: final };
}
export async function reviewPayment(ctx) {
  requireRole(ctx, ['admin']);
  const env = ctx.env; const id = Number(ctx.params.id); const b = await ctx.body();
  const pay = await first(env, 'SELECT * FROM payments WHERE id=?', id);
  if (!pay) throw new HttpError(404, 'پیدا نشد.');
  if (pay.status !== 'pending') throw new HttpError(409, 'این پرداخت قبلاً بررسی شده است.');
  const req = await first(env, 'SELECT * FROM consultation_requests WHERE id=?', pay.request_id);
  const note = b.note ? String(b.note).slice(0, 500) : null;
  if (b.decision === 'approve') {
    await run(env, "UPDATE payments SET status='approved', admin_note=?, reviewed_at=datetime('now') WHERE id=?", note, id);
    const out = await doTransition(ctx, req, 'approved', note);
    return json({ ok: true, status: out.status });
  }
  if (b.decision === 'reject') {
    await run(env, "UPDATE payments SET status='rejected', admin_note=?, reviewed_at=datetime('now') WHERE id=?", note, id);
    await run(env, "UPDATE consultation_requests SET status='pending_payment', admin_note=?, updated_at=datetime('now') WHERE id=?", note, req.id); // امکان ثبت مجدد
    await audit(env, ctx, 'payment_reject', 'payments', id);
    return json({ ok: true, status: 'pending_payment' });
  }
  throw new HttpError(400, 'تصمیم نامعتبر است.');
}

// ---------- پنل ارائه‌دهنده (مشاور/کوچ/منتور/متخصص) ----------
async function myProvider(ctx) {
  const u = requireRole(ctx, [...PROVIDER_ROLES, 'admin']);
  const p = await first(ctx.env, 'SELECT * FROM providers WHERE user_id=?', u.id);
  if (!p) throw new HttpError(404, 'پروفایل ارائه‌دهنده‌ی تو هنوز ساخته نشده است.');
  if (p.status !== 'approved') throw new HttpError(403, 'پروفایل تو هنوز تأیید نشده است.');
  return p;
}
export async function providerApply(ctx) {
  const u = requireUser(ctx); await rateLimit(ctx.env, `papply:${u.id}`, 5, 86400);
  if (await first(ctx.env, 'SELECT id FROM providers WHERE user_id=?', u.id)) throw new HttpError(409, 'قبلاً درخواست داده‌ای.');
  const b = await ctx.body();
  const d = cleanFields(b, { provider_type: 'e:counselor|professional|mentor|coach!', name: 't!', photo_url: 'u', specialty: 't!', experience: 't', city: 't', description: 'x', coaching_model: 'x', coach_types: 't', background: 'x', documents_note: 'x', price: 'i!', duration_min: 'i' });
  need(d.price >= 0 && d.price <= 100000000, 'قیمت نامعتبر است.');
  const keys = Object.keys(d);
  const r = await run(ctx.env, `INSERT INTO providers (user_id, status${keys.map(k => ',' + k).join('')}) VALUES (?,?${keys.map(() => ',?').join('')})`, u.id, 'pending', ...keys.map(k => d[k]));
  const modes = Array.isArray(b.modes) ? b.modes.filter(m => ['chat', 'phone', 'in_person', 'video'].includes(m)) : ['chat'];
  for (const m of new Set(modes)) await run(ctx.env, 'INSERT OR IGNORE INTO provider_modes (provider_id, mode) VALUES (?,?)', r.meta.last_row_id, m);
  await audit(ctx.env, ctx, 'provider_apply', 'providers', r.meta.last_row_id);
  return json({ id: r.meta.last_row_id, status: 'pending' }, 201);
}
export async function providerMe(ctx) {
  const u = requireUser(ctx);
  const p = await first(ctx.env, 'SELECT * FROM providers WHERE user_id=?', u.id);
  if (!p) return json({ provider: null });
  const modes = await all(ctx.env, 'SELECT mode, is_enabled FROM provider_modes WHERE provider_id=?', p.id);
  const av = await all(ctx.env, 'SELECT id, weekday, start_time, end_time, slot_minutes FROM coach_availability WHERE provider_id=? ORDER BY weekday', p.id);
  const { admin_note, ...rest } = p; return json({ provider: rest, modes, availability: av, admin_note });
}
export async function providerUpdate(ctx) {
  const p = await myProvider(ctx); const b = await ctx.body();
  const d = cleanFields(b, { photo_url: 'u', specialty: 't', experience: 't', city: 't', description: 'x', coaching_model: 'x', coach_types: 't', background: 'x', price: 'i', duration_min: 'i' }, { partial: true });
  const ks = Object.keys(d); if (ks.length) await run(ctx.env, `UPDATE providers SET ${ks.map(k => k + '=?').join(',')} WHERE id=?`, ...ks.map(k => d[k]), p.id);
  if (Array.isArray(b.modes)) {
    await run(ctx.env, 'DELETE FROM provider_modes WHERE provider_id=?', p.id);
    for (const m of new Set(b.modes.filter(m => ['chat', 'phone', 'in_person', 'video'].includes(m)))) await run(ctx.env, 'INSERT OR IGNORE INTO provider_modes (provider_id, mode) VALUES (?,?)', p.id, m);
  }
  return json({ ok: true });
}
export async function providerSetAvailability(ctx) {
  const p = await myProvider(ctx); const b = await ctx.body();
  need(Array.isArray(b.items) && b.items.length <= 21, 'الگوی زمان نامعتبر است.');
  const rows = b.items.map(i => cleanFields(i, { weekday: 'i!', start_time: 't!', end_time: 't!', slot_minutes: 'i' }));
  for (const r of rows) { need(r.weekday >= 0 && r.weekday <= 6 && /^\d{2}:\d{2}$/.test(r.start_time) && /^\d{2}:\d{2}$/.test(r.end_time) && r.start_time < r.end_time, 'ساعت یا روز نامعتبر است.'); }
  const st = [prep(ctx.env, 'DELETE FROM coach_availability WHERE provider_id=?', p.id)];
  for (const r of rows) st.push(prep(ctx.env, 'INSERT INTO coach_availability (provider_id, weekday, start_time, end_time, slot_minutes) VALUES (?,?,?,?,?)', p.id, r.weekday, r.start_time, r.end_time, r.slot_minutes || p.duration_min || 45));
  await batch(ctx.env, st);
  await run(ctx.env, 'DELETE FROM availability_slots WHERE provider_id=? AND is_booked=0 AND start_at>?', p.id, tehranNow());
  const n = await ensureSlots(ctx.env, p.id, 14);
  return json({ ok: true, slots: n });
}
export async function providerSlots(ctx) {
  const p = await myProvider(ctx);
  return json({ items: await all(ctx.env, 'SELECT id, start_at, end_at, is_booked FROM availability_slots WHERE provider_id=? AND start_at>? ORDER BY start_at LIMIT 200', p.id, tehranNow()) });
}
export async function providerRequests(ctx) {
  const p = await myProvider(ctx);
  const rows = await all(ctx.env, `SELECT r.id, r.service_type, r.mode, r.status, r.final_amount, r.note, r.created_at, r.parent_consent, s.start_at, u.name user_name FROM consultation_requests r JOIN users u ON u.id=r.user_id LEFT JOIN availability_slots s ON s.id=r.slot_id WHERE r.provider_id=? ORDER BY r.id DESC LIMIT 100`, p.id);
  return json({ items: rows }); // اطلاعات تماس دانش‌آموز عمداً ارسال نمی‌شود (حریم خصوصی)
}
export async function providerTransition(ctx) {
  const p = await myProvider(ctx); const b = await ctx.body();
  const req = await first(ctx.env, 'SELECT * FROM consultation_requests WHERE id=? AND provider_id=?', Number(ctx.params.id), p.id);
  if (!req) throw new HttpError(404, 'پیدا نشد.');
  need((PROVIDER_ALLOWED[req.status] || []).includes(b.to), 'این تغییر وضعیت برای تو مجاز نیست.', 403);
  return json(await doTransition(ctx, req, b.to, b.note));
}
async function ownedProgram(ctx, id) {
  const p = await myProvider(ctx);
  const prog = await first(ctx.env, 'SELECT * FROM coaching_programs WHERE id=? AND coach_id=?', id, p.id);
  if (!prog) throw new HttpError(404, 'برنامه پیدا نشد.'); return { p, prog };
}
export async function providerPrograms(ctx) {
  const p = await myProvider(ctx);
  return json({ items: await all(ctx.env, 'SELECT c.id, c.title, c.coach_type, c.weeks, c.status, c.started_at, u.name user_name FROM coaching_programs c JOIN users u ON u.id=c.user_id WHERE c.coach_id=? ORDER BY c.id DESC', p.id) });
}
export async function providerProgram(ctx) {
  const id = Number(ctx.params.id); const { prog } = await ownedProgram(ctx, id);
  const [goals, actions, sessions, checkins, user] = await Promise.all([
    all(ctx.env, 'SELECT * FROM coaching_goals WHERE program_id=? ORDER BY week_no, id', id), all(ctx.env, 'SELECT * FROM coaching_actions WHERE program_id=? ORDER BY week_no, id', id),
    all(ctx.env, 'SELECT * FROM coaching_sessions WHERE program_id=? ORDER BY session_at DESC', id),
    all(ctx.env, 'SELECT * FROM coaching_checkins WHERE program_id=? ORDER BY id DESC LIMIT 30', id), first(ctx.env, 'SELECT name FROM users WHERE id=?', prog.user_id),
  ]);
  return json({ program: prog, student: user?.name, goals, actions, sessions, checkins });
}
export async function providerAddGoal(ctx) {
  const id = Number(ctx.params.id); await ownedProgram(ctx, id);
  const d = cleanFields(await ctx.body(), { title: 't!', week_no: 'i' });
  const r = await run(ctx.env, 'INSERT INTO coaching_goals (program_id, title, week_no) VALUES (?,?,?)', id, d.title, d.week_no || null); return json({ id: r.meta.last_row_id }, 201);
}
export async function providerAddAction(ctx) {
  const id = Number(ctx.params.id); await ownedProgram(ctx, id);
  const d = cleanFields(await ctx.body(), { title: 't!', week_no: 'i', goal_id: 'i' });
  if (d.goal_id) need(await first(ctx.env, 'SELECT id FROM coaching_goals WHERE id=? AND program_id=?', d.goal_id, id), 'هدف نامعتبر است.');
  const r = await run(ctx.env, 'INSERT INTO coaching_actions (program_id, goal_id, week_no, title) VALUES (?,?,?,?)', id, d.goal_id || null, d.week_no || null, d.title); return json({ id: r.meta.last_row_id }, 201);
}
export async function providerEditItem(ctx) {
  const kind = ctx.params.kind; const id = Number(ctx.params.id); const p = await myProvider(ctx);
  const t = { goals: 'coaching_goals', actions: 'coaching_actions' }[kind]; if (!t) throw new HttpError(404, 'پیدا نشد.');
  const spec = kind === 'goals' ? { title: 't', week_no: 'i', status: 'e:not_started|in_progress|completed|paused', progress: 'i' } : { title: 't', week_no: 'i' };
  const d = cleanFields(await ctx.body(), spec, { partial: true }); const ks = Object.keys(d); if (!ks.length) return json({ ok: true });
  const r = await run(ctx.env, `UPDATE ${t} SET ${ks.map(k => k + '=?').join(',')} WHERE id=? AND program_id IN (SELECT id FROM coaching_programs WHERE coach_id=?)`, ...ks.map(k => d[k]), id, p.id);
  if (!r.meta.changes) throw new HttpError(404, 'پیدا نشد.'); return json({ ok: true });
}
export async function providerDeleteItem(ctx) {
  const kind = ctx.params.kind; const id = Number(ctx.params.id); const p = await myProvider(ctx);
  const t = { goals: 'coaching_goals', actions: 'coaching_actions' }[kind]; if (!t) throw new HttpError(404, 'پیدا نشد.');
  await run(ctx.env, `DELETE FROM ${t} WHERE id=? AND program_id IN (SELECT id FROM coaching_programs WHERE coach_id=?)`, id, p.id); return json({ ok: true });
}
export async function providerAddSession(ctx) {
  const id = Number(ctx.params.id); const { p, prog } = await ownedProgram(ctx, id);
  const d = cleanFields(await ctx.body(), { session_at: 'd!', mode: 'e:chat|phone|in_person|video', duration_min: 'i', notes_shared: 'x', next_actions: 'x' });
  const r = await run(ctx.env, 'INSERT INTO coaching_sessions (program_id, request_id, coach_id, user_id, coach_type, duration_min, price, mode, session_at, notes_shared, next_actions) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, prog.request_id, p.id, prog.user_id, prog.coach_type, d.duration_min || p.duration_min, p.price, d.mode || 'chat', d.session_at, d.notes_shared || null, d.next_actions || null);
  return json({ id: r.meta.last_row_id }, 201);
}
export async function providerEditSession(ctx) {
  const p = await myProvider(ctx);
  const d = cleanFields(await ctx.body(), { session_at: 'd', status: 'e:scheduled|done|cancelled', notes_shared: 'x', next_actions: 'x' }, { partial: true });
  const ks = Object.keys(d); if (!ks.length) return json({ ok: true });
  const r = await run(ctx.env, `UPDATE coaching_sessions SET ${ks.map(k => k + '=?').join(',')} WHERE id=? AND coach_id=?`, ...ks.map(k => d[k]), Number(ctx.params.id), p.id);
  if (!r.meta.changes) throw new HttpError(404, 'پیدا نشد.'); return json({ ok: true });
}
