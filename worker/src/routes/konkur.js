// ماژول «انتخاب رشته‌ی کنکور»: روش سه‌دسته‌ای (خوش‌بینانه / منطقی / مطمئن) روی داده‌ی رتبه‌ی قبولی سال‌های قبل.
// داده‌ی رشته‌محل‌ها را مدیر از دفترچه‌ی رسمی سازمان سنجش وارد می‌کند (ورود دسته‌جمعی CSV در پنل).
// پولی/رایگان بودن: ردیف konkur_pick در جدول paid_features (قابل‌تنظیم در پنل).
import { HttpError, json } from '../lib/http.js';
import { all, first, run, batch, prep, csv } from '../lib/db.js';
import { requireUser, requireRole } from '../lib/auth.js';
import { rateLimit, audit } from '../lib/limits.js';
import { hasAccess } from './purchases.js';
import { konkurNarrative } from '../lib/narrative.js';

const FEATURE = 'konkur_pick';
const MAX_FORM = 150;

// روش گام‌به‌گام (متن راهنما؛ برای همه آزاد است)
export const GUIDE = [
  { title: 'کارنامه را بخوان', text: 'رتبه، نمره‌ی کل، سهمیه، وضعیت بومی‌بودن و دوره‌هایی که مجاز به انتخابشان شده‌ای را از کارنامه‌ی رسمی دربیاور. اگر برای دوره‌ای مجاز نشده‌ای، وجود کد آن در دفترچه به این معنی نیست که می‌شود انتخابش کرد.' },
  { title: 'اول علاقه‌ها، بعد رتبه', text: 'قبل از نگاه کردن به رتبه، چند رشته‌ای را که واقعاً دوست داری جدا کن (تست‌های سایت کمک می‌کنند). این‌طور رتبه فقط ابزار چیدن می‌شود، نه تعیین‌کننده‌ی رؤیاهایت.' },
  { title: 'دفترچه‌ی رسمی گروه خودت', text: 'دفترچه‌ی انتخاب رشته را از سایت سازمان سنجش بگیر. در ۱۴۰۵ داوطلب حداکثر ۱۵۰ کدرشته‌محل را در یک فرم ثبت می‌کند. کدها را فقط از دفترچه‌ی رسمی بردار.' },
  { title: 'تحلیل سه‌دسته‌ای', text: 'هر گزینه را با داده‌ی سال‌های قبل می‌سنجیم: «خوش‌بینانه» (کمی بالاتر از رتبه‌ات)، «منطقی» (هم‌سطح) و «مطمئن» (پایین‌تر و محتمل‌تر). این بخش را سایت برایت حساب می‌کند.' },
  { title: 'مقایسه‌ی رشته، دانشگاه، شهر و دوره', text: 'برای هر گزینه بپرس: حاضرم چهار سال در آن شهر و آن رشته زندگی کنم؟ هزینه، دوره‌ی روزانه یا شبانه و بازار کار را هم ببین. بعضی‌ها رشته‌محور می‌چینند و بعضی دانشگاه‌محور؛ هر دو روش درست است، به شرط اینکه از قبل انتخابش کنی.' },
  { title: 'چیدمان نهایی و کنترل خطا', text: 'ترتیب نهایی را ترجیح خودت تعیین می‌کند؛ سه‌دسته فقط ابزار تحلیل است و لازم نیست مکانیکی «خوش‌بینانه‌ها بالا و مطمئن‌ها پایین» بچینی. گزینه‌ای را که حاضر به تحصیل در آن نیستی فقط برای پر کردن فرم اضافه نکن. کدها را چند بار کنترل کن و ثبت نهایی را فقط از سامانه‌ی رسمی انجام بده.' },
];

async function feature(env, uid) {
  const f = await first(env, 'SELECT is_paid, price FROM paid_features WHERE feature_key=?', FEATURE).catch(() => null);
  const paid = !!(f && f.is_paid);
  return { is_paid: paid, price: f ? f.price : 0, has_access: !paid || (uid ? await hasAccess(env, uid, 'feature:' + FEATURE) : false) };
}

// اطلاعات عمومی: راهنما، وضعیت پولی بودن، گروه‌ها و گزینه‌های فیلتر
export async function info(ctx) {
  const env = ctx.env; const u = ctx.user;
  const f = await feature(env, u?.id);
  let groups = [], cities = [], types = [], years = [];
  try {
    groups = await all(env, 'SELECT group_name name, COUNT(*) n FROM konkur_programs WHERE is_active=1 GROUP BY group_name ORDER BY group_name');
    cities = (await all(env, 'SELECT DISTINCT city FROM konkur_programs WHERE is_active=1 AND city IS NOT NULL AND city!=\'\' ORDER BY city LIMIT 200')).map(x => x.city);
    types = (await all(env, 'SELECT DISTINCT course_type FROM konkur_programs WHERE is_active=1 AND course_type IS NOT NULL AND course_type!=\'\' ORDER BY course_type')).map(x => x.course_type);
    years = (await all(env, 'SELECT DISTINCT rank_year FROM konkur_programs WHERE rank_year IS NOT NULL AND rank_year!=\'\' ORDER BY rank_year DESC LIMIT 3')).map(x => x.rank_year);
  } catch { /* سایت هنوز به‌روزرسانی نشده است */ }
  return json({ guide: GUIDE, feature: f, groups, cities, course_types: types, years, max_choices: MAX_FORM });
}

