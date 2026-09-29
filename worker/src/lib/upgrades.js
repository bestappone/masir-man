// به‌روزرسانی‌های افزایشی دیتابیس برای سایت‌هایی که قبلاً راه‌اندازی شده‌اند.
// هر آیتم فقط یک بار اجرا می‌شود (نامش در جدول schema_migrations ثبت می‌شود).
// هر عبارت جدا اجرا می‌شود و خطای «already exists / duplicate column» نادیده گرفته می‌شود،
// تا اجرای دوباره یا اجرا روی یک نصب تازه (که ستون‌ها را از ابتدا دارد) بی‌خطر باشد.
export const UPGRADES = [
  {
    name: 'paid_features_v1',
    title: 'افزودن قابلیت پولی/رایگان برای آزمون‌ها و ساخت برنامه',
    sql: [
      "ALTER TABLE tests ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE tests ADD COLUMN price INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE consultation_requests ADD COLUMN product_key TEXT",
      `CREATE TABLE IF NOT EXISTS paid_features (
        feature_key TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        is_paid INTEGER NOT NULL DEFAULT 0,
        price INTEGER NOT NULL DEFAULT 0
      )`,
      "INSERT OR IGNORE INTO paid_features (feature_key, title) VALUES ('study_plan', 'ساخت برنامه (پلنر مطالعه و برنامه‌ی آزمون)')",
    ],
  },
];

const IGNORABLE = /duplicate column|already exists/i;

export async function migrationStatus(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  const rows = (await env.DB.prepare('SELECT name FROM schema_migrations').all()).results || [];
  const applied = new Set(rows.map(r => r.name));
  return UPGRADES.map(u => ({ name: u.name, title: u.title, applied: applied.has(u.name) }));
}

export async function runMigration(env, name) {
  const u = UPGRADES.find(x => x.name === name);
  if (!u) return { ok: false, error: 'به‌روزرسانی‌ای با این نام پیدا نشد.' };
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  const already = await env.DB.prepare('SELECT name FROM schema_migrations WHERE name=?').bind(name).first();
  if (already) return { ok: true, already: true };
  for (const stmt of u.sql) {
    try { await env.DB.prepare(stmt).run(); }
    catch (e) { if (!IGNORABLE.test(String(e?.message || ''))) return { ok: false, error: `${String(e?.message || e).slice(0, 200)} — دستور: ${stmt.slice(0, 60)}...` }; }
  }
  await env.DB.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').bind(name).run();
  return { ok: true };
}
