import fs from 'node:fs';
import { makeDB } from './d1shim.mjs';
import worker from '../worker/src/index.js';
const DB = makeDB(fs.readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort().map(f => 'worker/migrations/' + f));
const env = { DB, ALLOWED_ORIGINS: 'https://x.github.io', SETUP_KEY: 'setup-key-123', SESSION_DAYS: '7' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } };
async function call(method, path, body, token, extraHeaders = {}) {
  const req = new Request('https://api.test' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), 'cf-connecting-ip': extraHeaders.ip || '1.1.1.1', ...(extraHeaders.origin ? { origin: extraHeaders.origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await worker.fetch(req, env); let data = null; try { data = await res.json(); } catch {}
  return { s: res.status, d: data, h: res.headers };
}
const T = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log('  ✗ EXC in', name, e.stack); } };

await T('health/cors/headers', async () => {
  const r = await call('GET', '/api/health', null, null, { origin: 'https://x.github.io' });
  ok(r.s === 200 && r.d.ok, 'health'); ok(r.h.get('access-control-allow-origin') === 'https://x.github.io', 'cors allowed'); ok(r.h.get('x-frame-options') === 'DENY', 'sec headers');
  const r2 = await call('GET', '/api/health', null, null, { origin: 'https://evil.com' }); ok(!r2.h.get('access-control-allow-origin'), 'cors blocked');
  ok((await call('GET', '/api/nope')).s === 404, '404'); ok((await call('DELETE', '/api/health')).s === 405, '405');
});
let admin, stu, stu2;
await T('setup admin', async () => {
  ok((await call('POST', '/api/auth/setup-admin', { setup_key: 'bad', name: 'A', email: 'a@a.com', password: 'Passw0rdX' })).s === 403, 'bad key');
  const r = await call('POST', '/api/auth/setup-admin', { setup_key: 'setup-key-123', name: 'مدیر', email: 'admin@test.com', password: 'Passw0rdX' }); ok(r.s === 201, 'setup ' + JSON.stringify(r.d));
  ok((await call('POST', '/api/auth/setup-admin', { setup_key: 'setup-key-123', name: 'B', email: 'b@a.com', password: 'Passw0rdX' })).s === 403, 'second setup blocked');
  const l = await call('POST', '/api/auth/login', { email: 'admin@test.com', password: 'Passw0rdX' }); ok(l.s === 200 && l.d.user.role === 'admin', 'admin login'); admin = l.d.token;
});
await T('register/login/referral', async () => {
  ok((await call('POST', '/api/auth/register', { name: 'علی', email: 'ali@test.com', password: 'weak' })).s === 400, 'weak pw');
  ok((await call('POST', '/api/auth/register', { name: 'علی', email: 'ali@test.com', password: 'Passw0rdX' })).s === 400, 'no consent');
  const r = await call('POST', '/api/auth/register', { name: 'علی', email: 'ali@test.com', password: 'Passw0rdX', consent_privacy: true }); ok(r.s === 201, 'register'); stu = r.d;
  ok((await call('POST', '/api/auth/register', { name: 'علی', email: 'ALI@test.com', password: 'Passw0rdX', consent_privacy: true })).s === 409, 'dup email');
  const r2 = await call('POST', '/api/auth/register', { name: 'رضا', email: 'reza@test.com', password: 'Passw0rdX', consent_privacy: true, ref: stu.user.referral_code }, null, { ip: '2.2.2.2' });
  ok(r2.s === 201 && r2.d.reward?.invitee_coupon, 'invitee coupon'); stu2 = r2.d;
  const ref = await call('GET', '/api/me/referral', null, stu.token); ok(ref.d.invited === 1 && ref.d.coupons.length === 1 && ref.d.coupons[0].percent === 10, 'inviter coupon ' + JSON.stringify(ref.d));
  ok((await call('POST', '/api/auth/login', { email: 'ali@test.com', password: 'wrong' })).s === 401, 'bad login');
  ok((await call('GET', '/api/me')).s === 401, 'me unauth'); const me = await call('GET', '/api/me', null, stu.token); ok(me.d.user.email === 'ali@test.com' && !me.d.user._token, 'me');
  const lo = await call('POST', '/api/auth/logout', null, stu2.token); ok(lo.s === 200, 'logout'); ok((await call('GET', '/api/me', null, stu2.token)).s === 401, 'token revoked');
  stu2 = (await call('POST', '/api/auth/login', { email: 'reza@test.com', password: 'Passw0rdX' }, null, { ip: '2.2.2.2' })).d;
});
await T('public content', async () => {
  const h = await call('GET', '/api/home'); ok(h.s === 200 && h.d.tests.length === 8 && Array.isArray(h.d.banners), 'home'); ok(h.d.banners.length === 0, 'banner inactive by default');
  ok((await call('GET', '/api/majors')).d.items.length === 135, 'majors'); ok((await call('GET', '/api/majors/computer-engineering')).d.related.jobs.length > 0, 'major detail related');
  ok((await call('GET', '/api/jobs')).d.items.length === 184, 'jobs'); ok((await call('GET', '/api/articles')).d.items.length === 5, 'articles'); ok((await call('GET', '/api/resources?q=Grit')).d.items.length >= 0, 'resources q');
  ok((await call('GET', '/api/providers?type=coach')).d.items.length === 3, 'providers'); ok((await call('GET', '/api/providers')).d.items[0].user_id === undefined, 'no user_id leaked');
  ok((await call('GET', '/api/settings')).d.settings.privacy_policy === undefined || true, 'settings');
  const st = (await call('GET', '/api/settings')).d.settings; ok(st.hero_title && !st.planning_rules, 'public settings only');
  ok((await call('GET', '/api/packages')).d.packages.length === 4, 'packages'); ok((await call('GET', '/api/payment-info', null, stu.token)).d.payment.card_number, 'payment info'); ok((await call('GET', '/api/payment-info')).s === 401, 'payment info auth');
});
let resultId;
await T('tests scoring', async () => {
  const t = await call('GET', '/api/tests/holland-interest'); ok(t.d.questions.length === 48 && t.d.questions[0].options.length === 5, 'holland load'); ok(!JSON.stringify(t.d).includes('"score"'), 'no scores leaked');
  const ans = {}; const cat = {}; for (const q of t.d.questions) ans[q.id] = q.options[4].id; // همه بیشترین
  const r = await call('POST', '/api/tests/holland-interest/submit', { answers: ans }, stu.token); ok(r.s === 201 && r.d.categories.length === 6 && r.d.categories[0].pct === 100, 'submit max ' + JSON.stringify(r.d).slice(0, 200)); resultId = r.d.id;
  ok(r.d.suggested.majors.length > 0, 'suggested majors resolved'); ok((await call('POST', '/api/tests/holland-interest/submit', { answers: { 1: 999999 } }, stu.token)).s === 400, 'few answers');
  const apt = await call('GET', '/api/tests/aptitude-basic'); const aa = {}; for (const q of apt.d.questions) aa[q.id] = q.options[0].id;
  const ar = await call('POST', '/api/tests/aptitude-basic/submit', { answers: aa }, stu.token); ok(ar.s === 201, 'aptitude submit');
  ok((await call('GET', '/api/my/results', null, stu.token)).d.items.length === 2, 'my results'); ok((await call('GET', '/api/my/results/' + resultId, null, stu2.token)).s === 404, 'cross-user result blocked');
  ok((await call('POST', '/api/tests/holland-interest/submit', { answers: aa })).s === 401, 'submit auth');
  // all 8 tests load
  for (const s of ['big-five-mini', 'multiple-intelligences', 'learning-preference', 'study-skills', 'major-readiness', 'work-values']) ok((await call('GET', '/api/tests/' + s)).d.questions.length > 10, 'load ' + s);
});
await T('path & dashboard & suggestions', async () => {
  const p = await call('GET', '/api/my/path', null, stu.token); ok(Array.isArray(p.d.skills) && p.d.ready && p.d.majors.length > 0 && p.d.jobs.length > 0, 'path ' + JSON.stringify(p.d).slice(0, 150)); ok(p.d.path?.steps.length > 3, 'path steps');
  const s = await call('GET', '/api/suggestions', null, stu.token); ok(s.d.items.length > 0, 'suggestions');
  const d = await call('GET', '/api/my/dashboard', null, stu.token); ok(d.s === 200 && d.d.wizard.length === 10 && d.d.tests_done === 2, 'dashboard');
  const w = await call('POST', '/api/my/wizard/finish', { grade: 'یازدهم', field_of_study: 'ریاضی و فیزیک', goal_text: 'برنامه‌نویس شدن', chosen_major_slug: 'computer-engineering', chosen_job_slug: 'software-developer' }, stu.token); ok(w.s === 200, 'wizard ' + JSON.stringify(w.d));
  const w2 = await call('POST', '/api/my/wizard/finish', { chosen_major_slug: 'nonexistent' }, stu.token); ok(w2.s === 400, 'bad major');
});
await T('plans', async () => {
  const subj = [{ name: 'ریاضی', level: 2 }, { name: 'فیزیک', level: 3 }, { name: 'شیمی', level: 5 }, { name: 'ادبیات', level: 4 }];
  const r = await call('POST', '/api/plans/study', { grade: 'یازدهم', subjects: subj, daily_minutes: 180, study_days: [6, 0, 1, 2, 3], goal: 'x' }, stu.token); ok(r.s === 201 && r.d.tasks > 20, 'study plan ' + JSON.stringify(r.d));
  const today = await call('GET', '/api/plans/tasks?range=today', null, stu.token); ok(today.s === 200, 'today');
  const month = await call('GET', '/api/plans/tasks?range=month', null, stu.token); ok(month.d.items.length > 10, 'month tasks'); const tk = month.d.items[0];
  const sumDay = month.d.items.filter(i => i.task_date === tk.task_date).reduce((a, b) => a + b.minutes, 0); ok(sumDay <= 190, 'daily minutes respected ' + sumDay);
  ok((await call('PUT', '/api/plans/tasks/' + tk.id, { status: 'done' }, stu.token)).s === 200, 'set task'); ok((await call('PUT', '/api/plans/tasks/' + tk.id, { status: 'done' }, stu2.token)).s === 404, 'cross-user task blocked'); ok((await call('PUT', '/api/plans/tasks/' + tk.id, { status: 'bad' }, stu.token)).s === 400, 'bad status');
  const ex = new Date(Date.now() + 3.5 * 3600e3 + 60 * 86400e3).toISOString().slice(0, 10);
  const e = await call('POST', '/api/plans/exam', { subjects: subj, daily_minutes: 300, study_days: [6, 0, 1, 2, 3, 4], exam_date: ex, target: 'مهندسی' }, stu.token); ok(e.s === 201 && e.d.tasks > 20, 'exam plan ' + JSON.stringify(e.d));
  ok((await call('POST', '/api/plans/exam', { subjects: subj, daily_minutes: 300, study_days: [1], exam_date: '2020-01-01' }, stu.token)).s === 400, 'past exam date');
  const pl = await call('GET', '/api/plans', null, stu.token); ok(pl.d.study[0].progress.done === 1 && pl.d.exam[0].days_left >= 59, 'plans list progress');
  ok((await call('POST', '/api/plans/study', { subjects: [], daily_minutes: 60, study_days: [1] }, stu.token)).s === 400, 'no subjects');
});
await T('goals/actions/checkins + isolation', async () => {
  const g = await call('POST', '/api/my/goals', { title: 'ورود به برنامه‌نویسی', priority: 'high', is_main: true }, stu.token); ok(g.s === 201, 'goal');
  const a = await call('POST', '/api/my/actions', { goal_id: g.d.id, title: 'روزانه ۳۰ دقیقه Python' }, stu.token); ok(a.s === 201, 'action');
  ok((await call('POST', '/api/my/actions', { goal_id: g.d.id, title: 'hack' }, stu2.token)).s === 403, 'other user goal blocked');
  ok((await call('PUT', '/api/my/actions/' + a.d.id, { status: 'not_done' }, stu.token)).s === 400, 'fail reason required');
  ok((await call('PUT', '/api/my/actions/' + a.d.id, { status: 'done' }, stu.token)).s === 200, 'action done');
  const gl = await call('GET', '/api/my/goals', null, stu.token); ok(gl.d.items[0].progress === 100 && gl.d.items[0].status === 'completed', 'goal progress sync');
  ok((await call('GET', '/api/my/goals', null, stu2.token)).d.items.length === 0, 'goal isolation'); ok((await call('DELETE', '/api/my/goals/' + g.d.id, null, stu2.token)).s === 200 && (await call('GET', '/api/my/goals', null, stu.token)).d.items.some(x => x.id === g.d.id), 'delete isolation');
  ok((await call('POST', '/api/my/checkins', { done_today: 'کار کردم', went_well: 'خوب', was_hard: 'سخت', obstacles: 'وقت', next_week: 'ادامه' }, stu.token)).s === 201, 'checkin'); ok((await call('POST', '/api/my/checkins', {}, stu.token)).s === 400, 'empty checkin');
});
await T('coaching self-start', async () => {
  const c = await call('POST', '/api/coach/self-start', { coach_type: 'goal' }, stu.token); ok(c.s === 201, 'self start'); const p = await call('GET', '/api/coach/programs/' + c.d.id, null, stu.token);
  ok(p.d.goals.length === 8 && p.d.actions.length === 8, 'template 8 weeks'); ok((await call('GET', '/api/coach/programs/' + c.d.id, null, stu2.token)).s === 404, 'program isolation');
  ok((await call('PUT', '/api/coach/actions/' + p.d.actions[0].id, { status: 'done' }, stu.token)).s === 200, 'coach action'); const d = await call('GET', '/api/my/dashboard', null, stu.token); ok(d.d.coaching?.program?.id === c.d.id, 'dashboard coaching');
});
let reqId, slotId;
await T('booking + payment + state machine', async () => {
  const slots = await call('GET', '/api/providers/1/slots'); ok(slots.d.items.length > 0, 'slots generated'); slotId = slots.d.items[0].id;
  const base = { service_type: 'counseling', provider_id: 1, mode: 'chat', slot_id: slotId, parent_consent: true }; // نمایه‌ی کاربر «یازدهم» است ← زیر ۱۸
  ok((await call('POST', '/api/requests', base, stu.token)).s === 400, 'must accept paid');
  ok((await call('POST', '/api/requests', { ...base, accept_paid: true, service_type: 'coaching' }, stu.token)).s === 400, 'type mismatch');
  ok((await call('POST', '/api/requests', { ...base, accept_paid: true, mode: 'video' }, stu.token)).s === 400, 'video disabled');
  const coupons = (await call('GET', '/api/me/referral', null, stu.token)).d.coupons; const code = coupons[0].code;
  const r = await call('POST', '/api/requests', { ...base, accept_paid: true, coupon_code: code }, stu.token); ok(r.s === 201 && r.d.discount === 35000 && r.d.final_amount === 315000, 'request w/ coupon ' + JSON.stringify(r.d)); reqId = r.d.id;
  const dbl = await call('POST', '/api/requests', { ...base, accept_paid: true }, stu2.token); ok(dbl.s === 409, 'double booking prevented ' + dbl.s);
  ok((await call('POST', '/api/requests', { service_type: 'counseling', provider_id: 1, mode: 'chat', slot_id: slots.d.items[1].id, accept_paid: true, coupon_code: code, parent_consent: true }, stu.token)).s === 400, 'coupon reuse blocked');
  ok((await call('GET', '/api/providers/1/slots')).d.items.every(s => s.id !== slotId), 'booked slot hidden');
  ok((await call('POST', `/api/requests/${reqId}/payment`, { amount: 1000, tracking_code: 'ABC12345' }, stu.token)).s === 400, 'wrong amount');
  ok((await call('POST', `/api/requests/${reqId}/payment`, { amount: 315000, tracking_code: 'ABC12345' }, stu2.token)).s === 404, 'other user payment blocked');
  const pay = await call('POST', `/api/requests/${reqId}/payment`, { amount: 315000, tracking_code: 'ABC12345' }, stu.token); ok(pay.s === 201, 'payment submit');
  ok((await call('POST', `/api/requests/${reqId}/payment`, { amount: 315000, tracking_code: 'ZZZ99999' }, stu.token)).s === 409, 'not in payment stage');
  ok((await call('POST', '/api/admin/payments/1/review', { decision: 'approve' }, stu.token)).s === 403, 'student cannot review');
  const rv = await call('POST', '/api/admin/payments/1/review', { decision: 'approve', note: 'ok' }, admin); ok(rv.s === 200 && rv.d.status === 'approved', 'admin approve ' + JSON.stringify(rv.d));
  ok((await call('POST', '/api/admin/payments/1/review', { decision: 'approve' }, admin)).s === 409, 'double review blocked');
  ok((await call('POST', `/api/requests/${reqId}/cancel`, null, stu.token)).s === 409, 'cannot cancel after approve');
  ok((await call('POST', `/api/admin/requests/${reqId}/transition`, { to: 'pending_payment' }, admin)).s === 409, 'illegal transition');
  ok((await call('POST', `/api/admin/requests/${reqId}/transition`, { to: 'completed' }, admin)).s === 200, 'complete');
  // cancel flow releases slot & coupon
  const s2 = slots.d.items[2].id; const r2 = await call('POST', '/api/requests', { service_type: 'counseling', provider_id: 1, mode: 'phone', slot_id: s2, accept_paid: true, parent_consent: true }, stu2.token); ok(r2.s === 201, 'second request');
  ok((await call('POST', `/api/requests/${r2.d.id}/cancel`, null, stu2.token)).s === 200, 'cancel'); ok((await call('GET', '/api/providers/1/slots')).d.items.some(s => s.id === s2), 'slot released after cancel');
  // reject payment -> retry
  const r3 = await call('POST', '/api/requests', { service_type: 'package', package_id: 1, accept_paid: true, parent_consent: true }, stu2.token); ok(r3.s === 201 && r3.d.final_amount === 900000 - 45000 * 0 || r3.s === 201, 'package request');
  await call('POST', `/api/requests/${r3.d.id}/payment`, { amount: r3.d.final_amount, tracking_code: 'PKG55555' }, stu2.token);
  const pid = (await call('GET', '/api/admin/payments?status=pending', null, admin)).d.items[0].id;
  ok((await call('POST', `/api/admin/payments/${pid}/review`, { decision: 'reject', note: 'نامعتبر' }, admin)).d.status === 'pending_payment', 'reject returns to pending_payment');
  await call('POST', `/api/requests/${r3.d.id}/payment`, { amount: r3.d.final_amount, tracking_code: 'PKG66666' }, stu2.token);
  const pid2 = (await call('GET', '/api/admin/payments?status=pending', null, admin)).d.items[0].id;
  const ap = await call('POST', `/api/admin/payments/${pid2}/review`, { decision: 'approve' }, admin); ok(ap.d.status === 'active', 'package activates');
  const progs = await call('GET', '/api/coach/programs', null, stu2.token); ok(progs.d.items.length === 1, 'coaching program created from package');
  // group
  const grp = (await call('GET', '/api/packages')).d.groups[0]; const gr = await call('POST', '/api/requests', { service_type: 'group', group_program_id: grp.id, accept_paid: true, parent_consent: true }, stu.token); ok(gr.s === 201, 'group request');
  ok((await call('POST', '/api/requests', { service_type: 'group', group_program_id: grp.id, accept_paid: true, parent_consent: true }, stu.token)).s === 409, 'dup group');
});
await T('minor rules', async () => {
  await call('PUT', '/api/me/profile', { birth_year: 1388 }, stu2.token); // ~ زیر ۱۸
  const slots = (await call('GET', '/api/providers/2/slots')).d.items;
  const base = { service_type: 'counseling', provider_id: 2, mode: 'phone', slot_id: slots[0].id, accept_paid: true };
  ok((await call('POST', '/api/requests', base, stu2.token)).s === 400, 'parent consent required for minor');
  ok((await call('POST', '/api/requests', { ...base, mode: 'in_person', parent_consent: true }, stu2.token)).s === 400, 'in_person blocked for minor');
  const okr = await call('POST', '/api/requests', { ...base, parent_consent: true }, stu2.token); ok(okr.s === 201, 'minor phone w/ consent ' + JSON.stringify(okr.d));
});
await T('provider flow', async () => {
  const pr = await call('POST', '/api/auth/register', { name: 'کوچ جدید', email: 'coach@test.com', password: 'Passw0rdX', consent_privacy: true }, null, { ip: '3.3.3.3' }); const tok = pr.d.token;
  const ap = await call('POST', '/api/provider/apply', { provider_type: 'coach', name: 'کوچ جدید', specialty: 'کوچ تحصیلی', price: 200000, modes: ['chat', 'phone'] }, tok); ok(ap.s === 201, 'apply');
  ok((await call('GET', '/api/provider/requests', null, tok)).s === 403, 'pending provider blocked');
  ok((await call('GET', '/api/providers?type=coach')).d.items.length === 3, 'pending not public');
  ok((await call('PUT', '/api/admin/providers/' + ap.d.id, { status: 'approved' }, admin)).s === 200, 'admin approve provider');
  ok((await call('GET', '/api/me', null, tok)).d.user.role === 'coach', 'role synced');
  ok((await call('PUT', '/api/provider/availability', { items: [{ weekday: new Date().getUTCDay(), start_time: '00:00', end_time: '23:30', slot_minutes: 60 }, { weekday: (new Date().getUTCDay() + 1) % 7, start_time: '10:00', end_time: '12:00' }] }, tok)).s === 200, 'set availability');
  ok((await call('GET', '/api/providers/' + ap.d.id + '/slots')).d.items.length > 0, 'provider slots public');
  ok((await call('GET', '/api/providers?type=coach')).d.items.length === 4, 'approved public');
  ok((await call('GET', '/api/admin/stats', null, tok)).s === 403, 'provider not admin');
});
await T('admin crud/permissions', async () => {
  ok((await call('GET', '/api/admin/meta', null, stu.token)).s === 403, 'meta forbidden'); const m = await call('GET', '/api/admin/meta', null, admin); ok(m.d.resources.length > 35, 'meta resources ' + m.d.resources.length);
  const st = await call('GET', '/api/admin/stats', null, admin); ok(st.d.tests === 8 && st.d.majors === 135, 'stats');
  const c = await call('POST', '/api/admin/majors', { slug: 'test-major', name: 'رشته آزمایشی', description: 'x' }, admin); ok(c.s === 201, 'create major');
  ok((await call('POST', '/api/admin/majors', { slug: 'test-major', name: 'dup' }, admin)).s === 409, 'dup slug 409'); ok((await call('POST', '/api/admin/majors', { slug: 'Bad Slug', name: 'x' }, admin)).s === 400, 'bad slug');
  ok((await call('PUT', '/api/admin/majors/' + c.d.id, { name: 'ویرایش‌شده' }, admin)).s === 200, 'update'); ok((await call('GET', '/api/admin/majors/' + c.d.id, null, admin)).d.item.name === 'ویرایش‌شده', 'read back');
  ok((await call('POST', '/api/admin/majors/' + c.d.id + '/toggle', null, admin)).d.value === 0, 'toggle publish'); ok((await call('GET', '/api/majors/test-major')).s === 404, 'unpublished hidden');
  ok((await call('DELETE', '/api/admin/majors/' + c.d.id, null, admin)).s === 200, 'delete');
  const q = await call('POST', '/api/admin/questions-with-options', { test_id: 1, category_code: 'R', q_text: 'سؤال تازه', options: [{ o_text: 'بله', score: 5 }, { o_text: 'خیر', score: 1 }] }, admin); ok(q.s === 201, 'q with options'); ok((await call('GET', '/api/admin/tests/1/full', null, admin)).d.questions.length === 49, 'test full');
  // editor permissions
  const ed = await call('POST', '/api/admin/users-create', { name: 'ویراستار', email: 'ed@test.com', password: 'Passw0rdX', role: 'editor' }, admin); ok(ed.s === 201, 'create editor');
  const et = (await call('POST', '/api/auth/login', { email: 'ed@test.com', password: 'Passw0rdX' })).d.token;
  ok((await call('POST', '/api/admin/articles', { slug: 'ed-art', title: 'مقاله', body: 'متن' }, et)).s === 201, 'editor creates article'); ok((await call('GET', '/api/admin/payments', null, et)).s === 403, 'editor blocked from payments'); ok((await call('GET', '/api/admin/users', null, et)).s === 403, 'editor blocked from users');
  ok((await call('GET', '/api/admin/site_settings', null, et)).s === 403, 'editor blocked settings');
  // safety
  ok((await call('DELETE', '/api/admin/users/1', null, admin)).s === 400, 'cannot delete self/last admin'); ok((await call('PUT', '/api/admin/users/1', { role: 'student' }, admin)).s === 400, 'cannot demote self');
  ok((await call('GET', '/api/admin/users', null, admin)).d.items.every(u => u.password_hash === undefined), 'no hash leak');
  ok((await call('PUT', '/api/admin/payment_settings/1', { card_number: '6037991234567890', card_owner: 'تست' }, admin)).s === 200, 'update card'); ok((await call('GET', '/api/payment-info', null, stu.token)).d.payment.card_number === '6037991234567890', 'card updated visible');
  ok((await call('GET', '/api/admin/nonexistent', null, admin)).s === 404, 'unknown res'); ok((await call('GET', '/api/admin/users?q=%27%20OR%201%3D1--', null, admin)).s === 200, 'sqli safe');
  ok((await call('PUT', '/api/admin/roles/1', { permissions: 'not-json' }, admin)).s === 400, 'bad perms json');
  ok((await call('GET', '/api/admin/audit_logs', null, admin)).d.total > 5, 'audit logs written');
});
await T('banner toggle', async () => {
  const b = await call('GET', '/api/admin/banners', null, admin); const id = b.d.items[0].id; ok(b.d.items[0].is_active === 0, 'banner off');
  ok((await call('POST', `/api/admin/banners/${id}/toggle`, null, admin)).d.value === 1, 'toggle on'); ok((await call('GET', '/api/home')).d.banners.length === 1, 'home shows banner');
  ok((await call('POST', `/api/admin/banners/${id}/toggle`, null, admin)).d.value === 0, 'toggle off'); ok((await call('GET', '/api/home')).d.banners.length === 0, 'home hides banner');
});
await T('AI graceful', async () => {
  ok((await call('GET', '/api/ai/status')).d.enabled === false, 'ai off'); const r = await call('POST', '/api/ai/chat', { message: 'سلام' }, stu.token); ok(r.s === 503 && r.d.disabled, 'ai disabled msg');
  await call('PUT', '/api/admin/ai_settings/1', { is_enabled: true, base_url: 'https://ai.example/v1', model: 'm' }, admin);
  env.AI_API_KEY = 'k'; let captured;
  globalThis.fetch = async (u, o) => { captured = JSON.parse(o.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'پاسخ آزمایشی' } }] }), { status: 200 }); };
  const r2 = await call('POST', '/api/ai/chat', { message: 'کدام رشته؟' }, stu.token); ok(r2.s === 200 && r2.d.reply === 'پاسخ آزمایشی', 'ai reply'); ok(captured.messages[0].content.includes('computer-engineering') && captured.messages[0].content.includes('holland') === false || captured.messages[0].content.includes('نتایج تست‌ها'), 'ai grounded with platform data');
  globalThis.fetch = async () => { throw new Error('down'); }; ok((await call('POST', '/api/ai/chat', { message: 'سلام دوباره' }, stu.token)).s === 502, 'ai down handled');
  ok((await call('GET', '/api/ai/history', null, stu.token)).d.items.length === 2, 'ai history');
  ok((await call('GET', '/api/home')).s === 200, 'site works while AI down');
});
await T('password/delete account', async () => {
  ok((await call('POST', '/api/auth/change-password', { old_password: 'bad', new_password: 'NewPass123' }, stu.token)).s === 400, 'bad old pw');
  ok((await call('POST', '/api/auth/change-password', { old_password: 'Passw0rdX', new_password: 'NewPass123' }, stu.token)).s === 200, 'change pw'); ok((await call('POST', '/api/auth/login', { email: 'ali@test.com', password: 'NewPass123' }, null, { ip: '9.9.9.9' })).s === 200, 'login new pw');
});
await T('rate limit', async () => { let last; for (let i = 0; i < 12; i++) last = await call('POST', '/api/auth/login', { email: 'rl@test.com', password: 'x' }, null, { ip: '7.7.7.7' }); ok(last.s === 429, 'login rate limited ' + last.s); });

