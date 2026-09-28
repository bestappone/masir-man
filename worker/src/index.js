import { HttpError, json, securityHeaders, corsHeaders, readJson } from './lib/http.js';
import { loadUser } from './lib/auth.js';
import { rateLimit } from './lib/limits.js';
import * as Auth from './routes/auth.js';
import * as Pub from './routes/public.js';
import * as Tests from './routes/tests.js';
import * as Plan from './routes/planner.js';
import * as Me from './routes/me.js';
import * as Svc from './routes/services.js';
import * as AI from './routes/ai.js';
import * as Admin from './routes/admin.js';
import * as Setup from './routes/setup.js';

const routes = [];
const add = (method, path, handler) => {
  const keys = []; const rx = new RegExp('^' + path.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, rx, keys, handler });
};
const G = (p, h) => add('GET', p, h), P = (p, h) => add('POST', p, h), U = (p, h) => add('PUT', p, h), D = (p, h) => add('DELETE', p, h);

G('/api/setup/status', Setup.status); P('/api/setup/init-db', Setup.initDb);
G('/api/health', async (c) => { await c.env.DB.prepare('SELECT 1').first(); return json({ ok: true, time: new Date().toISOString() }); });
// احراز هویت
P('/api/auth/register', Auth.register); P('/api/auth/login', Auth.login); P('/api/auth/logout', Auth.logout);
P('/api/auth/setup-admin', Auth.setupAdmin); P('/api/auth/change-password', Auth.changePassword); P('/api/auth/delete-account', Auth.deleteAccount);
G('/api/me', Auth.me); U('/api/me/profile', Auth.updateProfile);
G('/api/me/referral', Auth.referralInfo); P('/api/coupons/check', Auth.checkCoupon);
// محتوای عمومی
G('/api/settings', Pub.settings); G('/api/home', Pub.home);
for (const n of ['majors', 'jobs', 'skills', 'lessons', 'resources', 'articles', 'faqs', 'career-paths']) G(`/api/${n}`, Pub.listContent(n.replace('-', '_')));
G('/api/majors/:id', Pub.detailContent('majors')); G('/api/jobs/:id', Pub.detailContent('jobs')); G('/api/articles/:id', Pub.detailContent('articles'));
G('/api/skills/:id', Pub.detailContent('skills')); G('/api/career-paths/:id', Pub.detailContent('career_paths'));
G('/api/categories/:table', Pub.categories);
G('/api/providers', Pub.providers); G('/api/providers/:id', Pub.providerDetail); G('/api/providers/:id/slots', Pub.providerSlots);
G('/api/packages', Pub.packages); G('/api/payment-info', Pub.paymentInfo); G('/api/suggestions', Me.suggestions);
// تست‌ها
G('/api/tests', async (c) => { const { all } = await import('./lib/db.js'); return json({ items: await all(c.env, "SELECT t.slug, t.title, t.description, t.kind, t.est_minutes, t.level, (SELECT COUNT(*) FROM questions q WHERE q.test_id=t.id AND q.is_active=1) questions FROM tests t WHERE t.is_published=1 ORDER BY t.sort_order, t.id") }); });
G('/api/tests/:slug', Tests.getTest); P('/api/tests/:slug/submit', Tests.submitTest);
G('/api/my/results', Tests.myResults); G('/api/my/results/:id', Tests.myResult); D('/api/my/results/:id', Tests.deleteResult);
// برنامه‌ریزی
P('/api/plans/study', Plan.createStudyPlan); P('/api/plans/exam', Plan.createExamPlan); G('/api/plans', Plan.listPlans);
G('/api/plans/tasks', Plan.tasks); U('/api/plans/tasks/:id', Plan.setTask); D('/api/plans/:kind/:id', Plan.deletePlan);
// اهداف، اقدام‌ها، Check-in
for (const n of ['goals', 'actions', 'checkins']) { G(`/api/my/${n}`, Me.ownList(n)); P(`/api/my/${n}`, Me.ownCreate(n)); U(`/api/my/${n}/:id`, Me.ownUpdate(n)); D(`/api/my/${n}/:id`, Me.ownDelete(n)); }
G('/api/my/dashboard', Me.dashboard); G('/api/my/path', Me.path); P('/api/my/wizard/finish', Me.wizardFinish);
// کوچینگ
G('/api/coach/programs', Me.coachPrograms); G('/api/coach/programs/:id', Me.coachProgram); P('/api/coach/self-start', Me.coachSelfStart);
U('/api/coach/actions/:id', Me.coachActionSet); G('/api/coach/sessions', Me.coachSessions); G('/api/coach/report', Me.coachReport);
// درخواست خدمت و پرداخت
P('/api/requests', Svc.createRequest); G('/api/requests', Svc.myRequests); G('/api/requests/:id', Svc.myRequest);
P('/api/requests/:id/payment', Svc.submitPayment); P('/api/requests/:id/cancel', Svc.cancelRequest);
// پنل ارائه‌دهنده
P('/api/provider/apply', Svc.providerApply); G('/api/provider/me', Svc.providerMe); U('/api/provider/me', Svc.providerUpdate);
U('/api/provider/availability', Svc.providerSetAvailability); G('/api/provider/slots', Svc.providerSlots);
G('/api/provider/requests', Svc.providerRequests); P('/api/provider/requests/:id/transition', Svc.providerTransition);
G('/api/provider/programs', Svc.providerPrograms); G('/api/provider/programs/:id', Svc.providerProgram);
P('/api/provider/programs/:id/goals', Svc.providerAddGoal); P('/api/provider/programs/:id/actions', Svc.providerAddAction);
P('/api/provider/programs/:id/sessions', Svc.providerAddSession); U('/api/provider/sessions/:id', Svc.providerEditSession);
U('/api/provider/items/:kind/:id', Svc.providerEditItem); D('/api/provider/items/:kind/:id', Svc.providerDeleteItem);
// AI
G('/api/ai/status', AI.aiStatus); G('/api/ai/history', AI.aiHistory); P('/api/ai/chat', AI.aiChat); D('/api/ai/history', AI.aiClear);
// مدیریت
G('/api/admin/meta', Admin.meta); G('/api/admin/stats', Admin.stats);
P('/api/admin/users-create', Admin.createStaff); P('/api/admin/users/:id/reset-password', Admin.resetPassword); G('/api/admin/users/:id/summary', Admin.adminUserSummary);
P('/api/admin/requests/:id/transition', Svc.adminTransition); P('/api/admin/payments/:id/review', Svc.reviewPayment);
P('/api/admin/questions-with-options', Admin.questionWithOptions); G('/api/admin/tests/:id/full', Admin.testFull);
P('/api/admin/providers/:id/generate-slots', Admin.generateSlotsForProvider);
P('/api/admin/:res/:id/toggle', Admin.toggle);
G('/api/admin/:res', Admin.list); P('/api/admin/:res', Admin.create);
G('/api/admin/:res/:id', Admin.getOne); U('/api/admin/:res/:id', Admin.update); D('/api/admin/:res/:id', Admin.remove);

