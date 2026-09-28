import { HttpError, json } from '../lib/http.js';
import { all, first, run, batch, getSettings, parseJson, csv, qmarks, tehranToday, tehranNow, addDays, weekday, daysBetween } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { cleanFields, need } from '../lib/validate.js';
import { OWN } from '../resources.js';
import { createProgramFromTemplate } from '../services/common.js';
import { rateLimit } from '../lib/limits.js';

// ---------- CRUD عمومی برای داده‌های شخصی کاربر (اهداف، اقدام‌ها، Check-in) ----------
export function ownList(name) {
  const c = OWN[name];
  return async (ctx) => {
    const u = requireUser(ctx); let where = 'user_id=?'; const args = [u.id];
    for (const f of c.filters || []) { const v = ctx.url.searchParams.get(f); if (v) { where += ` AND ${f}=?`; args.push(Number(v)); } }
    const rows = await all(ctx.env, `SELECT * FROM ${c.table} WHERE ${where} ORDER BY ${c.order} LIMIT 300`, ...args);
    return json({ items: rows });
  };
}
async function checkRefs(ctx, name, d, u) {
  if (name === 'actions' && d.goal_id) { const g = await first(ctx.env, 'SELECT id FROM goals WHERE id=? AND user_id=?', d.goal_id, u.id); need(g, 'این هدف متعلق به تو نیست.', 403); }
  if (name === 'checkins' && d.program_id) { const g = await first(ctx.env, 'SELECT id FROM coaching_programs WHERE id=? AND user_id=?', d.program_id, u.id); need(g, 'این برنامه متعلق به تو نیست.', 403); }
}
export function ownCreate(name) {
  const c = OWN[name];
  return async (ctx) => {
    const u = requireUser(ctx); await rateLimit(ctx.env, `own:${u.id}`, 120, 600);
    const d = cleanFields(await ctx.body(), c.fields); await checkRefs(ctx, name, d, u);
    if (name === 'checkins') need(d.done_today || d.went_well || d.was_hard || d.obstacles || d.next_week, 'حداقل یکی از فیلدها را پر کن.');
    if (name === 'actions' && d.status === 'not_done') need(d.fail_reason, 'دلیل انجام نشدن را انتخاب کن.');
    const keys = Object.keys(d);
    if (name === 'goals' && d.is_main) await run(ctx.env, 'UPDATE goals SET is_main=0 WHERE user_id=?', u.id);
    const r = await run(ctx.env, `INSERT INTO ${c.table} (user_id${keys.map(k => ',' + k).join('')}) VALUES (?${keys.map(() => ',?').join('')})`, u.id, ...keys.map(k => d[k]));
    return json({ id: r.meta.last_row_id }, 201);
  };
}
export function ownUpdate(name) {
  const c = OWN[name];
  return async (ctx) => {
    const u = requireUser(ctx); const id = Number(ctx.params.id);
    const d = cleanFields(await ctx.body(), c.fields, { partial: true }); await checkRefs(ctx, name, d, u);
    const keys = Object.keys(d); if (!keys.length) return json({ ok: true });
    if (name === 'actions' && d.status === 'not_done') need(d.fail_reason || (await first(ctx.env, 'SELECT fail_reason FROM actions WHERE id=?', id))?.fail_reason, 'دلیل انجام نشدن را انتخاب کن.');
    if (name === 'goals' && d.is_main) await run(ctx.env, 'UPDATE goals SET is_main=0 WHERE user_id=?', u.id);
    if (name === 'goals' && d.progress !== undefined) d.progress = Math.min(100, Math.max(0, d.progress));
    if (name === 'goals' && d.status === 'completed') d.progress = 100;
    const ks = Object.keys(d);
    const r = await run(ctx.env, `UPDATE ${c.table} SET ${ks.map(k => k + '=?').join(',')} WHERE id=? AND user_id=?`, ...ks.map(k => d[k]), id, u.id);
    if (!r.meta.changes) throw new HttpError(404, 'پیدا نشد.');
    if (name === 'actions') await syncGoalProgress(ctx.env, id, u.id);
    return json({ ok: true });
  };
}
async function syncGoalProgress(env, actionId, uid) {
  const a = await first(env, 'SELECT goal_id FROM actions WHERE id=? AND user_id=?', actionId, uid);
  if (!a?.goal_id) return;
  const s = await first(env, "SELECT COUNT(*) n, SUM(status='done') d, SUM(status='partial') p FROM actions WHERE goal_id=? AND user_id=?", a.goal_id, uid);
  if (!s?.n) return;
  const pct = Math.round(((s.d || 0) + 0.5 * (s.p || 0)) / s.n * 100);
  await run(env, "UPDATE goals SET progress=?, status=CASE WHEN ?=100 THEN 'completed' WHEN ?>0 AND status='not_started' THEN 'in_progress' ELSE status END WHERE id=? AND user_id=?", pct, pct, pct, a.goal_id, uid);
}
export function ownDelete(name) {
  const c = OWN[name];
  return async (ctx) => { const u = requireUser(ctx); await run(ctx.env, `DELETE FROM ${c.table} WHERE id=? AND user_id=?`, Number(ctx.params.id), u.id); return json({ ok: true }); };
}