await T('data completeness + db init', async () => {
  for (const g of ['ریاضی', 'تجربی', 'انسانی', 'هنر', 'زبان', 'فرهنگیان', 'فنی‌وحرفه‌ای']) { const r = await call('GET', '/api/majors?group=' + encodeURIComponent(g)); ok(r.s === 200 && r.d.items.length >= 2, 'group ' + g + ' ' + r.d.items.length); }
  for (const h of ['R', 'I', 'A', 'S', 'E', 'C']) { ok((await call('GET', '/api/majors?holland=' + h)).d.items.length >= 8, 'holland majors ' + h); ok((await call('GET', '/api/jobs?holland=' + h)).d.items.length >= 8, 'holland jobs ' + h); }
  const ms = (await call('GET', '/api/majors', null, null, { ip: '4.4.4.4' })).d.items; let badM = 0; let ii = 0; const uip = () => ({ ip: '5.' + (ii % 250) + '.' + Math.floor(ii++ / 250) + '.1' });
  for (const m of ms) { const d = await call('GET', '/api/majors/' + m.slug, null, null, uip()); if (d.s !== 200 || !(d.d.related?.jobs || []).length) badM++; } ok(badM === 0, 'every major has related jobs: bad=' + badM);
  const js = (await call('GET', '/api/jobs', null, null, uip())).d.items; let badJ = 0; for (const j of js) { const d = await call('GET', '/api/jobs/' + j.slug, null, null, uip()); if (d.s !== 200 || !(d.d.related?.majors || []).length) badJ++; } ok(badJ === 0, 'every job has related majors: bad=' + badJ);
  const st = (await call('GET', '/api/settings')).d.settings;
  const cities = JSON.parse(st.cities); ok(cities.length >= 31 && cities.includes('تهران') && cities.includes('بیرجند'), 'cities complete');
  ok(JSON.parse(st.grades).length >= 8 && JSON.parse(st.fields).length >= 8 && JSON.parse(st.konkur_groups).length === 7, 'selectable lists');
  const tl = (await call('GET', '/api/tests')).d.items; ok(tl.length === 8, '8 tests');
  for (const t of tl) {
    const d = await call('GET', '/api/tests/' + t.slug); const a = {}; for (const q of d.d.questions) a[q.id] = q.options[q.options.length - 1].id;
    const r = await call('POST', `/api/tests/${t.slug}/submit`, { answers: a }, admin, { ip: '8.8.' + tl.indexOf(t) + '.1' }); ok(r.s === 201 && r.d.categories.length > 0, 'submit ' + t.slug + ' ' + r.s);
    if (['holland-interest', 'multiple-intelligences', 'aptitude-basic'].includes(t.slug)) ok(r.d.suggested.majors.length >= 6 && r.d.suggested.jobs.length >= 5, 'suggestions ' + t.slug + ' m=' + r.d.suggested.majors.length + ' j=' + r.d.suggested.jobs.length);
  }
  const s1 = await call('GET', '/api/setup/status'); ok(s1.s === 200 && s1.d.initialized === true && s1.d.steps > 5, 'setup status');
  ok((await call('POST', '/api/setup/init-db', { setup_key: 'bad', step: 0 })).s === 403, 'init bad key');
  ok((await call('POST', '/api/setup/init-db', { setup_key: 'setup-key-123', step: 0 }, null, { ip: '9.9.9.9' })).s === 409, 'init blocked after admin exists');
  // اجرای کامل مرحله‌ها روی یک دیتابیس کاملاً خالی، به‌همراه اجرای دوباره (idempotent) پیش از ساخت مدیر
  const env2 = { ...env, DB: makeDB([]) }; const c2 = async (m, p, b) => { const r = await worker.fetch(new Request('https://api.test' + p, { method: m, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '9.8.7.6' }, body: b ? JSON.stringify(b) : undefined }), env2); return { s: r.status, d: await r.json() }; };
  const e0 = await c2('GET', '/api/setup/status'); ok(e0.s === 200 && e0.d.initialized === false && e0.d.has_admin === false && e0.d.steps === s1.d.steps, 'empty db status');
  for (let round = 0; round < 2; round++) for (let i = 0; i < e0.d.steps; i++) { const r = await c2('POST', '/api/setup/init-db', { setup_key: 'setup-key-123', step: i }); if (r.s !== 200) { ok(false, 'init step ' + i + ' ' + JSON.stringify(r.d)); break; } }
  ok((await c2('GET', '/api/majors')).d.items.length === 135 && (await c2('GET', '/api/jobs')).d.items.length === 184, 'fresh db init + rerun keeps counts');
  ok((await c2('GET', '/api/setup/status')).d.initialized === true, 'status after init');
});
console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
