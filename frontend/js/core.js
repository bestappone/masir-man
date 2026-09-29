/* هسته‌ی برنامه: ساخت DOM امن، API، مسیریاب، اعلان‌ها، ابزارها
   نکته‌ی امنیتی: هیچ داده‌ای با innerHTML وارد صفحه نمی‌شود (جلوگیری از XSS). */
(function () {
  const MM = (window.MM = {});
  const cfg = window.MM_CONFIG || {};

  // ---------- ساخت DOM ----------
  MM.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required') { if (v) el[k] = true; }
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else if (c instanceof Node) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  };
  const h = MM.h;
  MM.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  MM.mount = (el, ...kids) => { MM.clear(el); kids.flat().forEach(k => k && el.appendChild(k)); };

  // ---------- قالب‌بندی ----------
  MM.fa = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('fa-IR'));
  MM.money = (n) => (n ? MM.fa(n) + ' تومان' : 'رایگان');
  MM.dt = (s) => {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T') + (String(s).length <= 16 && !String(s).endsWith('Z') ? ':00' : ''));
    if (isNaN(d)) return String(s);
    try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: String(s).length > 10 ? 'short' : undefined }).format(d); } catch { return String(s); }
  };
  MM.dateOnly = (s) => { if (!s) return ''; try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium' }).format(new Date(String(s).slice(0, 10) + 'T00:00:00')); } catch { return s; } };
  MM.csv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  MM.lines = (s) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  MM.parse = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch { return fb; } };
  MM.weekdays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  MM.modeLabel = { chat: 'چت', phone: 'تماس تلفنی', in_person: 'حضوری', video: 'ویدیو' };
  MM.typeLabel = { counselor: 'مشاور تحصیلی', professional: 'متخصص شغل', mentor: 'منتور', coach: 'کوچ' };
  MM.statusLabel = { draft: 'پیش‌نویس', requested: 'ثبت‌شده', pending_payment: 'در انتظار پرداخت', payment_submitted: 'پرداخت در حال بررسی', approved: 'تأییدشده', active: 'فعال', completed: 'تکمیل‌شده', rejected: 'ردشده', cancelled: 'لغوشده', paused: 'متوقف', pending: 'در انتظار', disabled: 'غیرفعال' };
  MM.serviceLabel = { counseling: 'مشاوره‌ی تحصیلی', mentoring: 'منتورینگ', coaching: 'جلسه‌ی کوچینگ', professional: 'مشاوره‌ی متخصص', package: 'بسته‌ی کوچینگ', group: 'کوچینگ گروهی' };

  // ---------- API ----------
  MM.token = () => localStorage.getItem('mm_token');
  MM.setSession = (token, user) => { localStorage.setItem('mm_token', token); localStorage.setItem('mm_user', JSON.stringify(user)); MM.user = user; };
  MM.user = MM.parse(localStorage.getItem('mm_user'), null);
  MM.logoutLocal = () => { localStorage.removeItem('mm_token'); localStorage.removeItem('mm_user'); MM.user = null; };
  MM.base = () => String(cfg.API_BASE || '').replace(/\/+$/, '');
  MM.api = async function (path, opts = {}) {
    const headers = { 'content-type': 'application/json' };
    if (MM.token()) headers.authorization = 'Bearer ' + MM.token();
    let res;
    try {
      res = await fetch(MM.base() + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch {
      const e = new Error('اتصال به سرور برقرار نشد. اینترنت یا آدرس API را بررسی کن.'); e.network = true; throw e;
    }
    let data = null; try { data = await res.json(); } catch { /* پاسخ خالی */ }
    if (!res.ok) {
      if (res.status === 401 && MM.token()) { MM.logoutLocal(); MM.renderNav && MM.renderNav(); }
      const e = new Error((data && data.error) || (data && data.message) || 'خطایی رخ داد.'); e.status = res.status; e.data = data; throw e;
    }
    return data;
  };
  MM.get = (p) => MM.api(p);
  MM.post = (p, body) => MM.api(p, { method: 'POST', body: body || {} });
  MM.put = (p, body) => MM.api(p, { method: 'PUT', body: body || {} });
  MM.del = (p) => MM.api(p, { method: 'DELETE' });

  // ---------- اعلان ----------
  MM.toast = function (msg, type = 'ok') {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(box); }
    const t = h('div', { class: 'toast ' + type, role: 'status' }, msg);
    box.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 5000 : 2800);
  };
  MM.err = (e) => MM.toast(e && e.message ? e.message : 'خطایی رخ داد.', 'err');

  // ---------- بخش‌های آماده‌ی UI ----------
  MM.loading = (txt = 'در حال بارگذاری…') => h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner' }), txt);
  MM.empty = (title, text, action) => h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, '🗂'), h('h3', null, title), text ? h('p', { class: 'muted' }, text) : null, action || null);
  MM.errorBox = (e, retry) => h('div', { class: 'errbox' }, h('p', null, e.message || 'خطایی رخ داد.'), retry ? h('button', { class: 'btn', onclick: retry }, 'تلاش دوباره') : null);
  MM.btn = (text, onclick, cls = '') => h('button', { class: 'btn ' + cls, onclick, type: 'button' }, text);
  MM.link = (text, href, cls = 'btn') => h('a', { class: cls, href }, text);
  MM.badge = (text, cls = '') => h('span', { class: 'badge ' + cls }, text);
  MM.progress = (pct, label) => h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { class: 'bar', style: `width:${Math.min(100, Math.max(0, pct || 0))}%` }), h('span', null, label || (MM.fa(pct || 0) + '٪')));
  MM.card = (cls, ...kids) => h('section', { class: 'card ' + (cls || '') }, kids);
  MM.field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
  MM.select = (name, options, value) => h('select', { name }, options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) }, t); }));
  MM.formData = (form) => Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

  // متن ساده‌ی چندخطی → عناصر امن (پاراگراف، تیتر ##، لیست -)
  MM.richText = function (text) {
    const out = []; let list = null;
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      if (!line) { list = null; continue; }
      if (line.startsWith('## ')) { list = null; out.push(h('h3', null, line.slice(3))); }
      else if (line.startsWith('# ')) { list = null; out.push(h('h2', null, line.slice(2))); }
      else if (/^[-•*] /.test(line)) { if (!list) { list = h('ul'); out.push(list); } list.appendChild(h('li', null, line.slice(2))); }
      else { list = null; out.push(h('p', null, line)); }
    }
    return h('div', { class: 'rich' }, out);
  };
  MM.bullets = (text) => { const l = MM.lines(text); return l.length ? h('ul', { class: 'bullets' }, l.map(x => h('li', null, x.replace(/^[-•*]\s*/, '')))) : null; };
  MM.tags = (csvText) => h('div', { class: 'tags' }, MM.csv(csvText).map(t => h('span', { class: 'tag' }, t)));

  // مودال عمومی پرداخت کارت‌به‌کارت — برای هر درخواست/خرید با id و مبلغ نهایی؛ onDone بعد از ثبت موفق صدا زده می‌شود
  MM.paymentModal = async function (requestId, finalAmount, onDone) {
    let info; try { info = (await MM.get('/api/payment-info')).payment || {}; } catch (e) { return MM.err(e); }
    const f = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() },
      h('div', { class: 'card flat' },
        h('p', null, 'مبلغ قابل پرداخت: ', h('strong', null, MM.money(finalAmount))),
        info.card_number ? h('p', null, 'شماره کارت: ', h('strong', { dir: 'ltr', class: 'mono' }, info.card_number)) : h('p', { class: 'muted' }, 'اطلاعات کارت هنوز توسط مدیر ثبت نشده است.'),
        info.card_owner ? h('p', null, 'به نام: ', h('strong', null, info.card_owner), info.bank_name ? ' (' + info.bank_name + ')' : '') : null,
        info.instructions ? MM.richText(info.instructions) : null,
        info.rules ? h('details', null, h('summary', null, 'قوانین پرداخت'), MM.richText(info.rules)) : null),
      MM.field('مبلغ واریزشده (تومان)', h('input', { name: 'amount', type: 'number', inputmode: 'numeric', required: true, value: finalAmount || '' })),
      MM.field('شماره پیگیری', h('input', { name: 'tracking_code', required: true, maxlength: 40, dir: 'ltr' })),
      MM.field('لینک تصویر رسید' + (info.receipt_required ? ' (الزامی)' : ' (اختیاری)'), h('input', { name: 'receipt_url', type: 'url', dir: 'ltr', placeholder: 'https://', required: !!info.receipt_required }), 'تصویر را در یک سرویس اشتراک‌گذاری بارگذاری و لینک آن را اینجا بگذار.'));
    const m = MM.modal('ثبت پرداخت کارت‌به‌کارت', f, [
      MM.btn('ثبت پرداخت', (e) => MM.busy(e.target, async () => {
        const d = MM.formData(f); if (!d.amount || !d.tracking_code) throw new Error('مبلغ و شماره پیگیری را وارد کن.');
        await MM.post('/api/requests/' + requestId + '/payment', { amount: Number(d.amount), tracking_code: d.tracking_code, receipt_url: d.receipt_url || undefined });
        m.close(); MM.toast('پرداخت ثبت شد و در انتظار تأیید مدیر است.'); onDone && onDone();
      }), 'primary'), MM.btn('بعداً', () => m.close())]);
  };

  MM.modal = function (title, body, actions) {
    const close = () => { ov.remove(); document.body.classList.remove('noscroll'); };
    const ov = h('div', { class: 'overlay', onclick: (e) => { if (e.target === ov) close(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'بستن' }, '✕')),
        h('div', { class: 'modal-body' }, body), actions ? h('div', { class: 'modal-foot' }, actions) : null));
    document.body.appendChild(ov); document.body.classList.add('noscroll'); return { close, el: ov };
  };
  MM.confirm = (text) => new Promise((res) => {
    const m = MM.modal('تأیید', h('p', null, text), [MM.btn('بله، انجام شود', () => { m.close(); res(true); }, 'primary'), MM.btn('انصراف', () => { m.close(); res(false); })]);
  });

  // دکمه‌ی با حالت در حال انجام (جلوگیری از کلیک دوباره)
  MM.busy = async function (btn, fn) {
    if (btn.disabled) return; const old = btn.textContent; btn.disabled = true; btn.textContent = 'صبر کن…';
    try { return await fn(); } catch (e) { MM.err(e); } finally { btn.disabled = false; btn.textContent = old; }
  };

  // ---------- مسیریاب (hash) ----------
  const routes = []; MM.routes = routes;
  MM.route = (pattern, title, render, opts = {}) => {
    const keys = []; const rx = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ rx, keys, title, render, auth: !!opts.auth });
  };
  MM.parseHash = () => {
    const raw = location.hash.replace(/^#/, '') || '/'; const [path, qs] = raw.split('?');
    return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
  };
  MM.go = (p) => { location.hash = '#' + p; };
  let token = 0;
  MM.navigate = async function () {
    const { path, query } = MM.parseHash(); const view = document.getElementById('view'); const my = ++token;
    for (const r of routes) {
      const m = r.rx.exec(path); if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      document.title = (r.title ? r.title + ' | ' : '') + (MM.siteName || cfg.SITE_NAME_FALLBACK || 'مسیر من');
      MM.setActive(path);
      if (r.auth && !MM.token()) { sessionStorage.setItem('mm_after', location.hash); MM.toast('برای ادامه وارد حساب خودت شو.', 'err'); return MM.go('/login'); }
      MM.mount(view, MM.loading());
      try { const node = await r.render({ params, query, path }); if (my !== token) return; MM.mount(view, node); window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
      catch (e) { if (my !== token) return; MM.mount(view, MM.errorBox(e, MM.navigate)); }
      return;
    }
    document.title = 'پیدا نشد | ' + (MM.siteName || 'مسیر من');
    MM.mount(view, MM.empty('صفحه پیدا نشد', 'آدرس را بررسی کن یا به خانه برگرد.', MM.link('بازگشت به خانه', '#/', 'btn primary')));
  };

  // ---------- تنظیمات سایت (از دیتابیس) ----------
  MM.settings = {};
  MM.loadSettings = async () => { try { MM.settings = (await MM.get('/api/settings')).settings || {}; MM.siteName = MM.settings.site_name || cfg.SITE_NAME_FALLBACK; } catch { MM.siteName = cfg.SITE_NAME_FALLBACK; } };
  MM.S = (k, fb = '') => (MM.settings[k] !== undefined && MM.settings[k] !== '' ? MM.settings[k] : fb);
})();
