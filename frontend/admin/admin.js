/* پنل مدیریت «مسیر من» — رابط عمومی مبتنی بر /api/admin/meta (هر منبع جدید در Worker خودکار اینجا دیده می‌شود) */
(function () {
  'use strict';
  const MM = window.MM, h = MM.h;
  const side = document.getElementById('side');
  const EXTRA_ST = { pending: 'در انتظار', disabled: 'غیرفعال', blocked: 'مسدود', open: 'باز', closed: 'بسته', running: 'در حال اجرا', finished: 'پایان‌یافته', paused: 'متوقف', rejected: 'ردشده' };
  const SL = (k) => (MM.statusLabel && MM.statusLabel[k]) || EXTRA_ST[k] || k;
  const TRANS = { draft: ['requested', 'cancelled'], requested: ['pending_payment', 'rejected', 'cancelled'], pending_payment: ['payment_submitted', 'rejected', 'cancelled'], payment_submitted: ['approved', 'pending_payment', 'rejected', 'cancelled'], approved: ['active', 'completed', 'cancelled', 'paused'], active: ['completed', 'paused', 'cancelled'], paused: ['active', 'cancelled', 'completed'], completed: [], rejected: [], cancelled: [] };
  const SERVICES = ['providers', 'provider_modes', 'availability_slots', 'coach_availability', 'coaching_packages', 'group_coaching_programs', 'coupons'];
  const ACCOUNT = ['users', 'roles', 'site_settings', 'payment_settings', 'ai_settings'];
  let META = null;
  const isStaff = (u) => !!u && ['admin', 'editor'].includes(u.role);
  const L = (k) => (META && META.labels && META.labels[k]) || k;
  const short = (v, n = 60) => { const s = v == null ? '' : String(v); return s.length > n ? s.slice(0, n) + '…' : s; };
  const safeUrl = (u) => /^https?:\/\//i.test(String(u || '')) ? u : null;
  const pk = (r, row) => row[r.pk || 'id'];
  const enc = encodeURIComponent;

  MM.setActive = () => { side.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === location.hash)); side.classList.remove('open'); };
  document.getElementById('menu').addEventListener('click', () => side.classList.toggle('open'));

  async function boot() {
    META = await MM.get('/api/admin/meta');
    const rs = META.resources; const by = (keys) => keys.map(k => rs.find(r => r.key === k)).filter(Boolean);
    const link = (href, text) => h('a', { href }, text);
    const list = (arr) => arr.map(r => link('#/r/' + r.key, r.label));
    MM.mount(side,
      h('h4', null, 'عمومی'), link('#/', '📊 داشبورد'), link('#/queue', '✅ صف بررسی'), link('#/setup', '🛠 راه‌اندازی دیتابیس'),
      h('a', { href: '../' }, '↗ مشاهده‌ی سایت'),
      h('h4', null, 'محتوا'), list(rs.filter(r => r.group === 'content')),
      h('h4', null, 'خدمات و مشاوره'), list(by(SERVICES)),
      h('h4', null, 'کاربران و تنظیمات'), list(by(ACCOUNT)),
      h('h4', null, 'گزارش‌ها (فقط مشاهده)'), list(rs.filter(r => r.ro)),
      h('h4', null, 'حساب'), h('a', { href: '#/', onclick: async (e) => { e.preventDefault(); try { await MM.post('/api/auth/logout'); } catch { /* ignore */ } MM.logoutLocal(); location.hash = '#/'; location.reload(); } }, 'خروج'));
    document.getElementById('who').textContent = (MM.user?.name || '') + ' — ' + (META.role === 'admin' ? 'مدیر' : 'ویراستار');
  }

  // مسیرهای محافظت‌شده: اگر وارد نشده باشد فرم ورود نشان داده می‌شود
  const page = (pattern, title, fn, open = false) => MM.route(pattern, title, async (ctx) => {
    if (open) { side.style.display = 'none'; return fn(ctx); }
    if (!MM.token() || !isStaff(MM.user)) { side.style.display = 'none'; return loginView(); }
    if (!META) { try { await boot(); } catch (e) { MM.logoutLocal(); side.style.display = 'none'; return loginView(e.message); } }
    side.style.display = ''; return fn(ctx);
  });

  function loginView(msg) {
    const f = h('form', { class: 'card narrow', onsubmit: (e) => { e.preventDefault(); MM.busy(f.querySelector('button'), async () => {
      const d = MM.formData(f); const r = await MM.post('/api/auth/login', { email: d.email, password: d.password });
      if (!isStaff(r.user)) throw new Error('این حساب به پنل مدیریت دسترسی ندارد.');
      MM.setSession(r.token, r.user); META = null; MM.navigate(); }); } },
      h('h1', null, 'ورود به پنل مدیریت'), msg ? h('p', { class: 'notice warn' }, msg) : null,
      MM.field('ایمیل', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'username', class: 'ltr' })),
      MM.field('رمز عبور', h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password', class: 'ltr' })),
      h('button', { class: 'btn primary', type: 'submit' }, 'ورود'),
      h('p', { class: 'small muted' }, 'هنوز مدیری ساخته نشده؟ ', h('a', { href: '#/setup' }, 'راه‌اندازی اولیه')));
    return f;
  }

  const askNote = (title, needNote, onOk) => {
    const ta = h('textarea', { rows: 3, placeholder: 'توضیح برای کاربر (اختیاری)' + (needNote ? ' — برای رد کردن لازم است' : '') });
    const m = MM.modal(title, ta, [MM.btn('ثبت', async () => { if (needNote && !ta.value.trim()) return MM.toast('نوشتن توضیح لازم است.', 'err'); try { await onOk(ta.value.trim()); m.close(); } catch (e) { MM.err(e); } }, 'primary'), MM.btn('انصراف', () => m.close())]);
  };

  // ---------- داشبورد ----------
  page('/', 'داشبورد', async () => {
    const s = await MM.get('/api/admin/stats');
    const K = (n, t, href, alert) => h('a', { class: 'kpi' + (alert && n ? ' alert' : ''), href }, h('b', null, MM.fa(n)), t);
    return h('div', { class: 'page' }, h('h1', null, 'داشبورد'),
      h('div', { class: 'kpis' }, K(s.pendingProviders, 'مشاور/متخصص در انتظار تأیید', '#/queue', true), K(s.pendingPayments, 'پرداخت در انتظار بررسی', '#/queue', true), K(s.activeRequests, 'درخواست فعال', '#/r/consultation_requests'),
        K(s.users, 'کاربران', '#/r/users'), K(s.providers, 'مشاوران تأییدشده', '#/r/providers'), K(s.tests, 'آزمون‌ها', '#/r/tests'), K(s.majors, 'رشته‌ها', '#/r/majors'), K(s.jobs, 'مشاغل', '#/r/jobs'),
        K(s.articles, 'مقاله‌ها', '#/r/articles'), K(s.resources, 'منابع', '#/r/resources'), K(s.programs, 'برنامه‌ی کوچینگ فعال', '#/r/coaching_programs'), K(s.goals, 'هدف‌های ثبت‌شده', '#/r/goals')),
      MM.card('', h('h2', null, 'کارهای اول کار'), h('ol', null,
        h('li', null, h('a', { href: '#/r/payment_settings' }, 'شماره‌ی کارت و قوانین پرداخت'), ' را با اطلاعات واقعی پر کن.'),
        h('li', null, h('a', { href: '#/r/site_settings' }, 'تنظیمات سایت'), ' (نام، تماس، فهرست شهرها، پایه‌ها و رشته‌ها) را مرور کن.'),
        h('li', null, h('a', { href: '#/r/ai_settings' }, 'دستیار هوش مصنوعی'), ' را در صورت نیاز فعال کن (به‌صورت پیش‌فرض خاموش است).'),
        h('li', null, 'مشاوران نمونه را از ', h('a', { href: '#/r/providers' }, 'فهرست مشاوران'), ' بررسی و در صورت لزوم حذف یا ویرایش کن.'),
        h('li', null, 'بنر تبلیغاتی صفحه‌ی اصلی را از ', h('a', { href: '#/r/banners' }, 'بنرها'), ' روشن یا خاموش کن.'))));
  });

  // ---------- صف بررسی ----------
  page('/queue', 'صف بررسی', async () => {
    const [pv, pm] = await Promise.all([MM.get('/api/admin/providers?status=pending&size=50'), MM.get('/api/admin/payments?status=pending&size=50')]);
    const provCard = (p) => MM.card('', h('h3', null, p.name, ' ', MM.badge(MM.typeLabel[p.provider_type] || p.provider_type)),
      h('p', { class: 'small muted' }, [p.specialty, p.experience, p.city].filter(Boolean).join(' • ')), p.description ? h('p', null, p.description) : null,
      p.background ? h('p', { class: 'small' }, 'سوابق: ' + p.background) : null, p.documents_note ? h('p', { class: 'small' }, 'مدارک: ' + p.documents_note) : null,
      h('div', { class: 'row' }, MM.btn('تأیید', (e) => MM.busy(e.target, async () => { await MM.put('/api/admin/providers/' + p.id, { status: 'approved' }); try { await MM.post(`/api/admin/providers/${p.id}/generate-slots`); } catch { /* اختیاری */ } MM.toast('تأیید شد.'); MM.navigate(); }), 'primary'),
        MM.btn('رد', () => askNote('رد درخواست ' + p.name, true, async (note) => { await MM.put('/api/admin/providers/' + p.id, { status: 'rejected', admin_note: note }); MM.toast('رد شد.'); MM.navigate(); })),
        MM.link('ویرایش', '#/r/providers/' + p.id, 'btn')));
    const payCard = (p) => MM.card('', h('h3', null, 'پرداخت #' + MM.fa(p.id), ' — ', MM.money(p.amount)), h('p', { class: 'small muted' }, 'درخواست ' + MM.fa(p.request_id) + ' • کد پیگیری: ' + p.tracking_code + ' • ' + MM.dt(p.created_at)),
      safeUrl(p.receipt_url) ? h('p', null, h('a', { href: p.receipt_url, target: '_blank', rel: 'noopener noreferrer' }, 'مشاهده‌ی رسید')) : null,
      h('div', { class: 'row' }, MM.btn('تأیید پرداخت', () => askNote('تأیید پرداخت', false, async (note) => { await MM.post(`/api/admin/payments/${p.id}/review`, { decision: 'approve', note }); MM.toast('تأیید شد.'); MM.navigate(); }), 'primary'),
        MM.btn('رد پرداخت', () => askNote('رد پرداخت', true, async (note) => { await MM.post(`/api/admin/payments/${p.id}/review`, { decision: 'reject', note }); MM.toast('رد شد.'); MM.navigate(); }))));
    return h('div', { class: 'page' }, h('h1', null, 'صف بررسی'),
      h('h2', null, 'مشاوران و متخصصان در انتظار تأیید (' + MM.fa(pv.items.length) + ')'), pv.items.length ? pv.items.map(provCard) : MM.empty('موردی نیست'),
      h('h2', null, 'پرداخت‌های در انتظار بررسی (' + MM.fa(pm.items.length) + ')'), pm.items.length ? pm.items.map(payCard) : MM.empty('موردی نیست'));
  });

  // ---------- ویزارد راه‌اندازی (بدون خط فرمان) ----------
  page('/setup', 'راه‌اندازی', async () => {
    const base = MM.base(); const bad = !base || /YOUR-ACCOUNT/i.test(base);
    let st = null, err = '';
    if (!bad) { try { st = await MM.get('/api/setup/status'); } catch (e) { err = e.message; } }
    const keyIn = h('input', { type: 'password', class: 'ltr', autocomplete: 'off', placeholder: 'SETUP_KEY' });
    const bar = h('div'); const log = h('p', { class: 'small muted', 'aria-live': 'polite' });
    const runBtn = MM.btn(st?.initialized ? 'ادامه/تکرار ساخت داده‌ها (بی‌خطر تا پیش از ساخت مدیر)' : '۱) ساخت جداول و داده‌ی نمونه', async () => {
      if (!keyIn.value.trim()) return MM.toast('کلید راه‌اندازی را وارد کن.', 'err');
      runBtn.disabled = true; try {
        const total = st.steps; for (let i = 0; i < total; i++) {
          MM.mount(bar, MM.progress(Math.round((i / total) * 100), `مرحله‌ی ${MM.fa(i + 1)} از ${MM.fa(total)}`));
          await MM.post('/api/setup/init-db', { setup_key: keyIn.value.trim(), step: i });
        }
        MM.mount(bar, MM.progress(100, 'انجام شد')); log.textContent = 'جداول و داده‌ی پایه آماده است. اکنون مدیر اول را بساز.'; MM.toast('راه‌اندازی دیتابیس کامل شد.');
        setTimeout(MM.navigate, 900);
      } catch (e) { MM.err(e); log.textContent = e.message; } finally { runBtn.disabled = false; }
    }, 'primary');
    const adminForm = h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); MM.busy(adminForm.querySelector('button'), async () => {
      const d = MM.formData(adminForm); await MM.post('/api/auth/setup-admin', { setup_key: keyIn.value.trim(), name: d.name, email: d.email, password: d.password });
      const r = await MM.post('/api/auth/login', { email: d.email, password: d.password }); MM.setSession(r.token, r.user); META = null; MM.toast('مدیر ساخته شد. خوش آمدی!'); location.hash = '#/'; }); } },
      MM.field('نام', h('input', { name: 'name', required: true })), MM.field('ایمیل', h('input', { name: 'email', type: 'email', required: true, class: 'ltr' })),
      MM.field('رمز عبور', h('input', { name: 'password', type: 'password', required: true, class: 'ltr', minlength: 8 }), 'حداقل ۸ نویسه و شامل حرف و عدد'),
      h('button', { class: 'btn primary', type: 'submit' }, '۲) ساخت مدیر اول'));
    return h('div', { class: 'page narrow' }, h('h1', null, '🛠 راه‌اندازی'),
      bad ? MM.card('', h('p', { class: 'notice warn' }, 'آدرس سرور (API_BASE) در فایل config.js هنوز تنظیم نشده است. آدرس Worker خودت را در آن بنویس و دوباره باز کن.')) :
      MM.card('', h('h2', null, 'وضعیت اتصال'), err ? h('p', { class: 'notice warn' }, 'اتصال به سرور برقرار نشد: ' + err) : h('ul', null,
        h('li', null, 'سرور: ' + base), h('li', null, 'جداول و داده‌ی پایه: ' + (st.initialized ? 'آماده' : 'هنوز ساخته نشده')), h('li', null, 'مدیر: ' + (st.has_admin ? 'ساخته شده' : 'هنوز ساخته نشده')),
        h('li', null, 'SETUP_KEY در Cloudflare: ' + (st.setup_key_set ? 'تنظیم شده' : 'تنظیم نشده ← ابتدا آن را به‌صورت Secret بساز')))),
      st && !st.has_admin ? MM.card('', h('h2', null, 'گام اول: دیتابیس'), h('p', { class: 'muted' }, 'همان مقداری را که برای SETUP_KEY در Cloudflare گذاشتی وارد کن و دکمه را بزن. اگر وسط کار قطع شد، دوباره بزن؛ مشکلی ایجاد نمی‌شود.'), MM.field('کلید راه‌اندازی', keyIn), runBtn, bar, log) : null,
      st && !st.has_admin ? MM.card('', h('h2', null, 'گام دوم: مدیر اول'), adminForm) : null,
      st && st.has_admin ? MM.card('', h('p', null, 'راه‌اندازی انجام شده و مدیر ساخته شده است. ', h('a', { href: '#/' }, 'ورود به پنل')), h('p', { class: 'notice warn' }, 'برای امنیت بیشتر، متغیر SETUP_KEY را از تنظیمات Worker در Cloudflare حذف کن.')) : null);
  }, true);

  // ---------- ابزار فرم عمومی ----------
  const spec = (s) => { const req = s.endsWith('!'); const v = req ? s.slice(0, -1) : s; const [t, o] = v.split(':'); return { t, req, opts: o ? o.split('|') : null }; };
  const FULL = new Set(['x', 'X', 'j']);
  function inputFor(name, sp, val) {
    const { t, req, opts } = spec(sp); const base = { name, required: req };
    if (t === 'e') return h('select', { name, required: req }, req ? null : h('option', { value: '' }, '—'), opts.map(o => h('option', { value: o, selected: String(val) === o }, SL(o))));
    if (t === 'b') return h('input', { type: 'checkbox', name, checked: !!Number(val) });
    if (t === 'x' || t === 'X' || t === 'j') return h('textarea', { ...base, rows: t === 'X' ? 12 : 4, class: t === 'j' ? 'ltr' : '' }, val ?? '');
    if (t === 'i' || t === 'r') return h('input', { ...base, type: 'number', step: t === 'i' ? '1' : 'any', value: val ?? '', class: 'ltr' });
    if (t === 'u' || t === 's') return h('input', { ...base, type: 'text', value: val ?? '', class: 'ltr', placeholder: t === 'u' ? 'https://…' : 'english-slug' });
    if (t === 'd') return h('input', { ...base, type: 'text', value: val ?? '', class: 'ltr', placeholder: 'YYYY-MM-DD یا YYYY-MM-DD HH:MM' });
    return h('input', { ...base, type: 'text', value: val ?? '' });
  }
  function collect(form, fields) {
    const out = {};
    for (const [name, sp] of Object.entries(fields)) {
      const el = form.elements[name]; if (!el) continue; const { t } = spec(sp);
      if (t === 'b') out[name] = el.checked ? 1 : 0;
      else if (t === 'i' || t === 'r') { if (el.value !== '') out[name] = Number(el.value); }
      else out[name] = el.value.trim();
    }
    return out;
  }
  function tagEditor(initial, onChange) {
    let items = [...initial]; const box = h('div', { class: 'taglist' }); const inp = h('input', { placeholder: 'مورد جدید و Enter', class: 'grow' });
    const draw = () => { MM.mount(box, items.map((t, i) => h('span', { class: 'tag' }, t, ' ', h('button', { type: 'button', 'aria-label': 'حذف ' + t, onclick: () => { items.splice(i, 1); draw(); onChange && onChange(); } }, '×')))); };
    const add = () => { const v = inp.value.trim(); if (v && !items.includes(v)) { items.push(v); inp.value = ''; draw(); onChange && onChange(); } };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    draw(); return { el: h('div', null, box, h('div', { class: 'row' }, inp, MM.btn('افزودن', add, 'sm'))), get: () => items };
  }

  // ---------- تنظیمات سایت (گروه‌بندی‌شده + ویرایشگر لیست) ----------
  page('/r/site_settings', 'تنظیمات سایت', async () => {
    const { items } = await MM.get('/api/admin/site_settings?size=100'); const groups = {};
    items.forEach(s => (groups[s.group_name || 'عمومی'] ||= []).push(s));
    const wrap = h('div', { class: 'page' }, h('div', { class: 'row between' }, h('h1', null, 'تنظیمات سایت'), MM.link('افزودن تنظیم جدید', '#/r/site_settings/new', 'btn sm')));
    for (const [g, arr] of Object.entries(groups)) {
      const getters = {};
      const rows = arr.map(s => {
        const v = s.setting_value ?? ''; const parsed = String(v).trim().startsWith('[') ? MM.parse(v, null) : null;
        let ctl;
        if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) { const ed = tagEditor(parsed); getters[s.setting_key] = () => JSON.stringify(ed.get()); ctl = ed.el; }
        else { const big = String(v).length > 80 || String(v).includes('\n'); const el = h(big ? 'textarea' : 'input', { rows: 4, value: big ? null : v, class: /^[\[{]/.test(String(v).trim()) ? 'ltr' : '' }, big ? v : null); getters[s.setting_key] = () => el.value; ctl = el; }
        return MM.field((s.label || s.setting_key) + '  (' + s.setting_key + ')', ctl, s.is_public ? 'عمومی: در سایت دیده می‌شود' : 'خصوصی');
      });
      wrap.appendChild(MM.card('', h('h2', null, g), rows, MM.btn('ذخیره‌ی گروه «' + g + '»', (e) => MM.busy(e.target, async () => {
        for (const s of arr) { const nv = getters[s.setting_key](); if (nv === (s.setting_value ?? '')) continue; if (/^\s*[\[{]/.test(nv)) { try { JSON.parse(nv); } catch { throw new Error('ساختار JSON در «' + (s.label || s.setting_key) + '» درست نیست.'); } } await MM.put('/api/admin/site_settings/' + enc(s.setting_key), { setting_value: nv }); s.setting_value = nv; }
        MM.toast('ذخیره شد.'); }), 'primary')));
    }
    return wrap;
  });

  // ---------- ساخت کاربر کارمند ----------
  page('/staff-new', 'کاربر جدید', async () => {
    const f = h('form', { class: 'card narrow stack', onsubmit: (e) => { e.preventDefault(); MM.busy(f.querySelector('button'), async () => { await MM.post('/api/admin/users-create', MM.formData(f)); MM.toast('ساخته شد.'); location.hash = '#/r/users'; }); } },
      h('h1', null, 'افزودن کاربر'), MM.field('نام', h('input', { name: 'name', required: true })), MM.field('ایمیل', h('input', { name: 'email', type: 'email', required: true, class: 'ltr' })),
      MM.field('رمز عبور', h('input', { name: 'password', type: 'password', required: true, class: 'ltr' }), 'حداقل ۸ نویسه و شامل حرف و عدد'),
      MM.field('نقش', MM.select('role', ['editor', 'admin', 'counselor', 'professional', 'mentor', 'coach', 'student'].map(r => [r, (MM.typeLabel[r] || (r === 'editor' ? 'ویراستار' : r === 'admin' ? 'مدیر' : r === 'student' ? 'دانش‌آموز' : r))]), 'editor')),
      h('button', { class: 'btn primary', type: 'submit' }, 'ساخت'));
    return f;
  });
  page('/users/:id', 'کاربر', async ({ params }) => {
    const d = await MM.get(`/api/admin/users/${params.id}/summary`); const u = d.user || d.item || d; const pw = h('input', { type: 'password', class: 'ltr', placeholder: 'رمز جدید' });
    return h('div', { class: 'page narrow' }, MM.link('← کاربران', '#/r/users', 'btn sm'), h('h1', null, u.name || 'کاربر'),
      MM.card('', h('ul', null, ['email', 'phone', 'role', 'status', 'created_at', 'last_login_at'].filter(k => u[k]).map(k => h('li', null, L(k) + ': ' + (k.endsWith('_at') ? MM.dt(u[k]) : SL(u[k])))),
        d.profile ? h('li', null, 'پایه/رشته/شهر: ' + [d.profile.grade, d.profile.field_of_study, d.profile.city].filter(Boolean).join(' • ')) : null,
        d.tests != null ? h('li', null, 'آزمون‌های انجام‌شده: ' + MM.fa(d.tests)) : null, d.goals != null ? h('li', null, 'هدف‌ها: ' + MM.fa(d.goals)) : null, d.requests != null ? h('li', null, 'درخواست‌های مشاوره: ' + MM.fa(d.requests)) : null),
        h('div', { class: 'row' }, MM.link('ویرایش نقش/وضعیت', '#/r/users/' + params.id, 'btn'))),
      MM.card('', h('h3', null, 'بازنشانی رمز عبور'), h('p', { class: 'small muted' }, 'همه‌ی نشست‌های فعال این کاربر بسته می‌شود.'), h('div', { class: 'row' }, pw, MM.btn('ثبت رمز جدید', (e) => MM.busy(e.target, async () => { await MM.post(`/api/admin/users/${params.id}/reset-password`, { password: pw.value }); pw.value = ''; MM.toast('رمز تغییر کرد.'); })))));
  });

  // ---------- سازنده‌ی آزمون ----------
  page('/tests/:id/builder', 'سازنده‌ی آزمون', async ({ params }) => {
    const d = await MM.get(`/api/admin/tests/${params.id}/full`);     const optsBox = h('div'); const opts = [];
    const addOpt = (t = '', sc = '') => { const oi = h('input', { placeholder: 'متن گزینه' }); const si = h('input', { type: 'number', step: 'any', placeholder: 'امتیاز', class: 'ltr' }); oi.value = t; si.value = sc; const rec = { oi, si };
      const row = h('div', { class: 'opt-row' }, oi, si, MM.btn('حذف', () => { row.remove(); const i = opts.indexOf(rec); if (i >= 0) opts.splice(i, 1); }, 'sm')); opts.push(rec); optsBox.appendChild(row); };
    [['اصلاً', 0], ['کم', 1], ['تا حدی', 2], ['زیاد', 3], ['خیلی زیاد', 4]].forEach(([t, s]) => addOpt(t, s));
    const cat = h('select', { name: 'category_code' }, d.categories.map(c => h('option', { value: c.code }, c.code + ' — ' + c.title)));
    const qt = h('textarea', { rows: 3, placeholder: 'متن سؤال' });
    const add = MM.btn('افزودن سؤال', (e) => MM.busy(e.target, async () => {
      const options = opts.map(r => ({ o_text: r.oi.value.trim(), score: Number(r.si.value) }));
      await MM.post('/api/admin/questions-with-options', { test_id: Number(params.id), category_code: cat.value, q_text: qt.value.trim(), options }); MM.toast('سؤال افزوده شد.'); MM.navigate(); }), 'primary');
    return h('div', { class: 'page' }, MM.link('← آزمون‌ها', '#/r/tests', 'btn sm'), h('h1', null, d.test.title),
      h('p', { class: 'muted' }, 'نوع: ' + d.test.kind + ' • ' + MM.fa(d.questions.length) + ' سؤال • ' + MM.fa(d.categories.length) + ' دسته'),
      MM.card('', h('h2', null, 'دسته‌ها و پیشنهادها'), h('ul', null, d.categories.map(c => h('li', null, c.code + ' — ' + c.title + ' ', MM.link('ویرایش', '#/r/test_categories/' + c.id, 'btn sm')))), MM.link('همه‌ی دسته‌های این آزمون', '#/r/test_categories?test_id=' + params.id, 'btn sm')),
      MM.card('', h('h2', null, 'سؤال جدید'), MM.field('دسته', cat), MM.field('سؤال', qt), h('h4', null, 'گزینه‌ها و امتیازها'), optsBox, h('div', { class: 'row' }, MM.btn('+ گزینه', () => addOpt(), 'sm'), add)),
      h('h2', null, 'سؤال‌ها'), d.questions.map((q, i) => h('div', { class: 'q-item' }, h('div', { class: 'row between' }, h('strong', null, MM.fa(i + 1) + '. ' + q.q_text), h('span', { class: 'small muted' }, q.category_code)),
        h('ol', null, q.options.map(o => h('li', null, o.o_text + '  (' + o.score + ')'))),
        h('div', { class: 'row' }, MM.link('ویرایش', '#/r/questions/' + q.id, 'btn sm'), MM.btn('حذف', async () => { if (await MM.confirm('این سؤال و گزینه‌هایش حذف شود؟')) { try { await MM.del('/api/admin/questions/' + q.id); MM.toast('حذف شد.'); MM.navigate(); } catch (e) { MM.err(e); } } }, 'sm danger')))));
  });

  // ---------- فرم ایجاد/ویرایش عمومی ----------
  const resOf = (key) => { const r = META.resources.find(x => x.key === key); if (!r) throw new Error('این بخش وجود ندارد یا دسترسی نداری.'); return r; };
  async function formPage(key, id) {
    const r = resOf(key); if (r.ro) throw new Error('این بخش فقط‌خواندنی است.');
    let row = {}; if (r.single) { const l = await MM.get(`/api/admin/${key}`); row = l.items[0] || {}; } else if (id) row = (await MM.get(`/api/admin/${key}/${enc(id)}`)).item;
    const f = h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); MM.busy(f.querySelector('button[type=submit]'), async () => {
      const body = collect(f, r.fields);
      if (r.single) await MM.put(`/api/admin/${key}/1`, body); else if (id) await MM.put(`/api/admin/${key}/${enc(id)}`, body); else await MM.post(`/api/admin/${key}`, body);
      MM.toast('ذخیره شد.'); if (r.single) MM.navigate(); else history.length > 1 ? history.back() : (location.hash = '#/r/' + key); }); } },
      h('div', { class: 'form-grid' }, Object.entries(r.fields).map(([n, sp]) => { const { t, req } = spec(sp); const ctl = inputFor(n, sp, row[n]); return h('div', { class: FULL.has(t) ? 'full' : '' }, t === 'b' ? h('label', { class: 'row' }, ctl, L(n)) : MM.field(L(n) + (req ? ' *' : ''), ctl)); })),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'ذخیره'), r.single ? null : MM.btn('انصراف', () => history.back())));
    return h('div', { class: 'page' }, MM.link('← ' + r.label, '#/r/' + key, 'btn sm'), h('h1', null, (id ? 'ویرایش ' : r.single ? '' : 'افزودن ') + r.label), f);
  }
  page('/r/:res/new', 'افزودن', ({ params }) => formPage(params.res, null));
  page('/r/:res/:id', 'ویرایش', ({ params }) => formPage(params.res, params.id));

  // ---------- فهرست عمومی ----------
  const FILTER_ENUM = { status: { payments: ['pending', 'approved', 'rejected'], consultation_requests: Object.keys(TRANS), coaching_programs: ['active', 'paused', 'completed', 'cancelled'] } };
  page('/r/:res', 'فهرست', async ({ params, query }) => {
    const r = resOf(params.res); if (r.single) return formPage(params.res, null);
    const st = { page: 1, q: '', f: {} }; (r.filters || []).forEach(k => { if (query[k] !== undefined) st.f[k] = query[k]; });
    const wrap = h('div', { class: 'page' }); const tableBox = h('div'); const pager = h('div', { class: 'row' });
    const load = async () => {
      const qs = new URLSearchParams({ page: st.page, size: 25 }); if (st.q) qs.set('q', st.q); Object.entries(st.f).forEach(([k, v]) => v !== '' && qs.set(k, v));
      const d = await MM.get(`/api/admin/${r.key}?${qs}`); const items = d.items;
      let cols; if (r.fields) { const tcol = r.title; cols = [r.pk || 'id']; for (const [n, sp] of Object.entries(r.fields)) { const { t } = spec(sp); if (['t', 's', 'i', 'e', 'b', 'd', 'r'].includes(t) && cols.length < 6 && !cols.includes(n)) cols.push(n); } if (tcol && !cols.includes(tcol)) cols.splice(1, 0, tcol); }
      else cols = items[0] ? Object.keys(items[0]).filter(k => typeof items[0][k] !== 'string' || items[0][k].length < 90).slice(0, 9) : [];
      const cell = (row, k) => { const v = row[k]; if (/^is_|^(receipt_required)$/.test(k) || (r.fields && r.fields[k] && spec(r.fields[k]).t === 'b')) return v ? '✓' : '—'; if (/_at$|^start_at$|^end_at$/.test(k)) return MM.dt(v); if (k === 'status' || (r.fields && r.fields[k] && spec(r.fields[k]).t === 'e')) return SL(v); return short(v, 48); };
      const act = (row) => {
        const id = pk(r, row); const a = [];
        if (!r.ro) a.push(MM.link('ویرایش', `#/r/${r.key}/${enc(id)}`, 'btn sm'));
        if (!r.ro && (r.pub || (r.fields && r.fields.is_active))) a.push(MM.btn('روشن/خاموش', (e) => MM.busy(e.target, async () => { await MM.post(`/api/admin/${r.key}/${enc(id)}/toggle`); MM.toast('انجام شد.'); await load(); }), 'sm'));
        if (r.key === 'tests') a.push(MM.link('سازنده‌ی سؤال‌ها', `#/tests/${id}/builder`, 'btn sm primary'));
        if (r.key === 'users') a.push(MM.link('پرونده', `#/users/${id}`, 'btn sm'));
        if (r.key === 'providers') { a.push(MM.btn('تأیید', (e) => MM.busy(e.target, async () => { await MM.put(`/api/admin/providers/${id}`, { status: 'approved' }); try { await MM.post(`/api/admin/providers/${id}/generate-slots`); } catch { /* اختیاری */ } MM.toast('تأیید شد.'); await load(); }), 'sm')); a.push(MM.btn('غیرفعال', (e) => MM.busy(e.target, async () => { await MM.put(`/api/admin/providers/${id}`, { status: 'disabled' }); await load(); }), 'sm')); a.push(MM.btn('ساخت نوبت‌ها', (e) => MM.busy(e.target, async () => { const x = await MM.post(`/api/admin/providers/${id}/generate-slots`); MM.toast(MM.fa(x.generated) + ' نوبت ساخته شد.'); }), 'sm')); }
        if (r.key === 'payments' && row.status === 'pending') a.push(MM.link('بررسی', '#/queue', 'btn sm primary'));
        if (r.key === 'consultation_requests' && (TRANS[row.status] || []).length) a.push(MM.btn('تغییر وضعیت', () => { const sel = MM.select('to', TRANS[row.status].map(s => [s, SL(s)])); const m = MM.modal('تغییر وضعیت درخواست ' + MM.fa(id), h('div', null, MM.field('وضعیت جدید', sel)), [MM.btn('ثبت', async () => { try { await MM.post(`/api/admin/requests/${id}/transition`, { to: sel.value }); m.close(); MM.toast('انجام شد.'); await load(); } catch (e) { MM.err(e); } }, 'primary')]); }, 'sm'));
        if (!r.ro) a.push(MM.btn('حذف', async () => { if (await MM.confirm('این مورد حذف شود؟ این کار قابل بازگشت نیست.')) { try { await MM.del(`/api/admin/${r.key}/${enc(id)}`); MM.toast('حذف شد.'); await load(); } catch (e) { MM.err(e); } } }, 'sm danger'));
        return h('div', { class: 'row' }, a);
      };
      MM.mount(tableBox, items.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'عملیات'), cols.map(c => h('th', null, L(c))))),
        h('tbody', null, items.map(row => h('tr', null, h('td', { class: 'act' }, act(row)), cols.map(c => h('td', { title: String(row[c] ?? '') }, cell(row, c)))))))) : MM.empty('موردی پیدا نشد'));
      const pages = Math.max(1, Math.ceil(d.total / 25));
      MM.mount(pager, h('span', { class: 'muted small' }, MM.fa(d.total) + ' مورد • صفحه‌ی ' + MM.fa(st.page) + ' از ' + MM.fa(pages)), st.page > 1 ? MM.btn('قبلی', () => { st.page--; load().catch(MM.err); }, 'sm') : null, st.page < pages ? MM.btn('بعدی', () => { st.page++; load().catch(MM.err); }, 'sm') : null);
    };
    const bar = h('div', { class: 'row' });
    if (r.search) { let t; bar.appendChild(h('input', { type: 'search', placeholder: 'جست‌وجو…', 'aria-label': 'جست‌وجو', oninput: (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); st.page = 1; load().catch(MM.err); }, 300); } })); }
    (r.filters || []).forEach(k => {
      const en = (r.fields && r.fields[k] && spec(r.fields[k]).opts) || (FILTER_ENUM[k] && FILTER_ENUM[k][r.key]);
      const ctl = en ? h('select', { 'aria-label': L(k), onchange: (e) => { st.f[k] = e.target.value; st.page = 1; load().catch(MM.err); } }, h('option', { value: '' }, L(k) + ': همه'), en.map(o => h('option', { value: o, selected: st.f[k] === o }, SL(o))))
        : h('input', { placeholder: L(k), 'aria-label': L(k), class: 'ltr', style: 'width:8rem', value: st.f[k] ?? '', onchange: (e) => { st.f[k] = e.target.value.trim(); st.page = 1; load().catch(MM.err); } });
      bar.appendChild(ctl);
    });
    wrap.appendChild(h('div', { class: 'row between' }, h('h1', null, r.label), h('div', { class: 'row' }, r.key === 'users' ? MM.link('افزودن کاربر/کارمند', '#/staff-new', 'btn primary sm') : null, !r.ro && !r.noCreate ? MM.link('افزودن', `#/r/${r.key}/new`, 'btn primary sm') : null)));
    wrap.appendChild(bar); wrap.appendChild(tableBox); wrap.appendChild(pager);
    await load(); return wrap;
  });

  window.addEventListener('hashchange', MM.navigate);
  MM.navigate();
})();