// ---------- وضعیت کاربر برای پیشنهاد هوشمند و مسیر ----------
async function userState(env, uid) {
  const [profile, latest, goals, results] = await Promise.all([
    first(env, 'SELECT * FROM user_profiles WHERE user_id=?', uid),
    first(env, "SELECT r.top_codes, r.scores_json FROM test_results r JOIN tests t ON t.id=r.test_id WHERE r.user_id=? AND t.slug='holland-interest' ORDER BY r.id DESC LIMIT 1", uid),
    first(env, 'SELECT COUNT(*) n FROM goals WHERE user_id=?', uid),
    first(env, 'SELECT COUNT(*) n FROM test_results WHERE user_id=?', uid),
  ]);
  return { profile: profile || {}, holland: csv(latest?.top_codes), goals: goals?.n || 0, tests: results?.n || 0 };
}
export async function suggestions(ctx) {
  const rows = await all(ctx.env, 'SELECT id, trigger_type, trigger_value, title, description, link FROM smart_suggestions WHERE is_active=1 ORDER BY sort_order, id');
  let st = { profile: {}, holland: [], goals: 0, tests: 0 };
  if (ctx.user) st = await userState(ctx.env, ctx.user.id);
  const top2 = st.holland.slice(0, 2);
  const out = rows.filter(r => {
    switch (r.trigger_type) {
      case 'always': return true;
      case 'no_test': return st.tests === 0;
      case 'no_goal': return !!ctx.user && st.goals === 0;
      case 'holland_code': return top2.includes(r.trigger_value);
      case 'major': return st.profile.chosen_major_slug && st.profile.chosen_major_slug === r.trigger_value;
      case 'job': return st.profile.chosen_job_slug && st.profile.chosen_job_slug === r.trigger_value;
      default: return false;
    }
  }).slice(0, 8);
  return json({ items: out });
}

