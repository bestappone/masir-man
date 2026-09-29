import { HttpError, json } from '../lib/http.js';
import { all, first, run, batch, prep, multiInsert, parseJson, csv, qmarks } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { rateLimit } from '../lib/limits.js';
import { hasAccess } from './purchases.js';

export async function getTest(ctx) {
  const t = await first(ctx.env, 'SELECT id, slug, title, description, kind, est_minutes, level, science_note, result_note, is_paid, price FROM tests WHERE slug=? AND is_published=1', ctx.params.slug);
  if (!t) throw new HttpError(404, 'تست پیدا نشد.');
  let locked = false;
  if (t.is_paid) { const u = ctx.user; locked = !u || !(await hasAccess(ctx.env, u.id, 'test:' + t.slug)); }
  if (locked) return json({ test: t, locked: true, questions: [] });
  const qs = await all(ctx.env, 'SELECT id, category_code, q_text, level FROM questions WHERE test_id=? AND is_active=1 ORDER BY sort_order, id', t.id);
  const opts = qs.length ? await all(ctx.env, `SELECT id, question_id, o_text FROM options WHERE question_id IN (SELECT id FROM questions WHERE test_id=? AND is_active=1) ORDER BY sort_order, id`, t.id) : [];
  const by = {}; for (const o of opts) (by[o.question_id] ||= []).push({ id: o.id, text: o.o_text });
  return json({ test: t, locked: false, questions: qs.map(q => ({ id: q.id, text: q.q_text, level: q.level, options: by[q.id] || [] })) });
}

export async function submitTest(ctx) {
  const u = requireUser(ctx);
  await rateLimit(ctx.env, `submit:${u.id}`, 20, 3600);
  const t = await first(ctx.env, 'SELECT * FROM tests WHERE slug=? AND is_published=1', ctx.params.slug);
  if (!t) throw new HttpError(404, 'تست پیدا نشد.');
  if (t.is_paid && !(await hasAccess(ctx.env, u.id, 'test:' + t.slug))) throw new HttpError(402, 'این آزمون پولی است؛ ابتدا آن را از صفحه‌ی آزمون بخر.');
  const b = await ctx.body();
  const answers = b.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new HttpError(400, 'پاسخ‌ها نامعتبر است.');
  const qs = await all(ctx.env, 'SELECT id, category_code, weight FROM questions WHERE test_id=? AND is_active=1', t.id);
  const opts = await all(ctx.env, 'SELECT id, question_id, score FROM options WHERE question_id IN (SELECT id FROM questions WHERE test_id=? AND is_active=1)', t.id);
  const byQ = {}; for (const o of opts) (byQ[o.question_id] ||= []).push(o);
  const missing = qs.filter(q => answers[q.id] === undefined).length;
  if (missing > Math.floor(qs.length * 0.1)) throw new HttpError(400, 'لطفاً به بیشتر سؤال‌ها پاسخ بده.');
  const cats = {}; const items = [];
  for (const q of qs) {
    const optId = Number(answers[q.id]); const list = byQ[q.id] || [];
    const chosen = list.find(o => o.id === optId);
    if (answers[q.id] !== undefined && !chosen) throw new HttpError(400, 'یکی از گزینه‌ها نامعتبر است.');
    const max = Math.max(0, ...list.map(o => o.score)); const w = q.weight || 1;
    const c = (cats[q.category_code] ||= { raw: 0, max: 0, n: 0 });
    if (chosen) { c.raw += chosen.score * w; c.max += max * w; c.n++; items.push([0, q.id, chosen.id, chosen.score]); }
  }
  const scores = {}; for (const [code, c] of Object.entries(cats)) scores[code] = { raw: Math.round(c.raw * 100) / 100, max: c.max, pct: c.max ? Math.round((c.raw / c.max) * 100) : 0, n: c.n };
  const top = Object.entries(scores).sort((a, b) => b[1].pct - a[1].pct).slice(0, 3).map(x => x[0]);
  const r = await run(ctx.env, 'INSERT INTO test_results (user_id, test_id, scores_json, top_codes) VALUES (?,?,?,?)', u.id, t.id, JSON.stringify(scores), top.join(','));
  const rid = r.meta.last_row_id;
  if (items.length) await batch(ctx.env, multiInsert(ctx.env, 'test_result_items', ['result_id', 'question_id', 'option_id', 'score'], items.map(i => [rid, ...i.slice(1)])));
  return json({ id: rid, ...(await buildResult(ctx.env, rid, u.id)) }, 201);
}

async function resolve(env, table, slugs, nameCol = 'name') {
  if (!slugs.length) return [];
  return all(env, `SELECT slug, ${nameCol} name FROM ${table} WHERE slug IN (${qmarks(slugs.length)}) AND is_published=1`, ...slugs);
}
export async function buildResult(env, rid, uid) {
  const r = await first(env, 'SELECT * FROM test_results WHERE id=? AND user_id=?', rid, uid);
  if (!r) throw new HttpError(404, 'نتیجه پیدا نشد.');
  const t = await first(env, 'SELECT slug, title, kind, science_note, result_note FROM tests WHERE id=?', r.test_id);
  const scores = parseJson(r.scores_json, {});
  const cats = await all(env, 'SELECT code, title, description, suggested_majors, suggested_jobs, suggested_skills, next_action FROM test_categories WHERE test_id=? ORDER BY sort_order, id', r.test_id);
  const rows = cats.map(c => ({ code: c.code, title: c.title, description: c.description, pct: scores[c.code]?.pct ?? 0, next_action: c.next_action, _m: c.suggested_majors, _j: c.suggested_jobs, _s: c.suggested_skills })).sort((a, b) => b.pct - a.pct);
  const topN = rows.filter(x => x.pct > 0).slice(0, 3);
  // ادغام نوبتی: هر دسته‌ی برتر سهمی از پیشنهادها دارد (نه فقط دسته‌ی اول)
  const mix = (key, cap) => { const lists = topN.map(x => csv(x[key])); const out = []; for (let i = 0; out.length < cap && lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length && !out.includes(l[i]) && out.length < cap) out.push(l[i]); return out; };
  const majors = mix('_m', 10), jobs = mix('_j', 10), skills = mix('_s', 8);
  const [m, j, s] = await Promise.all([resolve(env, 'majors', majors), resolve(env, 'jobs', jobs), resolve(env, 'skills', skills)]);
  return {
    test: t, created_at: r.created_at, top_codes: csv(r.top_codes),
    categories: rows.map(({ _m, _j, _s, ...x }) => x),
    next_action: topN[0]?.next_action || '', suggested: { majors: m, jobs: j, skills: s },
  };
}
export async function myResults(ctx) {
  const u = requireUser(ctx);
  const rows = await all(ctx.env, 'SELECT r.id, r.top_codes, r.created_at, t.slug, t.title FROM test_results r JOIN tests t ON t.id=r.test_id WHERE r.user_id=? ORDER BY r.id DESC LIMIT 100', u.id);
  return json({ items: rows });
}
export async function myResult(ctx) { const u = requireUser(ctx); return json(await buildResult(ctx.env, Number(ctx.params.id), u.id)); }
export async function deleteResult(ctx) { const u = requireUser(ctx); await run(ctx.env, 'DELETE FROM test_results WHERE id=? AND user_id=?', Number(ctx.params.id), u.id); return json({ ok: true }); }
