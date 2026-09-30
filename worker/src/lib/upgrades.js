// به‌روزرسانی‌های افزایشی دیتابیس برای سایت‌هایی که قبلاً راه‌اندازی شده‌اند.
// هر آیتم فقط یک بار اجرا می‌شود (نامش در جدول schema_migrations ثبت می‌شود).
// هر عبارت جدا اجرا می‌شود و خطای «already exists / duplicate column» نادیده گرفته می‌شود،
// تا اجرای دوباره یا اجرا روی یک نصب تازه (که ستون‌ها را از ابتدا دارد) بی‌خطر باشد.
export const UPGRADES = [
  {
    name: 'test_copy_warmth_v1',
    title: 'لحن دوستانه‌تر برای متن معرفی/توضیح آزمون‌ها (بدون تغییر سؤال‌ها)',
    sql: [
      "UPDATE tests SET description='دوست داری بیشتر وقتت را با چه کاری بگذرانی؟ این تست بر پایه‌ی یکی از شناخته‌شده‌ترین مدل‌های علاقه‌ی شغلی (مدل هالند) طراحی شده و کمکت می‌کند بفهمی به کدام نوع فعالیت‌ها بیشتر گرایش داری؛ بعد بر همین اساس چند رشته و شغل هم‌راستا پیشنهاد می‌دهیم.', science_note='این تست از کجا آمده؟ از نظریه‌ی جان هالند درباره‌ی علاقه‌های شغلی الهام گرفته‌ایم؛ همان مدلی که پایه‌ی خیلی از تست‌های معتبر مشاوره‌ی شغلی در دنیاست. سؤال‌های این نسخه را خودمان نوشته‌ایم، پس آن را یک آزمون رسمی و استاندارد نگیر — بیشتر یک نقطه‌ی شروع خوب برای شناخت خودت و گفت‌وگو با دیگران است.', result_note='این نتیجه نشان می‌دهد به چه چیزهایی بیشتر علاقه داری، نه اینکه در چه کاری بهتری. برای یک تصمیم کامل‌تر، آن را کنار تست توانایی و ارزش‌های شغلی بگذار و اگر دوست داشتی با یک مشاور هم درباره‌اش حرف بزن.' WHERE slug='holland-interest'",
      "UPDATE tests SET description='این تست کوتاه کمکت می‌کند بفهمی سبک کار و ارتباطت با دیگران چه شکلی است و در شرایط استرس‌زا معمولاً چطور رفتار می‌کنی.', science_note='این تست از کجا آمده؟ از نسخه‌ی کوتاه یک مدل شناخته‌شده در روان‌شناسی شخصیت (Mini-IPIP) الهام گرفته‌ایم. مهم است بدانی این ابزار تشخیصی یا روان‌پزشکی نیست؛ فقط یک ترجیح را نشان می‌دهد، نه خوب یا بد بودنت را. هیچ نمره‌ای اینجا نمره‌ی «قبولی» یا «مردودی» نیست.', result_note='شخصیتت راهت را محدود نمی‌کند؛ فقط نشان می‌دهد در کدام محیط‌ها راحت‌تری و برای کدام‌ها باید کمی بیشتر تمرین کنی.' WHERE slug='big-five-mini'",
      "UPDATE tests SET description='هشت حوزه‌ی مختلف از توانمندی و علاقه وجود دارد؛ این تست کمکت می‌کند ببینی در کدام‌ها بیشتر احساس راحتی و لذت می‌کنی.', science_note='این تست از کجا آمده؟ از نظریه‌ی هوش‌های چندگانه‌ی هاوارد گاردنر گرفته شده. یک نکته‌ی مهم: پژوهشگران روان‌سنجی هنوز این نظریه را به‌عنوان یک ابزار دقیق اندازه‌گیری توانایی تأیید نکرده‌اند؛ برای همین بهتر است نتیجه را بیشتر برای شناخت علاقه‌هایت به کار ببری، نه اثبات توانایی واقعی‌ات.', result_note='این تست بیشتر نشان می‌دهد خودت را در چه حوزه‌هایی توانمندتر می‌بینی. برای سنجش دقیق‌تر توانایی واقعی‌ات، «تست استعداد و توانایی» و نمره‌های درسی‌ات را هم کنارش بگذار.' WHERE slug='multiple-intelligences'",
      "UPDATE tests SET description='بیشتر با دیدن یاد می‌گیری، با شنیدن، با نوشتن یا با انجام‌دادن؟ این تست کمکت می‌کند روش مطالعه‌ات را متنوع‌تر و لذت‌بخش‌تر کنی.', science_note='این تست از کجا آمده؟ از مدل VARK الهام گرفته شده، یکی از شناخته‌شده‌ترین مدل‌های سبک یادگیری. نکته‌ی جالب این است که پژوهش‌های جدی نتوانسته‌اند ثابت کنند محدودکردن مطالعه به «یک سبک» نتیجه‌ی بهتری می‌دهد. پس بهتر است از نتیجه‌ی این تست برای متنوع‌کردن روش مطالعه‌ات استفاده کنی، نه برای محدودکردن خودت به یک روش.', result_note='خبر خوب این است که بهترین روش‌های مطالعه برای همه یکسان‌اند: خودآزمایی، مرور در فاصله‌های زمانی، و تمرین متنوع. این تست فقط کمک می‌کند این روش‌ها را با ابزارهایی که بیشتر دوست داری انجام بدهی.' WHERE slug='learning-preference'",
      "UPDATE tests SET description='۱۲ سؤال کوتاه که توانایی‌ات را در استدلال عددی، کلامی، منطقی و فضایی می‌سنجد. برخلاف تست‌های قبلی، اینجا هر سؤال یک پاسخ درست دارد.', science_note='این تست از کجا آمده؟ سؤال‌ها از سبک آزمون‌های استاندارد استعداد الگو گرفته شده‌اند، اما این نسخه کوتاه و آموزشی است، نه یک آزمون رسمی هنجاریابی‌شده. برای تصمیم‌های مهم، بهتر است از یک آزمون معتبر و نظر یک متخصص هم کمک بگیری.', result_note='چون تعداد سؤال‌ها کم است، تفاوت‌های کوچک بین دسته‌ها را زیاد جدی نگیر. خبر خوب این است که همه‌ی این توانایی‌ها با تمرین بهتر می‌شوند.' WHERE slug='aptitude-basic'",
      "UPDATE tests SET description='می‌خواهی بدانی کدام عادت‌های مطالعه‌ات خوب جواب می‌دهد و کدامشان جای رشد دارد؟ این تست دقیقاً همین را نشان می‌دهد.', science_note='این تست از کجا آمده؟ بر پایه‌ی نظریه‌ی یادگیری خودتنظیم و پژوهش‌های شناخته‌شده درباره‌ی روش‌های مؤثر مطالعه طراحی شده. سؤال‌هایش را خودمان نوشته‌ایم، پس این یک پرسش‌نامه‌ی رسمی و استاندارد نیست.', result_note='دسته‌هایی که نمره‌ی پایین‌تری گرفته‌ای، جاهای خوبی برای شروع تمرین‌اند. لازم نیست همه را با هم درست کنی؛ روی یکی دو مورد تمرکز کن، همین کافی است.' WHERE slug='study-skills'",
      "UPDATE tests SET description='چقدر احساس آمادگی می‌کنی برای تصمیم‌گیری درباره‌ی رشته و شغلت؟ این تست نشان می‌دهد کدام بخش را باید بیشتر روی آن کار کنی.', science_note='این تست از کجا آمده؟ از مفهوم «اعتماد به تصمیم‌گیری شغلی» در روان‌شناسی مشاوره الهام گرفته شده. سؤال‌هایش را خودمان طراحی کرده‌ایم.', result_note='نمره‌ی پایین در یک بخش فقط یعنی آنجا هنوز جای رشد داری، نه اینکه مسیرت اشتباه است. برای هر بخش یک قدم مشخص پیشنهاد داده‌ایم.' WHERE slug='major-readiness'",
      "UPDATE tests SET description='در یک شغل چه چیزی برایت بیشتر اهمیت دارد؟ استقلال، درآمد خوب، کمک به دیگران، امنیت شغلی یا پیشرفت و دیده‌شدن؟', science_note='این تست از کجا آمده؟ از دسته‌بندی ارزش‌های شغلی در سامانه‌ی معتبر O*NET الهام گرفته شده. سؤال‌هایش را خودمان نوشته‌ایم.', result_note='وقتی دو شغل به یک اندازه برایت جذاب‌اند، همین ارزش‌ها هستند که کمکت می‌کنند بین‌شان یکی را انتخاب کنی.' WHERE slug='work-values'"
],
  },
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