// ---------- مسیر شخصی ----------
export async function path(ctx) {
  const u = requireUser(ctx); const env = ctx.env;
  const st = await userState(env, u.id); const p = st.profile;
  const codes = st.holland;
  const overlap = (list) => list.filter(x => csv(x.holland_codes).some(c => codes.slice(0, 3).includes(c)));
  const [majorsAll, jobsAll, pathsAll, mainGoal, plan, cprog, lastRes, abilities] = await Promise.all([
    all(env, 'SELECT slug, name, description, key_lessons, skills, related_jobs, study_path, holland_codes FROM majors WHERE is_published=1 ORDER BY sort_order, id'),
    all(env, 'SELECT slug, name, intro, skills, holland_codes FROM jobs WHERE is_published=1 ORDER BY sort_order, id'),
    all(env, 'SELECT slug, title, description, holland_codes, steps FROM career_paths WHERE is_published=1 ORDER BY sort_order, id'),
    first(env, 'SELECT id, title, progress, status FROM goals WHERE user_id=? ORDER BY is_main DESC, id DESC LIMIT 1', u.id),
    first(env, "SELECT id, exam_date FROM study_plans WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", u.id),
    first(env, "SELECT id, title, coach_type FROM coaching_programs WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", u.id),
    all(env, "SELECT t.slug, t.title, r.scores_json FROM test_results r JOIN tests t ON t.id=r.test_id WHERE r.user_id=? AND t.slug!='holland-interest' ORDER BY r.id DESC LIMIT 12", u.id),
    null,
  ]);
  const chosenMajor = majorsAll.find(m => m.slug === p.chosen_major_slug) || null;
  const chosenJob = jobsAll.find(j => j.slug === p.chosen_job_slug) || null;
  let majors = overlap(majorsAll).slice(0, 5);
  if (chosenMajor && !majors.find(m => m.slug === chosenMajor.slug)) majors.unshift(chosenMajor);
  let jobs = overlap(jobsAll).slice(0, 5);
  if (chosenJob && !jobs.find(j => j.slug === chosenJob.slug)) jobs.unshift(chosenJob);
  const paths = pathsAll.filter(x => csv(x.holland_codes).some(c => codes.slice(0, 3).includes(c)) || (chosenMajor && csv(x.majors || '').includes(chosenMajor.slug)));
  const sel = paths[0] || null;
  const steps = sel ? String(sel.steps || '').split('\n').filter(Boolean).map(l => { const [t, d, link] = l.split('|').map(x => x.trim()); return { title: t, desc: d, link }; }) : [];
  const splitFa = (t) => String(t || '').split(/[،,]/).map(x => x.trim()).filter(Boolean);
  const mm = chosenMajor || majors[0]; const jj = chosenJob || jobs[0];
  const keyLessons = [...new Set(splitFa(mm?.key_lessons))].slice(0, 8);
  const skills = [...new Set([...splitFa(mm?.skills), ...splitFa(jj?.skills)])].slice(0, 10);
  const provTypes = { counselor: 3, coach: 3, professional: 3, mentor: 3 }; const prov = {};
  for (const t of Object.keys(provTypes)) prov[t] = await all(env, "SELECT id, name, specialty, price FROM providers WHERE status='approved' AND provider_type=? ORDER BY id LIMIT 3", t);
  const why = codes.length ? `بر اساس نتیجه‌ی تست علاقه‌ات، تیپ‌های غالب تو «${codes.slice(0, 3).join(' ')}» هستند. رشته‌ها و شغل‌های زیر با همین تیپ‌ها بیشترین همپوشانی را دارند. این یک نقطه‌ی شروع برای بررسی است، نه حکم نهایی.` : 'هنوز تست علاقه را انجام نداده‌ای؛ با انجام آن، پیشنهادها دقیق‌تر می‌شود.';
  return json({
    ready: codes.length > 0, why, holland: codes, goal: mainGoal || (p.goal_text ? { title: p.goal_text } : null),
    majors: majors.map(({ slug, name, description }) => ({ slug, name, description })), jobs: jobs.map(({ slug, name, intro }) => ({ slug, name, intro })),
    key_lessons: keyLessons, skills, path: sel ? { slug: sel.slug, title: sel.title, description: sel.description, steps } : null,
    plan_started: !!plan, coaching: cprog || null, providers: prov,
    abilities: lastRes.map(r => ({ slug: r.slug, title: r.title, scores: parseJson(r.scores_json, {}) })),
  });
}

// ---------- داشبورد و وضعیت مراحل ----------
export async function dashboard(ctx) {
  const u = requireUser(ctx); const env = ctx.env; const today = tehranToday();
  const st = await userState(env, u.id);
  const [tasks, prog, mainGoal, cprog, lastCheck, nextSess, reqs, majorName] = await Promise.all([
    all(env, 'SELECT id, title, subject, minutes, status, plan_kind FROM study_tasks WHERE user_id=? AND task_date=? ORDER BY id LIMIT 30', u.id, today),
    first(env, "SELECT COUNT(*) total, SUM(status='done') done FROM study_tasks WHERE user_id=?", u.id),
    first(env, "SELECT id, title, progress, end_date FROM goals WHERE user_id=? AND status!='completed' ORDER BY is_main DESC, id DESC LIMIT 1", u.id),
    first(env, "SELECT id, title, coach_type, weeks, started_at FROM coaching_programs WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", u.id),
    first(env, 'SELECT created_at, done_today FROM coaching_checkins WHERE user_id=? ORDER BY id DESC LIMIT 1', u.id),
    first(env, "SELECT session_at, mode FROM coaching_sessions WHERE user_id=? AND status='scheduled' AND session_at>=? ORDER BY session_at LIMIT 1", u.id, tehranNow()),
    first(env, "SELECT COUNT(*) n FROM consultation_requests WHERE user_id=? AND status IN ('approved','active','payment_submitted','pending_payment')", u.id),
    first(env, 'SELECT name FROM majors WHERE slug=?', st.profile.chosen_major_slug || ''),
  ]);
  let coaching = null;
  if (cprog) {
    const [g, a, wk] = await Promise.all([
      first(env, 'SELECT COUNT(*) n, AVG(progress) p FROM coaching_goals WHERE program_id=?', cprog.id),
      all(env, "SELECT id, title, status FROM coaching_actions WHERE program_id=? AND week_no=? ORDER BY id", cprog.id, Math.min(cprog.weeks, Math.max(1, Math.floor(daysBetween(cprog.started_at.slice(0, 10), today) / 7) + 1))),
      first(env, "SELECT COUNT(*) n, SUM(status='done') d FROM coaching_actions WHERE program_id=?", cprog.id),
    ]);
    const pct = wk?.n ? Math.round(((wk.d || 0) / wk.n) * 100) : 0;
    const monthGoal = await first(env, "SELECT title FROM coaching_goals WHERE program_id=? AND status!='completed' ORDER BY week_no LIMIT 1", cprog.id);
    coaching = { program: cprog, week_actions: a, progress: pct, month_goal: monthGoal?.title || null };
  }
  const total = prog?.total || 0; const done = prog?.done || 0;
  const wizard = [
    { key: 'me', done: !!(st.profile.grade) }, { key: 'interests', done: st.holland.length > 0 }, { key: 'abilities', done: st.tests > 1 },
    { key: 'goal', done: st.goals > 0 || !!st.profile.goal_text }, { key: 'major', done: !!st.profile.chosen_major_slug }, { key: 'job', done: !!st.profile.chosen_job_slug },
    { key: 'plan', done: total > 0 }, { key: 'coaching', done: !!cprog }, { key: 'consult', done: (reqs?.n || 0) > 0 }, { key: 'final', done: !!(st.profile.chosen_major_slug && total > 0 && st.goals > 0) },
  ];
  return json({
    name: u.name, major: majorName?.name || null, progress: total ? Math.round((done / total) * 100) : 0, today: tasks, main_goal: mainGoal || null,
    coaching, last_checkin: lastCheck || null, next_session: nextSess || null, tests_done: st.tests, wizard, holland: st.holland,
  });
}

