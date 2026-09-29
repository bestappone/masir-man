import { HttpError, json } from '../lib/http.js';
import { all, first, run, batch, multiInsert, getSettings, parseJson, tehranToday, addDays, weekday, daysBetween } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { cleanFields, need } from '../lib/validate.js';
import { rateLimit } from '../lib/limits.js';
import { hasAccess } from './purchases.js';

async function requireFeatureAccess(env, u, key) {
  const f = await first(env, 'SELECT is_paid, price FROM paid_features WHERE feature_key=?', key);
  if (f && f.is_paid && !(await hasAccess(env, u.id, 'feature:' + key))) {
    const e = new HttpError(402, `این قابلیت پولی است (${f.price.toLocaleString('en-US')} تومان)؛ ابتدا آن را بخر.`);
    e.price = f.price; throw e;
  }
}

const DEFAULT_RULES = { horizon_days: 28, max_subjects_per_day: 3, min_block_minutes: 20, round_to: 5, weak_weight: { 1: 3, 2: 2.2, 3: 1.5, 4: 1, 5: 0.6 }, review_task_every_days: 7, review_minutes: 30 };

// موتور برنامه‌ریزی: قواعد از site_settings (planning_rules / exam_rules) خوانده می‌شود
export function generateTasks({ subjects, dailyMinutes, studyDays, startDate, endDate, rules, mock = false, focusWeakFromDate = null }) {
  const R = { ...DEFAULT_RULES, ...rules };
  const days = []; for (let d = startDate; d <= endDate; d = addDays(d, 1)) days.push(d);
  const credit = Object.fromEntries(subjects.map(s => [s.name, 0]));
  const tasks = []; let lastReview = startDate; let weekMock = null;
  const roundTo = Math.max(1, R.round_to || 5);
  const rnd = (x) => Math.max(roundTo, Math.round(x / roundTo) * roundTo);
  for (const day of days) {
    if (!studyDays.includes(weekday(day))) continue;
    const boost = focusWeakFromDate && day >= focusWeakFromDate;
    const wt = (s) => (R.weak_weight[s.level] ?? 1) * (boost && s.level <= 2 ? 1.5 : 1);
    subjects.forEach(s => { credit[s.name] += wt(s); });
    const maxN = Math.max(1, Math.min(R.max_subjects_per_day, subjects.length, Math.floor(dailyMinutes / R.min_block_minutes) || 1));
    const picked = [...subjects].sort((a, b) => credit[b.name] - credit[a.name]).slice(0, maxN);
    const totalW = picked.reduce((a, s) => a + wt(s), 0);
    picked.forEach(s => { credit[s.name] -= totalW / picked.length; });
    let left = dailyMinutes;
    const reviewDue = daysBetween(lastReview, day) >= R.review_task_every_days;
    if (reviewDue && left > R.review_minutes + R.min_block_minutes) {
      tasks.push({ title: 'مرور و جمع‌بندی هفته', subject: 'مرور', task_date: day, minutes: R.review_minutes });
      left -= R.review_minutes; lastReview = day;
    }
    if (mock && R.weekly_mock_exam && weekday(day) === studyDays[studyDays.length - 1] && (!weekMock || daysBetween(weekMock, day) >= 6) && left > R.mock_exam_minutes) {
      tasks.push({ title: 'آزمون آزمایشی هفتگی و تحلیل خطاها', subject: 'آزمون', task_date: day, minutes: R.mock_exam_minutes });
      left -= R.mock_exam_minutes; weekMock = day;
    }
    const sumW = picked.reduce((a, s) => a + wt(s), 0);
    for (const s of picked) {
      const m = rnd(left * wt(s) / sumW);
      if (m >= Math.min(R.min_block_minutes, left)) tasks.push({ title: `مطالعه و تمرین ${s.name}`, subject: s.name, task_date: day, minutes: m });
    }
  }
  return tasks;
}

