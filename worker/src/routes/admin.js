import { HttpError, json } from '../lib/http.js';
import { all, first, run, batch, prep, multiInsert, getSettings } from '../lib/db.js';
import { requireRole, STAFF_ROLES, canManage } from '../lib/auth.js';
import { cleanFields, need, isEmail, strongPassword } from '../lib/validate.js';
import { hashPassword, randomCode } from '../lib/crypto.js';
import { audit } from '../lib/limits.js';
import { RES, LABELS, pkOf } from '../resources.js';

async function guard(ctx, name) {
  const u = requireRole(ctx, STAFF_ROLES);
  const r = RES[name];
  if (!r) throw new HttpError(404, 'بخش پیدا نشد.');
  if (!(await canManage(ctx.env, u, name, r.group))) throw new HttpError(403, 'دسترسی به این بخش برای نقش تو مجاز نیست.');
  return { u, r };
}
const hasFieldsSpec = (r) => r.fields || {};

export async function meta(ctx) {
  const u = requireRole(ctx, STAFF_ROLES);
  const out = [];
  for (const [key, r] of Object.entries(RES)) {
    if (!(await canManage(ctx.env, u, key, r.group))) continue;
    out.push({ key, label: r.label, group: r.group, fields: r.fields || null, ro: !!r.ro, single: !!r.single, noCreate: !!r.noCreate, filters: r.filters || [], title: r.title, search: !!(r.search && r.search.length), pub: r.pub || null, pk: pkOf(r) });
  }
  return json({ resources: out, labels: LABELS, role: u.role });
}

export async function stats(ctx) {
  const u = requireRole(ctx, STAFF_ROLES);
  const q = async (sql) => (await first(ctx.env, sql))?.n || 0;
  const [users, providers, pendingProviders, pendingPayments, activeRequests, tests, majors, jobs, articles, resources, programs, goals] = await Promise.all([
    q('SELECT COUNT(*) n FROM users'), q("SELECT COUNT(*) n FROM providers WHERE status='approved'"), q("SELECT COUNT(*) n FROM providers WHERE status='pending'"),
    q("SELECT COUNT(*) n FROM payments WHERE status='pending'"), q("SELECT COUNT(*) n FROM consultation_requests WHERE status IN ('approved','active')"),
    q('SELECT COUNT(*) n FROM tests'), q('SELECT COUNT(*) n FROM majors'), q('SELECT COUNT(*) n FROM jobs'), q('SELECT COUNT(*) n FROM articles'), q('SELECT COUNT(*) n FROM resources'),
    q("SELECT COUNT(*) n FROM coaching_programs WHERE status='active'"), q('SELECT COUNT(*) n FROM goals'),
  ]);
  const byRole = await all(ctx.env, 'SELECT provider_type t, COUNT(*) n FROM providers GROUP BY provider_type');
  return json({ users, providers, pendingProviders, pendingPayments, activeRequests, tests, majors, jobs, articles, resources, programs, goals, byRole });
}

function safeSelect(r) { return r.select || '*'; }
export async function list(ctx) {
  const { r } = await guard(ctx, ctx.params.res);
  const sp = ctx.url.searchParams; const page = Math.max(1, Number(sp.get('page')) || 1); const size = Math.min(100, Math.max(5, Number(sp.get('size')) || 25));
  let where = '1=1'; const args = [];
  for (const f of r.filters || []) { const v = sp.get(f); if (v !== null && v !== '') { where += ` AND ${f}=?`; args.push(/^-?\d+$/.test(v) ? Number(v) : v); } }
  const q = (sp.get('q') || '').trim().slice(0, 60);
  if (q && r.search?.length) { where += ' AND (' + r.search.map(f => `${f} LIKE ?`).join(' OR ') + ')'; r.search.forEach(() => args.push(`%${q}%`)); }
  if (r.single) { const row = await first(ctx.env, `SELECT * FROM ${r.table} WHERE id=1`); return json({ items: row ? [row] : [], total: row ? 1 : 0 }); }
  const cols = r.heavy ? (await tableCols(ctx.env, r.table)).filter(c => !r.heavy.includes(c)).join(',') : safeSelect(r);
  const total = (await first(ctx.env, `SELECT COUNT(*) n FROM ${r.table} WHERE ${where}`, ...args))?.n || 0;
  const items = await all(ctx.env, `SELECT ${cols} FROM ${r.table} WHERE ${where} ORDER BY ${r.order} LIMIT ? OFFSET ?`, ...args, size, (page - 1) * size);
  return json({ items, total, page, size });
}
async function tableCols(env, table) { return (await all(env, `PRAGMA table_info(${table})`)).map(c => c.name); }