export default {
  async fetch(req, env) {
    const url = new URL(req.url); const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'آدرس پیدا نشد.');
      const ip = req.headers.get('cf-connecting-ip') || 'local';
      let cached;
      const ctx = { req, env, url, ip, params: {}, user: null, body: async () => (cached ??= await readJson(req)) };
      const isSetup = url.pathname.startsWith('/api/setup/') || url.pathname === '/api/health';
      if (!isSetup) {
        try { await rateLimit(env, `g:${ip}`, 300, 60); } catch (e) { if (e instanceof HttpError) throw e; /* خطای زیرساخت مانع سایت نشود */ }
        ctx.user = await loadUser(req, env);
      }
      let matched = null, pathMatched = false;
      for (const r of routes) {
        const m = r.rx.exec(url.pathname); if (!m) continue; pathMatched = true;
        if (r.method !== req.method) continue;
        ctx.params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])); matched = r; break;
      }
      if (!matched) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'روش درخواست مجاز نیست.' : 'آدرس پیدا نشد.');
      res = await matched.handler(ctx);
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message, ...(e.extra || {}) }, e.status);
      else { console.error('server_error', e?.stack || e); res = json({ error: 'خطای داخلی سرور. کمی بعد دوباره تلاش کن.' }, 500); }
    }
    const h = new Headers(res.headers); for (const [k, v] of Object.entries(cors)) h.set(k, v);
    return securityHeaders(new Response(res.body, { status: res.status, headers: h }));
  },
};
