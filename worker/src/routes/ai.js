import { HttpError, json } from '../lib/http.js';
import { all, first, run, parseJson, csv } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { rateLimit } from '../lib/limits.js';

export async function aiStatus(ctx) {
  const s = await first(ctx.env, 'SELECT is_enabled FROM ai_settings WHERE id=1');
  return json({ enabled: !!(s?.is_enabled && ctx.env.AI_API_KEY) });
}
export async function aiHistory(ctx) {
  const u = requireUser(ctx);
  const rows = await all(ctx.env, 'SELECT msg_role role, content, created_at FROM ai_messages WHERE user_id=? ORDER BY id DESC LIMIT 40', u.id);
  return json({ items: rows.reverse() });
}
export async function aiClear(ctx) { const u = requireUser(ctx); await run(ctx.env, 'DELETE FROM ai_messages WHERE user_id=?', u.id); return json({ ok: true }); }

// زمینه‌ی ساختاریافته‌ی پلتفرم: منبع اصلی حقیقت (AI فقط توضیح و شخصی‌سازی می‌کند)
async function buildContext(env, uid) {
  const [p, res, goal, majors, jobs, plan] = await Promise.all([
    first(env, 'SELECT grade, field_of_study, city, goal_text, chosen_major_slug, chosen_job_slug FROM user_profiles WHERE user_id=?', uid),
    all(env, 'SELECT t.title, r.top_codes, r.scores_json FROM test_results r JOIN tests t ON t.id=r.test_id WHERE r.user_id=? ORDER BY r.id DESC LIMIT 6', uid),
    all(env, 'SELECT title, progress, status FROM goals WHERE user_id=? ORDER BY is_main DESC, id DESC LIMIT 3', uid),
    all(env, 'SELECT slug, name, holland_codes, konkur_group FROM majors WHERE is_published=1 ORDER BY sort_order LIMIT 20'),
    all(env, 'SELECT slug, name FROM jobs WHERE is_published=1 ORDER BY sort_order LIMIT 20'),
    first(env, "SELECT COUNT(*) total, SUM(status='done') done FROM study_tasks WHERE user_id=?", uid),
  ]);
  const lines = [];
  if (p) lines.push(`پروفایل دانش‌آموز: پایه=${p.grade || '؟'}، رشته=${p.field_of_study || '؟'}، شهر=${p.city || '؟'}، هدف=${p.goal_text || '؟'}، رشته‌ی انتخابی=${p.chosen_major_slug || '-'}، شغل انتخابی=${p.chosen_job_slug || '-'}`);
  if (res.length) lines.push('نتایج تست‌ها: ' + res.map(r => `${r.title} (بالاترین دسته‌ها: ${r.top_codes})`).join('؛ '));
  else lines.push('هنوز هیچ تستی انجام نشده است؛ او را به بخش تست‌ها راهنمایی کن.');
  if (goal.length) lines.push('اهداف: ' + goal.map(g => `${g.title} (${g.progress}٪)`).join('؛ '));
  if (plan?.total) lines.push(`پیشرفت برنامه‌ی مطالعه: ${Math.round(((plan.done || 0) / plan.total) * 100)}٪`);
  lines.push('رشته‌های موجود در پلتفرم: ' + majors.map(m => `${m.name}[${m.slug}] (تیپ ${m.holland_codes})`).join('، '));
  lines.push('شغل‌های موجود در پلتفرم: ' + jobs.map(j => `${j.name}[${j.slug}]`).join('، '));
  return lines.join('\n');
}

export async function aiChat(ctx) {
  const u = requireUser(ctx); const env = ctx.env;
  const st = await first(env, 'SELECT * FROM ai_settings WHERE id=1');
  if (!st?.is_enabled || !env.AI_API_KEY || !st.base_url || !st.model) return json({ ok: false, disabled: true, message: 'مشاور AI فعلاً در دسترس نیست. بقیه‌ی بخش‌های سایت کار می‌کنند؛ می‌توانی از تست‌ها، رشته‌ها و مشاوره‌ی انسانی استفاده کنی.' }, 503);
  await rateLimit(env, `ai:${u.id}`, 12, 300);
  const b = await ctx.body(); const msg = String(b.message || '').trim().slice(0, 1000);
  if (msg.length < 2) throw new HttpError(400, 'سؤالت را بنویس.');
  const used = await first(env, "SELECT COUNT(*) n FROM ai_messages WHERE user_id=? AND msg_role='user' AND created_at>=datetime('now','-1 day')", u.id);
  if ((used?.n || 0) >= st.daily_limit) throw new HttpError(429, `سقف پرسش‌های روزانه (${st.daily_limit}) تمام شد. فردا دوباره بپرس.`);
  const hist = (await all(env, 'SELECT msg_role role, content FROM ai_messages WHERE user_id=? ORDER BY id DESC LIMIT 6', u.id)).reverse();
  const ctxText = await buildContext(env, u.id);
  const sys = `${st.system_prompt || ''}\n\nداده‌های ساختاریافته‌ی پلتفرم (منبع اصلی؛ اگر با حدس تو فرق داشت، این داده‌ها معتبرند):\n${ctxText}\n\nقواعد: پاسخ کوتاه و فارسی؛ تشخیص پزشکی/روان‌شناختی نده؛ تصمیم نهایی با کاربر و خانواده است؛ اگر پاسخ را نمی‌دانی صادقانه بگو؛ در صورت مرتبط بودن به بخش‌های سایت ارجاع بده.`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 25000);
  let reply;
  try {
    const r = await fetch(String(st.base_url).replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({ model: st.model, temperature: st.temperature, max_tokens: st.max_tokens, messages: [{ role: 'system', content: sys }, ...hist, { role: 'user', content: msg }] }),
    });
    if (!r.ok) throw new Error('status ' + r.status);
    const j = await r.json(); reply = j?.choices?.[0]?.message?.content;
    if (!reply) throw new Error('empty');
  } catch {
    return json({ ok: false, message: 'مشاور AI الان پاسخ نمی‌دهد. کمی بعد دوباره امتحان کن؛ بقیه‌ی سایت سالم است.' }, 502);
  } finally { clearTimeout(timer); }
  reply = String(reply).slice(0, 4000);
  await run(env, 'INSERT INTO ai_messages (user_id, msg_role, content) VALUES (?,?,?)', u.id, 'user', msg);
  await run(env, 'INSERT INTO ai_messages (user_id, msg_role, content) VALUES (?,?,?)', u.id, 'assistant', reply);
  return json({ ok: true, reply });
}