function parseSubjects(list) {
  need(Array.isArray(list) && list.length >= 1 && list.length <= 15, 'حداقل یک درس (و حداکثر ۱۵ درس) وارد کن.');
  return list.map(s => {
    const name = String(s.name || '').trim().slice(0, 60); need(name, 'نام درس خالی است.');
    const level = Math.min(5, Math.max(1, Math.round(Number(s.level) || 3)));
    return { name, level };
  });
}
function parseDays(d) {
  need(Array.isArray(d) && d.length >= 1, 'حداقل یک روز مطالعه انتخاب کن.');
  const x = [...new Set(d.map(Number))].filter(n => n >= 0 && n <= 6).sort((a, b) => a - b);
  need(x.length >= 1, 'روزهای مطالعه نامعتبر است.'); return x;
}
async function insertTasks(env, uid, planId, kind, tasks) {
  if (!tasks.length) return;
  await batch(env, multiInsert(env, 'study_tasks', ['user_id', 'plan_id', 'plan_kind', 'title', 'subject', 'task_date', 'minutes', 'status'], tasks.slice(0, 600).map(t => [uid, planId, kind, t.title, t.subject, t.task_date, t.minutes, 'todo'])));
}
function range(examDate, horizon) {
  const start = tehranToday(); let end = addDays(start, horizon - 1);
  if (examDate && /^\d{4}-\d{2}-\d{2}$/.test(examDate)) { need(examDate >= start, 'تاریخ آزمون گذشته است.'); if (examDate < end) end = addDays(examDate, -1) < start ? start : addDays(examDate, -1); }
  return { start, end };
}

export async function createStudyPlan(ctx) {
  const u = requireUser(ctx); await rateLimit(ctx.env, `plan:${u.id}`, 20, 3600);
  await requireFeatureAccess(ctx.env, u, 'study_plan');
  const b = await ctx.body();
  const base = cleanFields(b, { grade: 't', field_name: 't', goal: 't', exam_date: 'd' });
  const subjects = parseSubjects(b.subjects); const studyDays = parseDays(b.study_days);
  const daily = Math.round(Number(b.daily_minutes)); need(daily >= 20 && daily <= 720, 'زمان مطالعه‌ی روزانه باید بین ۲۰ تا ۷۲۰ دقیقه باشد.');
  const s = await getSettings(ctx.env); const rules = parseJson(s.planning_rules, {});
  const { start, end } = range(base.exam_date, rules.horizon_days || 28);
  const tasks = generateTasks({ subjects, dailyMinutes: daily, studyDays, startDate: start, endDate: end, rules });
  const r = await run(ctx.env, 'INSERT INTO study_plans (user_id, grade, field_name, subjects_json, daily_minutes, study_days, goal, exam_date) VALUES (?,?,?,?,?,?,?,?)', u.id, base.grade || null, base.field_name || null, JSON.stringify(subjects), daily, studyDays.join(','), base.goal || null, base.exam_date || null);
  await insertTasks(ctx.env, u.id, r.meta.last_row_id, 'study', tasks);
  return json({ id: r.meta.last_row_id, tasks: tasks.length }, 201);
}

export async function createExamPlan(ctx) {
  const u = requireUser(ctx); await rateLimit(ctx.env, `plan:${u.id}`, 20, 3600);
  await requireFeatureAccess(ctx.env, u, 'study_plan');
  const b = await ctx.body();
  const base = cleanFields(b, { grade: 't', field_name: 't', target: 't', exam_date: 'd!', current_status: 'x' });
  const subjects = parseSubjects(b.subjects); const studyDays = parseDays(b.study_days);
  const daily = Math.round(Number(b.daily_minutes)); need(daily >= 30 && daily <= 720, 'زمان مطالعه‌ی روزانه باید بین ۳۰ تا ۷۲۰ دقیقه باشد.');
  const strong = subjects.filter(x => x.level >= 4).map(x => x.name); const weak = subjects.filter(x => x.level <= 2).map(x => x.name);
  const s = await getSettings(ctx.env); const rules = parseJson(s.exam_rules, {});
  const { start, end } = range(base.exam_date, rules.horizon_days || 42);
  const focus = rules.final_weeks_focus_weak ? addDays(base.exam_date, -7 * rules.final_weeks_focus_weak) : null;
  const tasks = generateTasks({ subjects, dailyMinutes: daily, studyDays, startDate: start, endDate: end, rules, mock: true, focusWeakFromDate: focus });
  const r = await run(ctx.env, 'INSERT INTO exam_plans (user_id, grade, field_name, target, exam_date, current_status, strong_json, weak_json, daily_minutes, study_days) VALUES (?,?,?,?,?,?,?,?,?,?)', u.id, base.grade || null, base.field_name || null, base.target || null, base.exam_date, base.current_status || null, JSON.stringify(strong), JSON.stringify(weak), daily, studyDays.join(','));
  await insertTasks(ctx.env, u.id, r.meta.last_row_id, 'exam', tasks);
  return json({ id: r.meta.last_row_id, tasks: tasks.length, days_left: daysBetween(tehranToday(), base.exam_date) }, 201);
}

