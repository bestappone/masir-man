export const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
export const first = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).first()) || null;
export const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
export const batch = (env, stmts) => (stmts.length ? env.DB.batch(stmts) : Promise.resolve([]));
export const prep = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
export const qmarks = (n) => Array(n).fill('?').join(',');
// درج چندردیفه با رعایت سقف ۱۰۰ پارامتر D1
export function multiInsert(env, table, cols, rows, verb = 'INSERT') {
  const per = Math.max(1, Math.floor(90 / cols.length));
  const out = [];
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const sql = `${verb} INTO ${table} (${cols.join(',')}) VALUES ${part.map(() => '(' + qmarks(cols.length) + ')').join(',')}`;
    out.push(env.DB.prepare(sql).bind(...part.flat()));
  }
  return out;
}
export async function getSettings(env, onlyPublic = false) {
  const rows = await all(env, `SELECT setting_key k, setting_value v FROM site_settings ${onlyPublic ? 'WHERE is_public=1' : ''}`);
  return Object.fromEntries(rows.map(r => [r.k, r.v]));
}
export function parseJson(s, fb) { try { const v = JSON.parse(s); return v ?? fb; } catch { return fb; } }
export const csv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
// تاریخ/ساعت به وقت ایران (بدون تغییر ساعت تابستانی)
const shift = () => new Date(Date.now() + 3.5 * 3600e3);
export const tehranToday = () => shift().toISOString().slice(0, 10);
export const tehranNow = () => shift().toISOString().slice(0, 16);
export const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const weekday = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400e3);
export function jalaliYearNow() { const d = shift(); const m = d.getUTCMonth() + 1, day = d.getUTCDate(); return d.getUTCFullYear() - ((m > 3 || (m === 3 && day >= 21)) ? 621 : 622); }
