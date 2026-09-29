/* مشاوره، کوچ، منتور، متخصص: مرور، رزرو، پرداخت کارت‌به‌کارت، درخواست‌های من، پنل ارائه‌دهنده */
(function () {
  const { h } = MM;
  const PAID = () => MM.S('paid_notice', 'این خدمت پولی است.');
  const T2S = { counselor: 'counseling', mentor: 'mentoring', coach: 'coaching', professional: 'professional' };
  const TYPES = [['', 'همه'], ['counselor', 'مشاور تحصیلی'], ['professional', 'متخصص شغل'], ['mentor', 'منتور'], ['coach', 'کوچ']];
  const paidBox = () => h('div', { class: 'notice warn', role: 'note' }, h('strong', null, '💳 ' + PAID()));

  function explainer() {
    const x = MM.parse(MM.S('service_explain', '{}'), {});
    return h('div', { class: 'grid g3' }, ['counselor', 'mentor', 'coach'].filter(k => x[k]).map(k => h('div', { class: 'card flat' }, h('p', null, x[k]))));
  }

  // ---------- کارت ارائه‌دهنده ----------
  function providerCard(p) {
    return h('article', { class: 'card provider' },
      h('div', { class: 'row' },
        p.photo_url ? h('img', { class: 'avatar', src: p.photo_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: 'avatar ph' }, (p.name || '?').slice(0, 1)),
        h('div', { class: 'grow' }, h('h3', null, p.name), h('div', { class: 'small muted' }, MM.typeLabel[p.provider_type] || '', p.city ? ' · ' + p.city : ''))),
      h('p', { class: 'small' }, p.specialty || ''),
      h('div', { class: 'row between small' }, h('span', null, MM.fa(p.duration_min || 60) + ' دقیقه'), h('strong', null, MM.money(p.price))),
      h('div', { class: 'tags' }, (p.modes || []).map(m => h('span', { class: 'tag' }, MM.modeLabel[m] || m))),
      MM.link('مشاهده و رزرو', '#/consult/provider/' + p.id, 'btn primary block'));
  }

  // ---------- پرداخت ----------
  function paymentModal(req) { return MM.paymentModal(req.id, req.final_amount, () => { MM.go('/requests'); MM.navigate(); }); }

  // ---------- رزرو / ثبت‌نام (پولی) ----------
  function bookModal(opt) {
    // opt: {service_type, provider, package, group}
    const p = opt.provider; const slots = opt.slots || [];
    const f = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() });
    f.appendChild(paidBox());
    const title = opt.package ? opt.package.title : opt.group ? opt.group.title : p.name;
    const price = opt.package ? opt.package.price : opt.group ? opt.group.price : p.price;
    f.appendChild(h('div', { class: 'card flat' }, h('p', null, h('strong', null, 'خدمت: '), MM.serviceLabel[opt.service_type] || ''), h('p', null, h('strong', null, 'مورد: '), title),
      p && !opt.package ? h('p', null, h('strong', null, 'تخصص: '), p.specialty || '') : null,
      p && !opt.package ? h('p', null, h('strong', null, 'مدت: '), MM.fa(p.duration_min || 60) + ' دقیقه') : null,
      h('p', null, h('strong', null, 'قیمت: '), MM.money(price)),
      opt.group ? h('p', { class: 'small muted' }, opt.group.rules || '') : null));
    if (p && !opt.package && !opt.group) {
      f.appendChild(MM.field('روش ارتباط', MM.select('mode', (p.modes || []).map(m => [m, MM.modeLabel[m] || m])), 'برای کاربران زیر ۱۸ سال فقط چت و تلفن مجاز است.'));
      f.appendChild(MM.field('زمان جلسه', slots.length ? MM.select('slot_id', slots.map(s => [s.id, MM.dt(s.start_at)])) : h('p', { class: 'muted small' }, 'فعلاً زمان آزادی ثبت نشده است.')));
    }
    f.appendChild(MM.field('توضیح کوتاه (اختیاری)', h('textarea', { name: 'note', rows: 3, maxlength: 500, placeholder: 'فقط اطلاعات لازم را بنویس؛ اطلاعات شخصی و حساس ننویس.' })));
    f.appendChild(MM.field('کد تخفیف (اختیاری)', h('input', { name: 'coupon_code', dir: 'ltr', maxlength: 30 })));
    f.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'accept_paid' }), ' می‌دانم که این خدمت پولی است و پرداخت به‌صورت کارت‌به‌کارت انجام می‌شود.'));
    f.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'parent_consent' }), ' اگر زیر ۱۸ سال هستم، والدینم از این درخواست آگاه‌اند و رضایت دارند.'));
    const m = MM.modal('درخواست خدمت پولی', f, [MM.btn('ثبت درخواست', (e) => MM.busy(e.target, async () => {
      const d = MM.formData(f);
      if (!f.elements.accept_paid.checked) throw new Error('برای ادامه باید تأیید کنی که این خدمت پولی است.');
      const body = { service_type: opt.service_type, accept_paid: true, parent_consent: f.elements.parent_consent.checked, note: d.note || undefined, coupon_code: d.coupon_code || undefined };
      if (p) body.provider_id = p.id; if (opt.package) body.package_id = opt.package.id; if (opt.group) body.group_program_id = opt.group.id;
      if (d.mode) body.mode = d.mode; if (d.slot_id) body.slot_id = Number(d.slot_id);
      if (p && !opt.package && !opt.group && !body.slot_id) throw new Error('یک زمان انتخاب کن.');
      const r = await MM.post('/api/requests', body); m.close(); MM.toast('درخواست ثبت شد. مرحله‌ی بعد: پرداخت.'); paymentModal(r);
    }), 'primary'), MM.btn('انصراف', () => m.close())]);
  }
  function needLogin() { sessionStorage.setItem('mm_after', location.hash); MM.toast('برای ثبت درخواست وارد شو.', 'err'); MM.go('/login'); }

  // ---------- صفحه‌ی مشاوره ----------
  MM.route('/consult', 'مشاوره', async ({ query }) => {
    const type = query.type || ''; const q = query.q || '';
    const qs = new URLSearchParams(); if (type) qs.set('type', type); if (q) qs.set('q', q);
    const [pr, pk] = await Promise.all([MM.get('/api/providers?' + qs), MM.get('/api/packages')]);
    const search = h('input', { type: 'search', value: q, placeholder: 'جست‌وجوی نام یا تخصص…', 'aria-label': 'جست‌وجو', onkeydown: (e) => { if (e.key === 'Enter') MM.go('/consult?type=' + type + '&q=' + encodeURIComponent(e.target.value)); } });
    return h('div', { class: 'page' },
      h('h1', null, 'مشاوره، منتورینگ و کوچینگ'), paidBox(), explainer(),
      MM.token() ? h('div', { class: 'row' }, MM.link('درخواست‌های من', '#/requests', 'btn'), MM.link('پنل ارائه‌دهنده', '#/provider', 'btn')) : null,
      h('div', { class: 'chips', role: 'tablist' }, TYPES.map(([v, l]) => h('a', { class: 'chip' + (v === type ? ' on' : ''), href: '#/consult' + (v ? '?type=' + v : '') }, l))), search,
      pr.items.length ? h('div', { class: 'grid g3' }, pr.items.map(providerCard)) : MM.empty('موردی پیدا نشد', 'فیلتر را تغییر بده.'),
      pk.packages.length ? h('div', null, h('h2', null, 'بسته‌های کوچینگ'), h('div', { class: 'grid g3' }, pk.packages.map(x => MM.card('', h('h3', null, x.title), h('p', { class: 'small' }, x.description || ''), h('p', { class: 'small muted' }, MM.fa(x.sessions_count) + ' جلسه · ' + MM.fa(x.weeks) + ' هفته'), h('strong', null, MM.money(x.price)), MM.btn('دریافت بسته', () => MM.token() ? bookModal({ service_type: 'package', package: x }) : needLogin(), 'primary block'))))) : null,
      pk.groups.length ? h('div', null, h('h2', null, 'کوچینگ گروهی'), h('div', { class: 'grid g3' }, pk.groups.map(g => MM.card('', h('h3', null, g.title), h('p', { class: 'small' }, g.description || ''), h('p', { class: 'small muted' }, `ظرفیت: ${MM.fa(g.members)} از ${MM.fa(g.capacity)} · ${MM.fa(g.weeks)} هفته${g.coach_name ? ' · کوچ: ' + g.coach_name : ''}`), g.start_date ? h('p', { class: 'small muted' }, 'شروع: ' + MM.dateOnly(g.start_date)) : null, h('strong', null, MM.money(g.price)), MM.btn(g.members >= g.capacity ? 'ظرفیت تکمیل' : 'ثبت‌نام', () => MM.token() ? bookModal({ service_type: 'group', group: g }) : needLogin(), 'primary block'))))) : null);
  });

  MM.route('/consult/provider/:id', 'ارائه‌دهنده', async ({ params }) => {
    const [d, s] = await Promise.all([MM.get('/api/providers/' + params.id), MM.get('/api/providers/' + params.id + '/slots')]);
    const p = d.item;
    return h('div', { class: 'page narrow' }, MM.link('← بازگشت', '#/consult', 'btn ghost'),
      MM.card('', h('div', { class: 'row' }, p.photo_url ? h('img', { class: 'avatar lg', src: p.photo_url, alt: '', referrerpolicy: 'no-referrer' }) : h('div', { class: 'avatar lg ph' }, p.name.slice(0, 1)), h('div', null, h('h1', null, p.name), h('div', { class: 'muted' }, (MM.typeLabel[p.provider_type] || '') + (p.city ? ' · ' + p.city : '')))),
        paidBox(),
        h('p', null, h('strong', null, 'تخصص: '), p.specialty || ''), p.experience ? h('p', null, h('strong', null, 'تجربه: '), p.experience) : null,
        p.description ? MM.richText(p.description) : null, p.coaching_model ? h('p', null, h('strong', null, 'مدل کار: '), p.coaching_model) : null, p.background ? h('p', null, h('strong', null, 'سابقه: '), p.background) : null,
        h('p', null, h('strong', null, 'مدت جلسه: '), MM.fa(p.duration_min || 60) + ' دقیقه', ' · ', h('strong', null, 'قیمت: '), MM.money(p.price)),
        h('div', { class: 'tags' }, p.modes.map(m => h('span', { class: 'tag' }, MM.modeLabel[m] || m))),
        MM.btn('درخواست خدمت', () => MM.token() ? bookModal({ service_type: T2S[p.provider_type], provider: p, slots: s.items }) : needLogin(), 'primary block')),
      h('p', { class: 'small muted' }, 'اطلاعات تماس مستقیم نمایش داده نمی‌شود؛ ارتباط از مسیر پلتفرم و پس از تأیید پرداخت انجام می‌شود.'));
  });

  // ---------- درخواست‌های من ----------
  MM.route('/requests', 'درخواست‌های من', async () => {
    const d = await MM.get('/api/requests'); const reload = () => MM.navigate();
    const good = ['approved', 'active', 'completed'], bad = ['rejected', 'cancelled'];
    return h('div', { class: 'page narrow' }, h('h1', null, 'درخواست‌های من'),
      d.items.length ? d.items.map(r => MM.card('', h('div', { class: 'row between' }, h('h3', null, (MM.serviceLabel[r.service_type] || '') + (r.provider_name ? ' · ' + r.provider_name : r.package_title ? ' · ' + r.package_title : r.group_title ? ' · ' + r.group_title : '')), MM.badge(MM.statusLabel[r.status] || r.status, good.includes(r.status) ? 'good' : bad.includes(r.status) ? 'bad' : 'warn')),
        h('p', { class: 'small muted' }, [r.mode ? MM.modeLabel[r.mode] : '', r.start_at ? MM.dt(r.start_at) : '', 'ثبت: ' + MM.dt(r.created_at)].filter(Boolean).join(' · ')),
        h('p', null, 'مبلغ نهایی: ', h('strong', null, MM.money(r.final_amount)), r.discount ? h('span', { class: 'small muted' }, ' (تخفیف ' + MM.money(r.discount) + ')') : null),
        r.payment_status ? h('p', { class: 'small' }, 'پرداخت: ' + (MM.statusLabel[r.payment_status] || r.payment_status)) : null,
        r.payment_note ? h('p', { class: 'small notice warn' }, r.payment_note) : null, r.admin_note ? h('p', { class: 'small muted' }, r.admin_note) : null,
        h('div', { class: 'row' },
          r.status === 'pending_payment' ? MM.btn('ثبت پرداخت', () => paymentModal(r), 'primary') : null,
          ['pending_payment', 'requested', 'payment_submitted', 'approved'].includes(r.status) ? MM.btn('لغو درخواست', async (e) => { if (await MM.confirm('این درخواست لغو شود؟')) MM.busy(e.target, async () => { await MM.post('/api/requests/' + r.id + '/cancel'); MM.toast('لغو شد.'); reload(); }); }) : null,
          r.status === 'active' && r.service_type !== 'group' ? MM.link('کوچ من', '#/coach', 'btn') : null)))
        : MM.empty('هنوز درخواستی نداری', 'از بخش مشاوره یک خدمت انتخاب کن.', MM.link('مشاوره', '#/consult', 'btn primary')));
  }, { auth: true });

  // ---------- پنل ارائه‌دهنده ----------
  const PSTAT = { pending: 'در انتظار تأیید مدیر', approved: 'تأییدشده', rejected: 'ردشده', disabled: 'غیرفعال' };
  function applyForm() {
    const f = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() },
      MM.field('نوع فعالیت', MM.select('provider_type', [['coach', 'کوچ'], ['counselor', 'مشاور تحصیلی'], ['mentor', 'منتور'], ['professional', 'متخصص شغل']])),
      MM.field('نام نمایشی', h('input', { name: 'name', required: true, maxlength: 80 })), MM.field('تخصص', h('input', { name: 'specialty', required: true, maxlength: 120 })),
      MM.field('شهر', h('input', { name: 'city', maxlength: 60 })), MM.field('لینک عکس (اختیاری)', h('input', { name: 'photo_url', type: 'url', dir: 'ltr' })),
      MM.field('تجربه', h('input', { name: 'experience', maxlength: 200 })), MM.field('توضیح', h('textarea', { name: 'description', rows: 4 })),
      MM.field('مدل کوچینگ/کار', h('textarea', { name: 'coaching_model', rows: 2 })), MM.field('سابقه و مدارک (توضیح)', h('textarea', { name: 'background', rows: 2 })),
      MM.field('قیمت هر جلسه (تومان)', h('input', { name: 'price', type: 'number', required: true, inputmode: 'numeric' })), MM.field('مدت جلسه (دقیقه)', h('input', { name: 'duration_min', type: 'number', value: 60 })),
      MM.btn('ارسال درخواست', (e) => MM.busy(e.target, async () => { const d = MM.formData(f); d.price = Number(d.price); d.duration_min = Number(d.duration_min) || 60; await MM.post('/api/provider/apply', d); MM.toast('درخواست ثبت شد؛ پس از تأیید مدیر فعال می‌شود.'); MM.navigate(); }), 'primary'));
    return f;
  }
  function availEditor(av, onSave) {
    const rows = h('div', { class: 'stack' });
    const add = (a = { weekday: 6, start_time: '16:00', end_time: '20:00', slot_minutes: 60 }) => {
      const r = h('div', { class: 'row wrap avrow' }, MM.select('weekday', MM.weekdays.map((w, i) => [i, w]), a.weekday), h('input', { name: 'start_time', type: 'time', value: a.start_time }), h('input', { name: 'end_time', type: 'time', value: a.end_time }), h('input', { name: 'slot_minutes', type: 'number', min: 15, step: 15, value: a.slot_minutes || 60, 'aria-label': 'دقیقه' }), MM.btn('حذف', () => r.remove(), 'sm'));
      rows.appendChild(r);
    };
    (av.length ? av : []).forEach(add);
    return h('div', { class: 'stack' }, h('p', { class: 'small muted' }, 'روز هفته: ۰ = شنبه … ۶ = جمعه'), rows, h('div', { class: 'row' }, MM.btn('+ بازه‌ی جدید', () => add(), 'sm'), MM.btn('ذخیره‌ی زمان‌ها', (e) => MM.busy(e.target, async () => {
      const items = [...rows.children].map(r => ({ weekday: Number(r.querySelector('[name=weekday]').value), start_time: r.querySelector('[name=start_time]').value, end_time: r.querySelector('[name=end_time]').value, slot_minutes: Number(r.querySelector('[name=slot_minutes]').value) || 60 }));
      await MM.put('/api/provider/availability', { items }); MM.toast('زمان‌ها ذخیره شد.'); onSave();
    }), 'primary')));
  }
  MM.route('/provider', 'پنل ارائه‌دهنده', async () => {
    const me = await MM.get('/api/provider/me');
    if (!me.provider) return h('div', { class: 'page narrow' }, h('h1', null, 'ثبت‌نام ارائه‌دهنده'), h('p', { class: 'muted' }, 'اگر مشاور، کوچ، منتور یا متخصص هستی، درخواستت را ثبت کن. پس از بررسی و تأیید مدیر، در فهرست نمایش داده می‌شوی.'), MM.card('', applyForm()));
    const p = me.provider; const [rq, pg] = await Promise.all([MM.get('/api/provider/requests'), MM.get('/api/provider/programs')]);
    const reload = () => MM.navigate();
    const tr = (id, to) => (e) => MM.busy(e.target, async () => { await MM.post('/api/provider/requests/' + id + '/transition', { to }); MM.toast('انجام شد.'); reload(); });
    return h('div', { class: 'page narrow' }, h('h1', null, 'پنل ارائه‌دهنده'),
      MM.card('', h('div', { class: 'row between' }, h('h3', null, p.name), MM.badge(PSTAT[p.status] || p.status, p.status === 'approved' ? 'good' : 'warn')), me.admin_note ? h('p', { class: 'small notice warn' }, me.admin_note) : null, h('p', { class: 'small muted' }, 'قیمت: ' + MM.money(p.price))),
      p.status === 'approved' ? MM.card('', h('h2', null, 'زمان‌های آزاد هفتگی'), availEditor(me.availability || [], reload)) : null,
      MM.card('', h('h2', null, 'درخواست‌ها'), rq.items.length ? rq.items.map(r => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, (MM.serviceLabel[r.service_type] || '') + (r.user_name ? ' · ' + r.user_name : '')), h('div', { class: 'small muted' }, [MM.statusLabel[r.status] || r.status, r.start_at ? MM.dt(r.start_at) : '', r.mode ? MM.modeLabel[r.mode] : ''].filter(Boolean).join(' · ')), r.note ? h('p', { class: 'small' }, r.note) : null),
        h('div', { class: 'row' }, r.status === 'approved' ? MM.btn('شروع', tr(r.id, 'active'), 'sm primary') : null, r.status === 'active' ? MM.btn('تکمیل', tr(r.id, 'completed'), 'sm primary') : null))) : h('p', { class: 'muted' }, 'درخواستی نیست.')),
      MM.card('', h('h2', null, 'برنامه‌های کوچینگ دانش‌آموزان'), pg.items.length ? pg.items.map(x => h('a', { class: 'item link', href: '#/provider/programs/' + x.id }, h('div', { class: 'grow' }, h('strong', null, x.title), h('div', { class: 'small muted' }, (x.user_name || '') + ' · ' + MM.fa(x.weeks) + ' هفته')), MM.badge(MM.statusLabel[x.status] || x.status))) : h('p', { class: 'muted' }, 'برنامه‌ای نیست.')));
  }, { auth: true });

  MM.route('/provider/programs/:id', 'برنامه‌ی کوچینگ', async ({ params }) => {
    const d = await MM.get('/api/provider/programs/' + params.id); const id = params.id; const reload = () => MM.navigate();
    const AS = { pending: 'در انتظار', done: 'انجام شد', not_done: 'انجام نشد', partial: 'نیمه‌تمام' };
    const ask = (title, fields, submit) => { const f = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() }, fields); const m = MM.modal(title, f, [MM.btn('ذخیره', (e) => MM.busy(e.target, async () => { await submit(MM.formData(f)); m.close(); reload(); }), 'primary'), MM.btn('انصراف', () => m.close())]); };
    const weeks = {}; d.goals.forEach(g => (weeks[g.week_no || 0] = weeks[g.week_no || 0] || { goals: [], acts: [] }).goals.push(g)); d.actions.forEach(a => (weeks[a.week_no || 0] = weeks[a.week_no || 0] || { goals: [], acts: [] }).acts.push(a));
    return h('div', { class: 'page narrow' }, MM.link('← بازگشت', '#/provider', 'btn ghost'), h('h1', null, d.program.title), h('p', { class: 'muted' }, 'دانش‌آموز: ' + (d.student || '')),
      h('div', { class: 'row' },
        MM.btn('+ هدف', () => ask('هدف جدید', [MM.field('عنوان', h('input', { name: 'title', required: true })), MM.field('هفته', h('input', { name: 'week_no', type: 'number', min: 1 }))], (v) => MM.post(`/api/provider/programs/${id}/goals`, { title: v.title, week_no: Number(v.week_no) || undefined })), 'sm'),
        MM.btn('+ اقدام', () => ask('اقدام جدید', [MM.field('عنوان', h('input', { name: 'title', required: true })), MM.field('هفته', h('input', { name: 'week_no', type: 'number', min: 1 }))], (v) => MM.post(`/api/provider/programs/${id}/actions`, { title: v.title, week_no: Number(v.week_no) || undefined })), 'sm'),
        MM.btn('+ جلسه', () => ask('ثبت جلسه', [MM.field('زمان (مثلاً 2026-10-05 18:00)', h('input', { name: 'session_at', required: true, dir: 'ltr' })), MM.field('یادداشت مجاز برای دانش‌آموز', h('textarea', { name: 'notes_shared', rows: 3 })), MM.field('اقدام‌های بعدی', h('textarea', { name: 'next_actions', rows: 2 }))], (v) => MM.post(`/api/provider/programs/${id}/sessions`, v)), 'sm')),
      Object.entries(weeks).sort((a, b) => a[0] - b[0]).map(([w, x]) => MM.card('', h('h3', null, Number(w) ? 'هفته ' + MM.fa(w) : 'بدون هفته'),
        x.goals.map(g => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, '🎯 ' + g.title)), MM.btn('حذف', async () => { if (await MM.confirm('حذف شود؟')) { await MM.del(`/api/provider/items/goals/${g.id}`).catch(MM.err); reload(); } }, 'sm'))),
        x.acts.map(a => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('span', null, a.title), ' ', MM.badge(AS[a.status] || a.status)), MM.btn('حذف', async () => { if (await MM.confirm('حذف شود؟')) { await MM.del(`/api/provider/items/actions/${a.id}`).catch(MM.err); reload(); } }, 'sm'))))),
      d.sessions.length ? MM.card('', h('h2', null, 'جلسه‌ها'), d.sessions.map(s => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, MM.dt(s.session_at)), h('div', { class: 'small muted' }, s.notes_shared || '')), MM.badge(s.status)))) : null,
      d.checkins.length ? MM.card('', h('h2', null, 'Check-inهای اخیر'), d.checkins.slice(0, 5).map(c => h('div', { class: 'item' }, h('div', { class: 'grow small' }, h('strong', null, MM.dt(c.created_at)), h('p', null, c.done_today || c.went_well || ''))))) : null);
  }, { auth: true });
})();
