/* کوچ من: داشبورد، هدف، اقدام، Check-in، برنامه‌ی کوچینگ، جلسات، گزارش */
(function () {
  const { h } = MM;
  const GS = { not_started: 'شروع نشده', in_progress: 'در حال انجام', completed: 'تکمیل شده', paused: 'متوقف شده' };
  const AS = { pending: 'انجام نشده', done: 'انجام شد', not_done: 'انجام نشد', partial: 'نیمه‌تمام' };
  const ASC = { pending: 'warn', done: 'good', not_done: 'bad', partial: '' };
  const PR = { low: 'کم', medium: 'متوسط', high: 'زیاد' };
  const CT = () => MM.parse(MM.S('coach_type_labels', '{}'), {}); const CD = () => MM.parse(MM.S('coach_type_desc', '{}'), {});

  function actionRow(a, save) {
    const reasons = MM.parse(MM.S('action_fail_reasons', '[]'), []);
    const set = async (status) => {
      let fail_reason = null;
      if (status === 'not_done') { fail_reason = await pickReason(reasons); if (!fail_reason) return; }
      await save(a.id, status, fail_reason);
    };
    return h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, a.title), h('div', { class: 'small muted' }, MM.badge(AS[a.status], ASC[a.status]), a.fail_reason ? ' — ' + a.fail_reason : '', a.week_no ? ` · هفته ${MM.fa(a.week_no)}` : '')),
      h('div', { class: 'row' }, [['done', '✓'], ['partial', '½'], ['not_done', '✗']].map(([s, l]) => h('button', { class: 'btn sm' + (a.status === s ? ' primary' : ''), title: AS[s], 'aria-label': AS[s], onclick: () => set(s).catch(MM.err) }, l))));
  }
  function pickReason(reasons) {
    return new Promise((res) => {
      const sel = MM.select('r', reasons); const m = MM.modal('چرا انجام نشد؟', h('div', null, h('p', { class: 'muted small' }, 'بدون قضاوت؛ فقط برای اصلاح برنامه.'), sel), [MM.btn('ثبت', () => { m.close(); res(sel.value); }, 'primary'), MM.btn('انصراف', () => { m.close(); res(null); })]);
    });
  }

  MM.route('/coach', 'کوچ من', async () => {
    const [dash, goals, acts, progs, report] = await Promise.all([MM.get('/api/my/dashboard'), MM.get('/api/my/goals'), MM.get('/api/my/actions'), MM.get('/api/coach/programs'), MM.get('/api/coach/report')]);
    const c = dash.coaching; const wrap = h('div', null, h('h1', null, '🎯 کوچ من'));
    const explain = MM.parse(MM.S('service_explain', '{}'), {});
    wrap.appendChild(MM.card('hl', h('h2', null, 'وضعیت مسیر'), dash.main_goal ? h('div', null, h('p', null, h('strong', null, 'هدف اصلی: '), dash.main_goal.title), MM.progress(dash.main_goal.progress)) : h('p', { class: 'muted' }, 'هنوز هدف اصلی نداری. پایین‌تر یک هدف بساز.'),
      c ? h('div', null, h('p', { class: 'small' }, `هدف ماه: ${c.month_goal || '—'}`), MM.progress(c.progress, `اقدام‌های این هفته: ${MM.fa(c.progress)}٪`)) : null,
      dash.next_session ? h('p', { class: 'small' }, '⏰ جلسه‌ی بعدی: ' + MM.dt(dash.next_session.session_at)) : null, dash.last_checkin ? h('p', { class: 'small muted' }, 'آخرین Check-in: ' + MM.dt(dash.last_checkin.created_at)) : null,
      h('div', { class: 'row' }, MM.btn('ثبت گزارش امروز', () => checkinModal(progs.items), 'primary sm'), MM.link('جلسه‌ی بعدی / رزرو', '#/consult', 'btn sm'), MM.btn('تاریخچه‌ی جلسات', () => sessionsModal(), 'sm'))));
    wrap.appendChild(MM.card('flat', h('p', { class: 'small' }, explain.coach || ''), h('p', { class: 'small muted' }, `${explain.counselor || ''} — ${explain.mentor || ''}`)));

    // اهداف
    const gBox = h('div'); const aBox = h('div');
    const reload = () => MM.navigate();
    const drawGoals = () => MM.mount(gBox, goals.items.length ? goals.items.map(g => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, (g.is_main ? '⭐ ' : '') + g.title), h('div', { class: 'small muted' }, `${GS[g.status]} · اولویت ${PR[g.priority]}${g.end_date ? ' · تا ' + MM.dateOnly(g.end_date) : ''}`), MM.progress(g.progress)),
      h('div', { class: 'row' }, MM.btn('اقدام+', () => actionModal(g, reload), 'sm'), MM.btn('ویرایش', () => goalModal(g, reload), 'sm'), h('button', { class: 'btn sm danger', 'aria-label': 'حذف', onclick: async () => { if (await MM.confirm('هدف و اقدام‌هایش حذف شود؟')) { await MM.del('/api/my/goals/' + g.id).catch(MM.err); reload(); } } }, '✕')))) : [MM.empty('هدفی نداری', 'یک هدف بساز و آن را به اقدام‌های کوچک تبدیل کن.')]);
    drawGoals();
    wrap.appendChild(MM.card('', h('div', { class: 'row between' }, h('h2', null, 'اهداف من'), MM.btn('+ هدف جدید', () => goalModal(null, reload), 'primary sm')), gBox));
    const pending = acts.items.filter(a => a.status === 'pending' || a.status === 'partial'); const gName = Object.fromEntries(goals.items.map(g => [g.id, g.title]));
    const save = async (id, status, fail_reason) => { await MM.put('/api/my/actions/' + id, { status, fail_reason: fail_reason || '' }); MM.toast('ثبت شد'); reload(); };
    wrap.appendChild(MM.card('', h('h2', null, 'اقدام‌های من'), pending.length ? pending.slice(0, 12).map(a => h('div', null, a.goal_id ? h('small', { class: 'muted' }, 'هدف: ' + (gName[a.goal_id] || '')) : null, actionRow(a, save))) : h('p', { class: 'muted' }, 'اقدام باز نداری.'), acts.items.filter(a => a.status === 'done').length ? h('p', { class: 'small muted' }, `${MM.fa(acts.items.filter(a => a.status === 'done').length)} اقدام انجام شده 🎉`) : null));

    // برنامه‌های کوچینگ
    wrap.appendChild(MM.card('', h('div', { class: 'row between' }, h('h2', null, 'برنامه‌های کوچینگ'), MM.btn('+ برنامه‌ی ۸ هفته‌ای خودراهبر', () => selfStart(), 'sm')),
      progs.items.length ? progs.items.map(p => h('a', { class: 'item', href: '#/coach/' + p.id }, h('div', { class: 'grow' }, h('strong', null, p.title), h('div', { class: 'small muted' }, `${CT()[p.coach_type] || p.coach_type} · ${MM.fa(p.weeks)} هفته · ${p.coach_name ? 'کوچ: ' + p.coach_name : 'خودراهبر'}`)), MM.badge(MM.statusLabel[p.status] || p.status), '‹')) : h('p', { class: 'muted' }, 'برنامه‌ای نداری. می‌توانی بسته‌ی کوچینگ با کوچ واقعی بگیری (پولی) یا برنامه‌ی خودراهبر بسازی.'),
      h('div', { class: 'row' }, MM.link('بسته‌ها و کوچ‌ها', '#/consult?tab=coach', 'btn sm'))));
    if (report.checkins || report.programs.length) wrap.appendChild(MM.card('', h('h2', null, '📈 گزارش پیشرفت'), h('p', { class: 'small' }, `تعداد Check-in: ${MM.fa(report.checkins)}`), report.programs.map(p => h('div', null, h('span', { class: 'small' }, p.title), MM.progress(p.percent)))));
    return wrap;
  }, { auth: true });

  function goalModal(g, done) {
    const cats = ['تحصیلی', 'شغلی', 'مهارت', 'مسیر', 'شخصی']; g = g || {};
    const f = h('form', { onsubmit: (e) => e.preventDefault() }, MM.field('عنوان', h('input', { name: 'title', required: true, maxlength: 150, value: g.title || '' })), MM.field('توضیح', h('textarea', { name: 'description' }, g.description || '')),
      h('div', { class: 'formgrid' }, MM.field('دسته', MM.select('category', cats, g.category)), MM.field('اولویت', MM.select('priority', Object.entries(PR), g.priority || 'medium')), MM.field('وضعیت', MM.select('status', Object.entries(GS), g.status || 'not_started')), MM.field('درصد پیشرفت', h('input', { name: 'progress', type: 'number', min: 0, max: 100, value: g.progress || 0 })), MM.field('تاریخ شروع', h('input', { name: 'start_date', type: 'date', value: g.start_date || '' })), MM.field('تاریخ پایان', h('input', { name: 'end_date', type: 'date', value: g.end_date || '' }))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'is_main', checked: !!g.is_main }), h('span', null, 'هدف اصلی من')));
    const m = MM.modal(g.id ? 'ویرایش هدف' : 'هدف جدید', f, [MM.btn('ذخیره', (e) => MM.busy(e.target, async () => { const d = MM.formData(f); d.is_main = f.elements.is_main.checked; if (!d.title) throw new Error('عنوان را وارد کن.'); if (g.id) await MM.put('/api/my/goals/' + g.id, d); else await MM.post('/api/my/goals', d); m.close(); MM.toast('ذخیره شد'); done(); }), 'primary'), MM.btn('انصراف', () => m.close())]);
  }
  function actionModal(g, done) {
    const f = h('form', { onsubmit: (e) => e.preventDefault() }, h('p', { class: 'muted small' }, 'هدف: ' + g.title), MM.field('اقدام (کوچک و قابل انجام)', h('input', { name: 'title', required: true, maxlength: 150, placeholder: 'مثلاً: روزانه ۳۰ دقیقه Python' })), MM.field('مهلت (اختیاری)', h('input', { name: 'due_date', type: 'date' })));
    const m = MM.modal('اقدام جدید', f, [MM.btn('افزودن', (e) => MM.busy(e.target, async () => { const d = MM.formData(f); d.goal_id = g.id; await MM.post('/api/my/actions', d); m.close(); done(); }), 'primary')]);
  }
  function checkinModal(programs) {
    const f = h('form', { onsubmit: (e) => e.preventDefault() }, [['done_today', 'امروز چه کاری انجام دادم؟'], ['went_well', 'چه چیزی خوب پیش رفت؟'], ['was_hard', 'چه چیزی سخت بود؟'], ['obstacles', 'چه چیزی مانع من شد؟'], ['next_week', 'برای هفته‌ی بعد چه کاری باید انجام دهم؟']].map(([k, l]) => MM.field(l, h('textarea', { name: k, maxlength: 1000 }))),
      programs.length ? MM.field('مربوط به برنامه', h('select', { name: 'program_id' }, [h('option', { value: '' }, 'بدون برنامه'), ...programs.map(p => h('option', { value: p.id }, p.title))])) : null, h('p', { class: 'muted small' }, '🔒 اطلاعات شخصی یا حساس (شماره‌ی تماس، آدرس، …) اینجا ننویس.'));
    const m = MM.modal('گزارش امروز (Check-in)', f, [MM.btn('ثبت گزارش', (e) => MM.busy(e.target, async () => { const d = MM.formData(f); if (!d.program_id) delete d.program_id; await MM.post('/api/my/checkins', d); m.close(); MM.toast('گزارش ثبت شد 👏'); MM.navigate(); }), 'primary')]);
  }
  async function sessionsModal() {
    const r = await MM.get('/api/coach/sessions');
    MM.modal('تاریخچه‌ی جلسات', r.items.length ? r.items.map(s => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, `${CT()[s.coach_type] || 'جلسه'} — ${s.coach_name || ''}`), h('div', { class: 'small muted' }, `${MM.dt(s.session_at)} · ${MM.fa(s.duration_min)} دقیقه · ${MM.modeLabel[s.mode] || ''}`), s.notes_shared ? h('p', { class: 'small' }, s.notes_shared) : null, s.next_actions ? h('p', { class: 'small' }, '👣 ' + s.next_actions) : null), MM.badge(s.status))) : MM.empty('جلسه‌ای ثبت نشده'));
  }
  function selfStart() {
    const labels = CT(); const desc = CD(); const sel = MM.select('t', Object.entries(labels));
    const m = MM.modal('برنامه‌ی ۸ هفته‌ای خودراهبر', h('div', null, h('p', { class: 'muted small' }, 'رایگان است و بدون کوچ انسانی خودت پیگیری می‌کنی.'), MM.field('نوع کوچینگ', sel), h('p', { class: 'small muted', id: 'cdesc' }, desc[Object.keys(labels)[0]] || '')), [MM.btn('ساخت برنامه', (e) => MM.busy(e.target, async () => { const r = await MM.post('/api/coach/self-start', { coach_type: sel.value }); m.close(); MM.go('/coach/' + r.id); }), 'primary')]);
    sel.addEventListener('change', () => { document.getElementById('cdesc').textContent = desc[sel.value] || ''; });
  }

  MM.route('/coach/:id', 'برنامه‌ی کوچینگ', async ({ params }) => {
    const r = await MM.get('/api/coach/programs/' + params.id); const p = r.program;
    const save = async (id, status, fail_reason) => { await MM.put('/api/coach/actions/' + id, { status, fail_reason: fail_reason || '' }); MM.navigate(); };
    const weeks = {}; r.goals.forEach(g => (weeks[g.week_no || 0] ||= { goal: g, acts: [] })); r.actions.forEach(a => { const k = a.week_no || 0; (weeks[k] ||= { goal: null, acts: [] }).acts.push(a); });
    return h('div', null, MM.link('‹ کوچ من', '#/coach', 'btn sm'), h('h1', null, p.title), h('p', { class: 'muted' }, `${CT()[p.coach_type] || ''} · ${p.coach_name ? 'کوچ: ' + p.coach_name : 'خودراهبر'} · ${MM.badge(MM.statusLabel[p.status] || p.status).textContent}`),
      Object.entries(weeks).sort((a, b) => a[0] - b[0]).map(([w, x]) => MM.card('', h('div', { class: 'row between' }, h('h3', null, x.goal ? x.goal.title : `هفته ${MM.fa(w)}`), x.goal ? MM.badge(GS[x.goal.status]) : null), x.goal ? MM.progress(x.goal.progress) : null, x.acts.map(a => actionRow(a, save)))),
      r.sessions.length ? MM.card('', h('h2', null, 'جلسه‌ها'), r.sessions.map(s => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, MM.dt(s.session_at)), s.notes_shared ? h('p', { class: 'small' }, s.notes_shared) : null, s.next_actions ? h('p', { class: 'small' }, '👣 ' + s.next_actions) : null), MM.badge(s.status)))) : null,
      r.checkins.length ? MM.card('', h('h2', null, 'Check-inها'), r.checkins.slice(0, 5).map(c => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', { class: 'small' }, MM.dt(c.created_at)), h('p', { class: 'small' }, c.done_today || c.went_well || ''))))) : null,
      MM.btn('ثبت گزارش (Check-in)', () => checkinModal([p]), 'primary'));
  }, { auth: true });
})();
