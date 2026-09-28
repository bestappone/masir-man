// شبیه‌ساز ساده‌ی D1 روی SQLite (فقط برای تست محلی؛ در تولید استفاده نمی‌شود)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
export function makeDB(files) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const f of files) db.exec(fs.readFileSync(f, 'utf8'));
  const mk = (sql, args = []) => ({
    bind: (...a) => mk(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    _exec: () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  });
  return { raw: db, prepare: (s) => mk(s), batch: async (st) => { db.exec('BEGIN'); try { const o = st.map(s => s._exec()); db.exec('COMMIT'); return o; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}