// ---------- ویزارد ----------
export async function wizardFinish(ctx) {
  const u = requireUser(ctx); const env = ctx.env; const b = await ctx.body();
  const d = cleanFields(b, { grade: 't', field_of_study: 't', city: 't', goal_text: 'x', chosen_major_slug: 's', chosen_job_slug: 's' }, { partial: true });
  const keys = Object.keys(d);
  if (d.chosen_major_slug) need(await first(env, 'SELECT id FROM majors WHERE slug=?', d.chosen_major_slug), 'رشته‌ی انتخابی پیدا نشد.');
  if (d.chosen_job_slug) need(await first(env, 'SELECT id FROM jobs WHERE slug=?', d.chosen_job_slug), 'شغل انتخابی پیدا نشد.');
  if (keys.length) await run(env, `UPDATE user_profiles SET ${keys.map(k => k + '=?').join(',')}, updated_at=datetime('now') WHERE user_id=?`, ...keys.map(k => d[k]), u.id);
  let goalId = null;
  const has = await first(env, 'SELECT id FROM goals WHERE user_id=? LIMIT 1', u.id);
  const title = String(b.goal_title || d.goal_text || '').trim().slice(0, 200);
  if (!has && title) {
    const r = await run(env, "INSERT INTO goals (user_id, title, category, priority, status, is_main, start_date) VALUES (?,?,?,?,?,1,?)", u.id, title, 'مسیر', 'high', 'not_started', tehranToday());
    goalId = r.meta.last_row_id;
    await run(env, 'INSERT INTO actions (user_id, goal_id, title) VALUES (?,?,?), (?,?,?), (?,?,?)', u.id, goalId, 'مطالعه‌ی صفحه‌ی رشته‌ی انتخابی و یادداشت سؤال‌ها', u.id, goalId, 'گفت‌وگو با یک نفر که این مسیر را رفته', u.id, goalId, 'ساخت برنامه‌ی مطالعه‌ی هفته‌ی اول');
  }
  return json({ ok: true, goal_id: goalId });
}