export async function getOne(ctx) {
  const { r } = await guard(ctx, ctx.params.res);
  const row = await first(ctx.env, `SELECT ${safeSelect(r)} FROM ${r.table} WHERE ${pkOf(r)}=?`, r.single ? 1 : ctx.params.id);
  if (!row) throw new HttpError(404, 'پیدا نشد.'); return json({ item: row });
}
function wrapUnique(e) {
  const m = String(e?.message || '');
  if (/UNIQUE/i.test(m)) throw new HttpError(409, 'این مقدار تکراری است (شناسه/slug یا کد باید یکتا باشد).');
  if (/FOREIGN KEY/i.test(m)) throw new HttpError(400, 'ارتباط با یک رکورد دیگر نامعتبر است.');
  throw e;
}
export async function create(ctx) {
  const { r } = await guard(ctx, ctx.params.res);
  if (r.ro || r.noCreate || r.single) throw new HttpError(405, 'ساخت رکورد جدید در این بخش مجاز نیست.');
  const d = cleanFields(await ctx.body(), r.fields); const ks = Object.keys(d);
  need(ks.length, 'اطلاعاتی ارسال نشده است.');
  if (ctx.params.res === 'roles') checkRolePerms(d);
  let res;
  try { res = await run(ctx.env, `INSERT INTO ${r.table} (${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ...ks.map(k => d[k])); } catch (e) { wrapUnique(e); }
  await audit(ctx.env, ctx, 'create', ctx.params.res, res.meta.last_row_id);
  return json({ id: res.meta.last_row_id ?? d[pkOf(r)] }, 201);
}
function checkRolePerms(d) { if (d.permissions !== undefined) { const p = JSON.parse(d.permissions); need(Array.isArray(p) && p.every(x => typeof x === 'string'), 'مجوزها باید آرایه‌ی متنی باشد.'); } }

export async function update(ctx) {
  const { u, r } = await guard(ctx, ctx.params.res); const name = ctx.params.res;
  if (r.ro) throw new HttpError(405, 'این بخش فقط‌خواندنی است.');
  const d = cleanFields(await ctx.body(), r.fields, { partial: true }); const ks = Object.keys(d);
  if (!ks.length) return json({ ok: true });
  const id = r.single ? 1 : ctx.params.id;
  if (name === 'roles') { checkRolePerms(d); const cur = await first(ctx.env, 'SELECT code FROM roles WHERE id=?', id); if (cur && ['admin', 'student'].includes(cur.code) && d.code && d.code !== cur.code) throw new HttpError(400, 'کد نقش‌های سیستمی قابل تغییر نیست.'); }
  if (name === 'users') {
    const target = await first(ctx.env, 'SELECT id, role FROM users WHERE id=?', id); need(target, 'پیدا نشد.', 404);
    if ((d.role || d.status) && u.role !== 'admin') throw new HttpError(403, 'فقط مدیر کل می‌تواند نقش یا وضعیت کاربر را تغییر دهد.');
    if (target.id === u.id && ((d.role && d.role !== 'admin') || d.status === 'blocked')) throw new HttpError(400, 'نقش یا وضعیت حساب خودت را نمی‌توانی تنزل بدهی.');
    if (target.role === 'admin' && d.role && d.role !== 'admin') { const n = (await first(ctx.env, "SELECT COUNT(*) n FROM users WHERE role='admin' AND status='active'")).n; if (n <= 1) throw new HttpError(400, 'باید حداقل یک مدیر فعال باقی بماند.'); }
  }
  if (r.single) await run(ctx.env, `INSERT OR IGNORE INTO ${r.table} (id) VALUES (1)`);
  let res;
  try { res = await run(ctx.env, `UPDATE ${r.table} SET ${ks.map(k => k + '=?').join(',')} WHERE ${pkOf(r)}=?`, ...ks.map(k => d[k]), id); } catch (e) { wrapUnique(e); }
  if (!res.meta.changes) throw new HttpError(404, 'پیدا نشد.');
  if (name === 'users' && (d.status === 'blocked' || d.role)) await run(ctx.env, 'DELETE FROM sessions WHERE user_id=?', id);
  if (name === 'providers' && d.status) await syncProviderRole(ctx.env, id);
  await audit(ctx.env, ctx, 'update', name, id, ks.join(','));
  return json({ ok: true });
}
async function syncProviderRole(env, id) {
  const p = await first(env, 'SELECT user_id, provider_type, status FROM providers WHERE id=?', id);
  if (!p?.user_id) return;
  const cur = await first(env, 'SELECT role FROM users WHERE id=?', p.user_id);
  if (!cur || ['admin', 'editor'].includes(cur.role)) return;
  if (p.status === 'approved') await run(env, 'UPDATE users SET role=? WHERE id=?', p.provider_type, p.user_id);
  else await run(env, "UPDATE users SET role='student' WHERE id=?", p.user_id);
}
export async function remove(ctx) {
  const { u, r } = await guard(ctx, ctx.params.res); const name = ctx.params.res;
  if (r.single) throw new HttpError(405, 'این رکورد حذف نمی‌شود.');
  if (name === 'users') {
    if (u.role !== 'admin') throw new HttpError(403, 'فقط مدیر کل می‌تواند کاربر حذف کند.');
    const t = await first(ctx.env, 'SELECT id, role FROM users WHERE id=?', ctx.params.id); need(t, 'پیدا نشد.', 404);
    if (t.id === u.id) throw new HttpError(400, 'حساب خودت را نمی‌توانی حذف کنی.');
    if (t.role === 'admin') { const n = (await first(ctx.env, "SELECT COUNT(*) n FROM users WHERE role='admin'")).n; if (n <= 1) throw new HttpError(400, 'آخرین مدیر حذف نمی‌شود.'); }
  }
  if (name === 'roles') { const t = await first(ctx.env, 'SELECT code FROM roles WHERE id=?', ctx.params.id); if (t && ['admin', 'editor', 'student'].includes(t.code)) throw new HttpError(400, 'نقش‌های سیستمی حذف نمی‌شوند.'); }
  if (name === 'site_settings' && u.role !== 'admin') throw new HttpError(403, 'دسترسی ندارید.');
  if (name === 'consultation_requests') { const q = await first(ctx.env, 'SELECT * FROM consultation_requests WHERE id=?', ctx.params.id); if (q) { const { releaseRequestResources } = await import('../services/common.js'); await releaseRequestResources(ctx.env, q); } }
  try { await run(ctx.env, `DELETE FROM ${r.table} WHERE ${pkOf(r)}=?`, ctx.params.id); } catch (e) { wrapUnique(e); }
  await audit(ctx.env, ctx, 'delete', name, ctx.params.id);
  return json({ ok: true });
}

// ---------- کارهای ویژه (بدون کدنویسی) ----------
export async function createStaff(ctx) {
  const u = requireRole(ctx, ['admin']); const b = await ctx.body();
  const d = cleanFields(b, { name: 't!', email: 't!', password: 't!', role: 'e:admin|editor|student|counselor|professional|mentor|coach!' });
  const email = d.email.toLowerCase(); need(isEmail(email), 'ایمیل معتبر نیست.'); need(strongPassword(d.password), 'رمز باید حداقل ۸ نویسه و شامل حرف و عدد باشد.');
  if (await first(ctx.env, 'SELECT id FROM users WHERE email=?', email)) throw new HttpError(409, 'این ایمیل قبلاً ثبت شده است.');
  const r = await run(ctx.env, 'INSERT INTO users (email, name, password_hash, password_salt, role, referral_code) VALUES (?,?,?,?,?,?)', email, d.name, await hashPassword(d.password), '', d.role, randomCode(8));
  await run(ctx.env, 'INSERT OR IGNORE INTO user_profiles (user_id, consent_privacy) VALUES (?,1)', r.meta.last_row_id);
  await audit(ctx.env, ctx, 'create_user', 'users', r.meta.last_row_id, d.role);
  return json({ id: r.meta.last_row_id }, 201);
}
export async function resetPassword(ctx) {
  requireRole(ctx, ['admin']); const b = await ctx.body(); const id = Number(ctx.params.id);
  need(strongPassword(b.password), 'رمز باید حداقل ۸ نویسه و شامل حرف و عدد باشد.');
  const r = await run(ctx.env, 'UPDATE users SET password_hash=? WHERE id=?', await hashPassword(b.password), id);
  if (!r.meta.changes) throw new HttpError(404, 'پیدا نشد.');
  await run(ctx.env, 'DELETE FROM sessions WHERE user_id=?', id);
  await audit(ctx.env, ctx, 'reset_password', 'users', id); return json({ ok: true });
}
export async function toggle(ctx) {
  const { r } = await guard(ctx, ctx.params.res);
  const col = r.pub || (r.fields?.is_active ? 'is_active' : null); need(col, 'این بخش کلید فعال/غیرفعال ندارد.');
  await run(ctx.env, `UPDATE ${r.table} SET ${col}=1-${col} WHERE ${pkOf(r)}=?`, ctx.params.id);
  const row = await first(ctx.env, `SELECT ${col} v FROM ${r.table} WHERE ${pkOf(r)}=?`, ctx.params.id);
  await audit(ctx.env, ctx, 'toggle', ctx.params.res, ctx.params.id, String(row?.v)); return json({ ok: true, value: row?.v });
}
export async function questionWithOptions(ctx) {
  const { r } = await guard(ctx, 'questions'); const b = await ctx.body();
  const q = cleanFields(b, { test_id: 'i!', category_code: 't!', q_text: 'x!', level: 't', weight: 'r', sort_order: 'i' });
  need(Array.isArray(b.options) && b.options.length >= 2 && b.options.length <= 10, 'حداقل ۲ گزینه لازم است.');
  const opts = b.options.map((o, i) => ({ ...cleanFields(o, { o_text: 't!', score: 'r!' }), sort_order: i + 1 }));
  const test = await first(ctx.env, 'SELECT id FROM tests WHERE id=?', q.test_id); need(test, 'آزمون پیدا نشد.', 404);
  const ks = Object.keys(q);
  const res = await run(ctx.env, `INSERT INTO questions (${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ...ks.map(k => q[k]));
  const qid = res.meta.last_row_id;
  await batch(ctx.env, multiInsert(ctx.env, 'options', ['question_id', 'o_text', 'score', 'sort_order'], opts.map(o => [qid, o.o_text, o.score, o.sort_order])));
  await audit(ctx.env, ctx, 'create', 'questions', qid); return json({ id: qid }, 201);
}
export async function testFull(ctx) {
  await guard(ctx, 'tests');
  const t = await first(ctx.env, 'SELECT * FROM tests WHERE id=?', Number(ctx.params.id)); if (!t) throw new HttpError(404, 'پیدا نشد.');
  const [cats, qs, opts] = await Promise.all([
    all(ctx.env, 'SELECT * FROM test_categories WHERE test_id=? ORDER BY sort_order, id', t.id),
    all(ctx.env, 'SELECT * FROM questions WHERE test_id=? ORDER BY sort_order, id', t.id),
    all(ctx.env, 'SELECT * FROM options WHERE question_id IN (SELECT id FROM questions WHERE test_id=?) ORDER BY sort_order, id', t.id),
  ]);
  return json({ test: t, categories: cats, questions: qs.map(q => ({ ...q, options: opts.filter(o => o.question_id === q.id) })) });
}
export async function generateSlotsForProvider(ctx) {
  requireRole(ctx, STAFF_ROLES); const { ensureSlots } = await import('../services/common.js');
  const n = await ensureSlots(ctx.env, Number(ctx.params.id), 28); return json({ ok: true, generated: n });
}
export async function adminUserSummary(ctx) {
  requireRole(ctx, ['admin']); const id = Number(ctx.params.id);
  const [u, prof, res, goals, reqs] = await Promise.all([
    first(ctx.env, 'SELECT id, name, email, phone, role, status, created_at, last_login_at FROM users WHERE id=?', id),
    first(ctx.env, 'SELECT grade, field_of_study, city, chosen_major_slug, chosen_job_slug FROM user_profiles WHERE user_id=?', id),
    first(ctx.env, 'SELECT COUNT(*) n FROM test_results WHERE user_id=?', id), first(ctx.env, 'SELECT COUNT(*) n FROM goals WHERE user_id=?', id), first(ctx.env, 'SELECT COUNT(*) n FROM consultation_requests WHERE user_id=?', id),
  ]);
  if (!u) throw new HttpError(404, 'پیدا نشد.'); return json({ user: u, profile: prof, tests: res.n, goals: goals.n, requests: reqs.n });
}

// ---------- به‌روزرسانی‌های افزایشی دیتابیس (فقط مدیر) ----------
export async function migrationsStatus(ctx) {
  requireRole(ctx, ['admin']);
  const { migrationStatus } = await import('../lib/upgrades.js');
  return json({ items: await migrationStatus(ctx.env) });
}
export async function migrationsRun(ctx) {
  requireRole(ctx, ['admin']);
  const b = await ctx.body();
  const { runMigration } = await import('../lib/upgrades.js');
  const out = await runMigration(ctx.env, String(b.name || ''));
  if (!out.ok) throw new HttpError(500, out.error || 'اجرای به‌روزرسانی ناموفق بود.');
  await audit(ctx.env, ctx, 'migration_run', 'schema_migrations', 0, String(b.name || ''));
  return json(out);
}
