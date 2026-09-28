import { HttpError, json } from '../lib/http.js';
import { all, first, getSettings, parseJson, csv, tehranNow, qmarks } from '../lib/db.js';
import { ensureSlots } from '../services/common.js';
import { requireUser } from '../lib/auth.js';

const cache = (res, sec = 60) => { res.headers.set('cache-control', `public, max-age=${sec}`); return res; };

export async function settings(ctx) { return cache(json({ settings: await getSettings(ctx.env, true) }), 30); }

export async function home(ctx) {
  const now = tehranNow();
  const banners = await all(ctx.env, `SELECT id, placement, title, media_type, media_url, poster_url, link_url FROM banners WHERE is_active=1 AND (starts_at IS NULL OR starts_at='' OR starts_at<=?) AND (ends_at IS NULL OR ends_at='' OR ends_at>=?) ORDER BY sort_order, id`, now, now);
  const [tests, majors, jobs, faqs, articles, pack] = await Promise.all([
    all(ctx.env, 'SELECT slug, title, description, est_minutes FROM tests WHERE is_published=1 ORDER BY sort_order, id'),
    all(ctx.env, 'SELECT slug, name FROM majors WHERE is_published=1 ORDER BY sort_order, id LIMIT 6'),
    all(ctx.env, 'SELECT slug, name FROM jobs WHERE is_published=1 ORDER BY sort_order, id LIMIT 6'),
    all(ctx.env, 'SELECT id, category, question, answer FROM faqs WHERE is_active=1 ORDER BY sort_order, id'),
    all(ctx.env, 'SELECT slug, title, summary, image_url, category FROM articles WHERE is_published=1 ORDER BY id DESC LIMIT 3'),
    first(ctx.env, 'SELECT is_enabled FROM ai_settings WHERE id=1'),
  ]);
  return cache(json({ banners, tests, majors, jobs, faqs, articles, ai_enabled: !!(pack?.is_enabled && ctx.env.AI_API_KEY) }), 30);
}

const LIST = {
  majors: { table: 'majors', cols: 'slug, name, description, holland_codes, konkur_group', pub: 'is_published', order: 'sort_order, id', search: ['name', 'description'] },
  jobs: { table: 'jobs', cols: 'slug, name, intro, holland_codes, related_majors', pub: 'is_published', order: 'sort_order, id', search: ['name', 'intro'] },
  skills: { table: 'skills', cols: 'slug, name, description, category, level, how_to_learn', pub: 'is_published', order: 'sort_order, id', search: ['name', 'description'] },
  lessons: { table: 'lessons', cols: 'slug, name, grade, field_name, description', pub: 'is_published', order: 'sort_order, id', search: ['name'] },
  resources: { table: 'resources', cols: 'id, title, author, publisher, category, level, description, image_url, link_url', pub: 'is_published', order: 'sort_order, id', search: ['title', 'author', 'description'] },
  articles: { table: 'articles', cols: 'slug, title, category, summary, image_url, author, published_at', pub: 'is_published', order: 'id DESC', search: ['title', 'summary'] },
  faqs: { table: 'faqs', cols: 'id, category, question, answer', pub: 'is_active', order: 'sort_order, id', search: ['question'] },
  career_paths: { table: 'career_paths', cols: 'slug, title, description, holland_codes, majors, jobs, steps', pub: 'is_published', order: 'sort_order, id', search: ['title'] },
};
export function listContent(name) {
  const c = LIST[name];
  return async (ctx) => {
    const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 60);
    const cat = (ctx.url.searchParams.get('category') || '').trim().slice(0, 60);
    const grade = (ctx.url.searchParams.get('grade') || '').trim().slice(0, 40);
    let where = `${c.pub}=1`; const args = [];
    if (q) { where += ' AND (' + c.search.map(f => `${f} LIKE ?`).join(' OR ') + ')'; c.search.forEach(() => args.push(`%${q}%`)); }
    if (cat && ['resources', 'articles', 'skills', 'faqs'].includes(name)) { where += ' AND category=?'; args.push(cat); }
    if (grade && name === 'lessons') { where += ' AND grade=?'; args.push(grade); }
    const group = (ctx.url.searchParams.get('group') || '').trim().slice(0, 40);
    if (group && name === 'majors') { where += ' AND konkur_group LIKE ?'; args.push(`%${group}%`); }
    const hol = (ctx.url.searchParams.get('holland') || '').trim().toUpperCase();
    if (/^[RIASEC]$/.test(hol) && (name === 'majors' || name === 'jobs')) { where += ' AND holland_codes LIKE ?'; args.push(`%${hol}%`); }
    const rows = await all(ctx.env, `SELECT ${c.cols} FROM ${c.table} WHERE ${where} ORDER BY ${c.order} LIMIT 300`, ...args);
    return cache(json({ items: rows }), 30);
  };
}
export function detailContent(name, key = 'slug') {
  const c = LIST[name];
  return async (ctx) => {
    const row = await first(ctx.env, `SELECT * FROM ${c.table} WHERE ${key}=? AND ${c.pub}=1`, ctx.params.id);
    if (!row) throw new HttpError(404, 'پیدا نشد.');
    let related = {};
    if (name === 'majors') {
      const jobs = csv(row.related_jobs); const sim = csv(row.similar_majors);
      if (jobs.length) related.jobs = await all(ctx.env, `SELECT slug, name FROM jobs WHERE slug IN (${qmarks(jobs.length)}) AND is_published=1`, ...jobs);
      if (sim.length) related.similar = await all(ctx.env, `SELECT slug, name FROM majors WHERE slug IN (${qmarks(sim.length)}) AND is_published=1`, ...sim);
    }
    if (name === 'jobs') {
      const m = csv(row.related_majors);
      if (m.length) related.majors = await all(ctx.env, `SELECT slug, name FROM majors WHERE slug IN (${qmarks(m.length)}) AND is_published=1`, ...m);
      related.experts = await all(ctx.env, "SELECT id, name, provider_type, specialty FROM providers WHERE status='approved' AND provider_type IN ('professional','mentor') AND (specialty LIKE ? OR tags LIKE ?) LIMIT 4", `%${row.name}%`, `%${row.slug}%`);
    }
    return json({ item: row, related });
  };
}