// ---------- کوچینگ (سمت دانش‌آموز) ----------
export async function coachPrograms(ctx) {
  const u = requireUser(ctx);
  const rows = await all(ctx.env, 'SELECT p.id, p.title, p.coach_type, p.weeks, p.status, p.started_at, v.name coach_name FROM coaching_programs p LEFT JOIN providers v ON v.id=p.coach_id WHERE p.user_id=? ORDER BY p.id DESC', u.id);
  return json({ items: rows });
}
export async function coachProgram(ctx) {
  const u = requireUser(ctx); const id = Number(ctx.params.id);
  const p = await first(ctx.env, 'SELECT p.*, v.name coach_name FROM coaching_programs p LEFT JOIN providers v ON v.id=p.coach_id WHERE p.id=? AND p.user_id=?', id, u.id);
  if (!p) throw new HttpError(404, 'پیدا نشد.');
  const [goals, actions, sessions, checkins] = await Promise.all([
    all(ctx.env, 'SELECT * FROM coaching_goals WHERE program_id=? ORDER BY week_no, id', id),
    all(ctx.env, 'SELECT * FROM coaching_actions WHERE program_id=? ORDER BY week_no, id', id),
    all(ctx.env, 'SELECT id, coach_type, duration_min, price, mode, session_at, status, notes_shared, next_actions FROM coaching_sessions WHERE program_id=? ORDER BY session_at DESC', id),
    all(ctx.env, 'SELECT * FROM coaching_checkins WHERE user_id=? AND program_id=? ORDER BY id DESC LIMIT 30', u.id, id),
  ]);
  return json({ program: p, goals, actions, sessions, checkins });
}
export async function coachSelfStart(ctx) {
  const u = requireUser(ctx); await rateLimit(ctx.env, `cself:${u.id}`, 5, 3600);
  const d = cleanFields(await ctx.body(), { coach_type: 'e:goal|study|career|path!' });
  const s = await getSettings(ctx.env); const labels = parseJson(s.coach_type_labels, {});
  const pid = await createProgramFromTemplate(ctx.env, { userId: u.id, coachId: null, coachType: d.coach_type, title: `برنامه‌ی خودراهبر: ${labels[d.coach_type] || d.coach_type}`, weeks: 8 });
  return json({ id: pid }, 201);
}
export async function coachActionSet(ctx) {
  const u = requireUser(ctx); const id = Number(ctx.params.id);
  const d = cleanFields(await ctx.body(), { status: 'e:pending|done|not_done|partial!', fail_reason: 't' });
  if (d.status === 'not_done') need(d.fail_reason, 'دلیل انجام نشدن را انتخاب کن.');
  const r = await run(ctx.env, 'UPDATE coaching_actions SET status=?, fail_reason=? WHERE id=? AND program_id IN (SELECT id FROM coaching_programs WHERE user_id=?)', d.status, d.fail_reason || null, id, u.id);
  if (!r.meta.changes) throw new HttpError(404, 'پیدا نشد.');
  const a = await first(ctx.env, 'SELECT goal_id FROM coaching_actions WHERE id=?', id);
  if (a?.goal_id) {
    const s = await first(ctx.env, "SELECT COUNT(*) n, SUM(status='done') d, SUM(status='partial') p FROM coaching_actions WHERE goal_id=?", a.goal_id);
    const pct = s.n ? Math.round(((s.d || 0) + 0.5 * (s.p || 0)) / s.n * 100) : 0;
    await run(ctx.env, "UPDATE coaching_goals SET progress=?, status=CASE WHEN ?=100 THEN 'completed' WHEN ?>0 THEN 'in_progress' ELSE 'not_started' END WHERE id=?", pct, pct, pct, a.goal_id);
  }
  return json({ ok: true });
}
export async function coachSessions(ctx) {
  const u = requireUser(ctx);
  const rows = await all(ctx.env, 'SELECT s.id, s.program_id, s.coach_type, s.duration_min, s.price, s.mode, s.session_at, s.status, s.notes_shared, s.next_actions, v.name coach_name FROM coaching_sessions s LEFT JOIN providers v ON v.id=s.coach_id WHERE s.user_id=? ORDER BY s.session_at DESC LIMIT 100', u.id);
  return json({ items: rows });
}
export async function coachReport(ctx) {
  const u = requireUser(ctx);
  const [prog, checks, goals] = await Promise.all([
    all(ctx.env, "SELECT p.id, p.title, (SELECT COUNT(*) FROM coaching_actions a WHERE a.program_id=p.id) total, (SELECT COUNT(*) FROM coaching_actions a WHERE a.program_id=p.id AND a.status='done') done FROM coaching_programs p WHERE p.user_id=?", u.id),
    first(ctx.env, 'SELECT COUNT(*) n FROM coaching_checkins WHERE user_id=?', u.id),
    all(ctx.env, 'SELECT title, progress, status FROM goals WHERE user_id=? ORDER BY id DESC LIMIT 20', u.id),
  ]);
  return json({ programs: prog.map(p => ({ ...p, percent: p.total ? Math.round((p.done / p.total) * 100) : 0 })), checkins: checks?.n || 0, goals });
}