const fa2en = (s) => String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const toInt = (v) => { const n = parseInt(fa2en(v).replace(/[,،\s]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };

function tierOf(cut, rank) {
  if (!cut) return null;
  if (cut >= rank * 1.2) return 'safe';          // آخرین رتبه‌ی قبولی خیلی بالاتر از رتبه‌ی تو
  if (cut >= rank) return 'realistic';           // هم‌سطح؛ رتبه‌ات تا ۲۰٪ بهتر از مرز قبولی
  if (cut >= rank * 0.7) return 'ambitious';     // مرز قبولی کمی بهتر از رتبه‌ی توست
  return null;                                   // خیلی دور از دسترس
}

export async function analyze(ctx) {
  const u = requireUser(ctx); const env = ctx.env;
  await rateLimit(env, `konkur:${u.id}`, 30, 3600);
  const f = await feature(env, u.id);
  if (!f.has_access) { const e = new HttpError(402, `این قابلیت پولی است (${f.price.toLocaleString('en-US')} تومان)؛ ابتدا آن را بخر.`); e.price = f.price; throw e; }
  const b = await ctx.body();
  const group = String(b.group || '').trim().slice(0, 60);
  const rank = toInt(b.rank);
  const region = [1, 2, 3].includes(Number(b.region)) ? Number(b.region) : 3;
  if (!group) throw new HttpError(400, 'گروه آزمایشی را انتخاب کن.');
  if (!rank || rank > 1500000) throw new HttpError(400, 'رتبه را درست وارد کن (عدد مثبت).');
  const interests = (Array.isArray(b.interests) ? b.interests : csv(b.interests)).map(x => String(x).trim()).filter(Boolean).slice(0, 15);
  const cities = (Array.isArray(b.cities) ? b.cities : csv(b.cities)).map(x => String(x).trim()).filter(Boolean).slice(0, 15);
  const types = (Array.isArray(b.course_types) ? b.course_types : csv(b.course_types)).map(x => String(x).trim()).filter(Boolean).slice(0, 8);

  const rows = await all(env, 'SELECT id, code, field_name, university, city, course_type, major_slug, capacity, rank_r1, rank_r2, rank_r3, rank_year FROM konkur_programs WHERE group_name=? AND is_active=1', group);
  const empty = { ambitious: [], realistic: [], safe: [] };
  if (!rows.length) return json({ mode: 'guide_only', group, rank, tiers: empty, form: [], narrative: konkurNarrative({ mode: 'guide_only', group, rank, tiers: empty, warnings: [], interestsCount: 0 }) });

  const items = [];
  for (const r of rows) {
    const cut = r['rank_r' + region];
    const tier = tierOf(cut, rank);
    if (!tier) continue;
    const likes = r.major_slug && interests.includes(r.major_slug) ? 1 : 0;
    const cityOk = cities.length ? (r.city && cities.includes(r.city) ? 1 : 0) : 0;
    const typeOk = types.length ? (r.course_type && types.includes(r.course_type) ? 1 : 0) : 0;
    if (types.length && !typeOk) continue;
    items.push({ id: r.id, code: r.code, field_name: r.field_name, university: r.university, city: r.city, course_type: r.course_type, major_slug: r.major_slug, cutoff: cut, year: r.rank_year, tier, likes, cityOk });
  }
  // ترتیب پیشنهادی در هر دسته: علاقه ← شهر مطلوب ← مرز قبولی (سخت‌تر، بالاتر)
  const ord = (x, y) => (y.likes - x.likes) || (y.cityOk - x.cityOk) || (x.cutoff - y.cutoff);
  const tiers = { ambitious: [], realistic: [], safe: [] };
  for (const it of items) tiers[it.tier].push(it);
  for (const k of Object.keys(tiers)) tiers[k].sort(ord);

  // پیشنهاد فرم ۱۵۰تایی: سهم هر دسته + پرکردن خالی‌ها از دسته‌های دیگر
  const quota = { ambitious: 45, realistic: 70, safe: 35 }; const pick = {};
  let left = MAX_FORM;
  for (const k of Object.keys(quota)) { pick[k] = tiers[k].slice(0, quota[k]); left -= pick[k].length; }
  for (const k of ['realistic', 'safe', 'ambitious']) { if (left <= 0) break; const extra = tiers[k].slice(pick[k].length, pick[k].length + left); pick[k] = pick[k].concat(extra); left -= extra.length; }
  const form = [...pick.ambitious, ...pick.realistic, ...pick.safe].slice(0, MAX_FORM);

  const total = items.length;
  const warnings = [];
  if (total === 0) warnings.push('با این رتبه و فیلترها هیچ گزینه‌ای در داده‌ی سایت پیدا نشد. فیلتر شهر یا نوع دوره را کم کن.');
  if (types.length || cities.length) warnings.push('فیلتر شهر فقط ترتیب را تغییر می‌دهد؛ فیلتر «نوع دوره» گزینه‌های دیگر را کنار می‌گذارد.');
  const lastYear = rows.map(r => r.rank_year).filter(Boolean).sort().pop();
  if (lastYear) warnings.push(`داده‌ی رتبه‌ها مربوط به ${lastYear} است؛ رتبه‌ی قبولی هر سال کمی جابه‌جا می‌شود.`);
  const interestsCount = items.filter(x => x.likes).length;
  const narrative = konkurNarrative({ mode: 'full', group, rank, tiers, warnings: warnings.slice(0, 2), interestsCount: interests.length });
  return json({ mode: 'full', group, rank, region, counts: { ambitious: tiers.ambitious.length, realistic: tiers.realistic.length, safe: tiers.safe.length }, tiers: { ambitious: tiers.ambitious.slice(0, 60), realistic: tiers.realistic.slice(0, 60), safe: tiers.safe.slice(0, 60) }, form, warnings, interests_matched: interestsCount, narrative });
}

// ---------- ورود دسته‌جمعی CSV (مدیر) ----------
const COLS = ['code', 'group_name', 'field_name', 'university', 'city', 'course_type', 'major_slug', 'capacity', 'rank_r1', 'rank_r2', 'rank_r3', 'rank_year'];
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '،' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

export async function importCsv(ctx) {
  const u = requireRole(ctx, ['admin']); const env = ctx.env;
  const b = await ctx.body();
  const rows = parseCsv(b.csv);
  if (!rows.length) throw new HttpError(400, 'متن CSV خالی است.');
  const head = rows[0].map(x => x.trim().toLowerCase());
  const hasHeader = head.includes('code');
  const idx = hasHeader ? COLS.map(c => head.indexOf(c)) : COLS.map((_, i) => i);
  if (hasHeader && (idx[0] < 0 || idx[1] < 0 || idx[2] < 0 || idx[3] < 0)) throw new HttpError(400, 'ستون‌های code، group_name، field_name و university لازم‌اند.');
  const data = hasHeader ? rows.slice(1) : rows;
  if (data.length > 3000) throw new HttpError(400, 'در هر بار حداکثر ۳۰۰۰ ردیف وارد کن.');
  const stmts = []; let bad = 0;
  for (const r of data) {
    const g = (k) => { const i = idx[COLS.indexOf(k)]; return i >= 0 && i < r.length ? fa2en(r[i]).trim() : ''; };
    const gt = (k) => { const i = idx[COLS.indexOf(k)]; return i >= 0 && i < r.length ? String(r[i]).trim() : ''; };
    const code = g('code'), grp = gt('group_name'), field = gt('field_name'), uni = gt('university');
    if (!code || !grp || !field || !uni) { bad++; continue; }
    stmts.push(prep(env, `INSERT INTO konkur_programs (code, group_name, field_name, university, city, course_type, major_slug, capacity, rank_r1, rank_r2, rank_r3, rank_year, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)
      ON CONFLICT(code) DO UPDATE SET group_name=excluded.group_name, field_name=excluded.field_name, university=excluded.university, city=excluded.city, course_type=excluded.course_type, major_slug=excluded.major_slug, capacity=excluded.capacity, rank_r1=excluded.rank_r1, rank_r2=excluded.rank_r2, rank_r3=excluded.rank_r3, rank_year=excluded.rank_year`,
      code.slice(0, 20), grp.slice(0, 60), field.slice(0, 160), uni.slice(0, 160), gt('city').slice(0, 60) || null, gt('course_type').slice(0, 40) || null, g('major_slug').slice(0, 80) || null,
      toInt(g('capacity')), toInt(g('rank_r1')), toInt(g('rank_r2')), toInt(g('rank_r3')), g('rank_year').slice(0, 10) || null));
  }
  for (let i = 0; i < stmts.length; i += 80) await batch(env, stmts.slice(i, i + 80));
  await audit(env, ctx, 'konkur_import', 'konkur_programs', 0, String(stmts.length));
  return json({ imported: stmts.length, skipped: bad });
}