export async function categories(ctx) {
  const t = ctx.params.table; const ok = { resources: 'resources', articles: 'articles', skills: 'skills' }[t];
  if (!ok) throw new HttpError(404, 'پیدا نشد.');
  const rows = await all(ctx.env, `SELECT DISTINCT category FROM ${ok} WHERE category IS NOT NULL AND category!='' AND ${ok === 'articles' ? 'is_published' : 'is_published'}=1`);
  return cache(json({ items: rows.map(r => r.category) }), 60);
}

// ---------- ارائه‌دهندگان (مشاور، کوچ، منتور، متخصص) ----------
const PUBLIC_PROVIDER = 'id, provider_type, name, photo_url, specialty, experience, city, description, coaching_model, coach_types, background, tags, price, duration_min';
export async function providers(ctx) {
  const type = ctx.url.searchParams.get('type'); const city = ctx.url.searchParams.get('city'); const q = (ctx.url.searchParams.get('q') || '').slice(0, 60);
  let where = "status='approved'"; const args = [];
  if (type && ['counselor', 'professional', 'mentor', 'coach'].includes(type)) { where += ' AND provider_type=?'; args.push(type); }
  if (city) { where += ' AND city=?'; args.push(city.slice(0, 60)); }
  if (q) { where += ' AND (name LIKE ? OR specialty LIKE ? OR tags LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await all(ctx.env, `SELECT ${PUBLIC_PROVIDER} FROM providers WHERE ${where} ORDER BY id LIMIT 100`, ...args);
  const modes = rows.length ? await all(ctx.env, `SELECT provider_id, mode FROM provider_modes WHERE is_enabled=1 AND provider_id IN (${qmarks(rows.length)})`, ...rows.map(r => r.id)) : [];
  const s = await getSettings(ctx.env, true);
  const videoOn = s.video_enabled === '1';
  for (const r of rows) r.modes = modes.filter(m => m.provider_id === r.id && (m.mode !== 'video' || videoOn)).map(m => m.mode);
  return json({ items: rows });
}
export async function providerDetail(ctx) {
  const id = Number(ctx.params.id);
  const r = await first(ctx.env, `SELECT ${PUBLIC_PROVIDER} FROM providers WHERE id=? AND status='approved'`, id);
  if (!r) throw new HttpError(404, 'پیدا نشد.');
  const s = await getSettings(ctx.env, true);
  const modes = await all(ctx.env, 'SELECT mode FROM provider_modes WHERE provider_id=? AND is_enabled=1', id);
  r.modes = modes.map(m => m.mode).filter(m => m !== 'video' || s.video_enabled === '1');
  return json({ item: r });
}
export async function providerSlots(ctx) {
  const id = Number(ctx.params.id);
  const p = await first(ctx.env, "SELECT id FROM providers WHERE id=? AND status='approved'", id);
  if (!p) throw new HttpError(404, 'پیدا نشد.');
  await ensureSlots(ctx.env, id, 14);
  const rows = await all(ctx.env, 'SELECT id, start_at, end_at FROM availability_slots WHERE provider_id=? AND is_booked=0 AND start_at>? ORDER BY start_at LIMIT 120', id, tehranNow());
  return json({ items: rows });
}
export async function packages(ctx) {
  const [items, groups] = await Promise.all([
    all(ctx.env, 'SELECT id, coach_type, title, description, sessions_count, weeks, price FROM coaching_packages WHERE is_active=1 ORDER BY id'),
    all(ctx.env, "SELECT g.id, g.title, g.description, g.capacity, g.weeks, g.price, g.sessions_desc, g.actions_desc, g.rules, g.start_date, g.end_date, g.status, p.name coach_name, (SELECT COUNT(*) FROM group_coaching_members m WHERE m.program_id=g.id AND m.status IN ('pending','active')) members FROM group_coaching_programs g LEFT JOIN providers p ON p.id=g.coach_id WHERE g.status='open' ORDER BY g.id DESC"),
  ]);
  return json({ packages: items, groups });
}
export async function paymentInfo(ctx) {
  requireUser(ctx);
  const p = await first(ctx.env, 'SELECT card_number, card_owner, bank_name, instructions, rules, min_amount, max_amount, receipt_required FROM payment_settings WHERE id=1');
  return json({ payment: p });
}