export async function listPlans(ctx) {
  const u = requireUser(ctx);
  const [study, exam, prog] = await Promise.all([
    all(ctx.env, 'SELECT id, grade, field_name, daily_minutes, study_days, goal, exam_date, status, created_at, subjects_json FROM study_plans WHERE user_id=? ORDER BY id DESC LIMIT 20', u.id),
    all(ctx.env, 'SELECT id, grade, field_name, target, exam_date, daily_minutes, study_days, status, created_at, strong_json, weak_json FROM exam_plans WHERE user_id=? ORDER BY id DESC LIMIT 20', u.id),
    all(ctx.env, "SELECT plan_id, plan_kind, COUNT(*) total, SUM(status='done') done FROM study_tasks WHERE user_id=? GROUP BY plan_id, plan_kind", u.id),
  ]);
  const p = (id, kind) => { const x = prog.find(z => z.plan_id === id && z.plan_kind === kind); return x ? { total: x.total, done: x.done || 0, percent: x.total ? Math.round(((x.done || 0) / x.total) * 100) : 0 } : { total: 0, done: 0, percent: 0 }; };
  return json({ study: study.map(x => ({ ...x, subjects: parseJson(x.subjects_json, []), progress: p(x.id, 'study') })), exam: exam.map(x => ({ ...x, strong: parseJson(x.strong_json, []), weak: parseJson(x.weak_json, []), progress: p(x.id, 'exam'), days_left: x.exam_date ? daysBetween(tehranToday(), x.exam_date) : null })) });
}

export async function tasks(ctx) {
  const u = requireUser(ctx);
  const r = ctx.url.searchParams.get('range') || 'today'; const kind = ctx.url.searchParams.get('kind');
  const today = tehranToday(); let from = today, to = today;
  if (r === 'week') to = addDays(today, 6 - ((weekday(today) + 1) % 7)); // تا پایان هفته (جمعه)
  else if (r === 'month') to = addDays(today, 29);
  else if (r === 'overdue') { from = addDays(today, -60); to = addDays(today, -1); }
  let sql = 'SELECT id, plan_id, plan_kind, title, subject, task_date, minutes, status FROM study_tasks WHERE user_id=? AND task_date>=? AND task_date<=?'; const args = [u.id, from, to];
  if (kind === 'study' || kind === 'exam') { sql += ' AND plan_kind=?'; args.push(kind); }
  if (r === 'overdue') sql += " AND status!='done'";
  const rows = await all(ctx.env, sql + ' ORDER BY task_date, id LIMIT 400', ...args);
  return json({ items: rows, range: { from, to } });
}
export async function setTask(ctx) {
  const u = requireUser(ctx);
  const b = await ctx.body(); const d = cleanFields(b, { status: 'e:todo|doing|done!' });
  const r = await run(ctx.env, 'UPDATE study_tasks SET status=? WHERE id=? AND user_id=?', d.status, Number(ctx.params.id), u.id);
  if (!r.meta.changes) throw new HttpError(404, 'پیدا نشد.');
  return json({ ok: true });
}
export async function deletePlan(ctx) {
  const u = requireUser(ctx); const kind = ctx.params.kind; const id = Number(ctx.params.id);
  if (!['study', 'exam'].includes(kind)) throw new HttpError(404, 'پیدا نشد.');
  const own = await first(ctx.env, `SELECT id FROM ${kind}_plans WHERE id=? AND user_id=?`, id, u.id);
  if (!own) throw new HttpError(404, 'پیدا نشد.');
  await batch(ctx.env, [ctx.env.DB.prepare('DELETE FROM study_tasks WHERE plan_id=? AND plan_kind=? AND user_id=?').bind(id, kind, u.id), ctx.env.DB.prepare(`DELETE FROM ${kind}_plans WHERE id=? AND user_id=?`).bind(id, u.id)]);
  return json({ ok: true });
}
