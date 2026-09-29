/* برنامه‌ی مطالعه و برنامه‌ی کنکور */
(function () {
  const { h } = MM; const ST = { todo: 'انجام نشده', doing: 'در حال انجام', done: 'انجام شد' };
  const STC = { todo: 'warn', doing: '', done: 'good' };

  function subjectsEditor(initial, hint) {
    const rows = h('div'); const list = [];
    const add = (name = '', level = 3) => {
      const row = { name, level }; list.push(row);
      const line = h('div', { class: 'row', style: 'margin-bottom:.4rem' },
        h('input', { placeholder: 'نام درس', value: name, style: 'flex:2;min-width:120px', oninput: (e) => (row.name = e.target.value), 'aria-label': 'نام درس' }),
        h('select', { style: 'flex:1;min-width:120px', onchange: (e) => (row.level = Number(e.target.value)), 'aria-label': 'سطح درس' }, [[1, '۱ — خیلی ضعیف'], [2, '۲ — ضعیف'], [3, '۳ — متوسط'], [4, '۴ — خوب'], [5, '۵ — عالی']].map(([v, t]) => h('option', { value: v, selected: v === level }, t))),
        h('button', { class: 'btn sm danger', type: 'button', onclick: () => { list.splice(list.indexOf(row), 1); line.remove(); } }, '✕'));
      rows.appendChild(line);
    };
    (initial || [['ریاضی', 3], ['فیزیک', 3]]).forEach(([n, l]) => add(n, l));
    return { el: h('div', null, h('span', { class: 'lbl' }, 'درس‌ها و سطح فعلی هر درس'), hint ? h('small', { class: 'muted' }, hint) : null, rows, MM.btn('+ افزودن درس', () => add(), 'sm')), get: () => list.filter(x => x.name.trim()) };
  }
  function daysPicker(sel = [6, 0, 1, 2, 3]) {
    const order = [6, 0, 1, 2, 3, 4, 5]; const set = new Set(sel);
    return { el: h('div', null, h('span', { class: 'lbl' }, 'روزهای مطالعه'), h('div', { class: 'tags' }, order.map(d => h('label', { class: 'check', style: 'margin:0 .6rem .3rem 0' }, h('input', { type: 'checkbox', checked: set.has(d), onchange: (e) => (e.target.checked ? set.add(d) : set.delete(d)) }), MM.weekdays[d])))), get: () => [...set].sort((a, b) => a - b) };
  }
  const groupByDay = (items) => { const m = {}; items.forEach(i => (m[i.task_date] ||= []).push(i)); return Object.entries(m).sort(); };

  function taskRow(t, onChange) {
    const sel = h('select', { class: 'sm', style: 'width:auto;min-height:36px', 'aria-label': 'وضعیت', onchange: (e) => MM.put('/api/plans/tasks/' + t.id, { status: e.target.value }).then(() => { t.status = e.target.value; badge.className = 'badge ' + STC[t.status]; badge.textContent = ST[t.status]; onChange && onChange(); }).catch(MM.err) }, Object.entries(ST).map(([v, l]) => h('option', { value: v, selected: v === t.status }, l)));
    const badge = MM.badge(ST[t.status], STC[t.status]);
    return h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, t.title), h('div', { class: 'small muted' }, `${MM.fa(t.minutes)} دقیقه · `, badge)), sel);
  }

  async function planPage(kind) {
    const isExam = kind === 'exam'; const plans = await MM.get('/api/plans'); const mine = isExam ? plans.exam : plans.study;
    const wrap = h('div', null, h('h1', null, isExam ? '⏳ برنامه‌ی کنکور' : '📅 برنامه‌ی مطالعه'));
    const list = h('div'); const tasksBox = h('div');
    const range = { v: 'today' };
    const loadTasks = async () => {
      MM.mount(tasksBox, MM.loading()); const r = await MM.get(`/api/plans/tasks?range=${range.v}&kind=${kind}`);
      const groups = groupByDay(r.items);
      MM.mount(tasksBox, h('div', { class: 'tabs' }, [['today', 'امروز'], ['week', 'این هفته'], ['month', 'این ماه'], ['overdue', 'عقب‌افتاده']].map(([k, l]) => h('button', { class: range.v === k ? 'on' : '', onclick: () => { range.v = k; loadTasks(); } }, l))),
        groups.length ? groups.map(([d, items]) => MM.card('flat', h('h3', null, MM.dateOnly(d) + ' — ' + MM.weekdays[new Date(d + 'T00:00:00Z').getUTCDay()]), items.map(t => taskRow(t, loadPlans)))) : MM.empty('کاری برای این بازه نیست', 'یک برنامه بساز یا بازه‌ی دیگری را ببین.'));
    };
    const loadPlans = async () => {
      const p = await MM.get('/api/plans'); const arr = isExam ? p.exam : p.study;
      MM.mount(list, arr.length ? arr.slice(0, 3).map(x => MM.card('hl', h('div', { class: 'row between' }, h('strong', null, isExam ? `هدف: ${x.target || '—'}` : `${x.grade || ''} ${x.field_name || ''}`.trim() || 'برنامه‌ی مطالعه'), h('button', { class: 'btn sm danger', onclick: async () => { if (await MM.confirm('این برنامه و کارهایش حذف شود؟')) { await MM.del(`/api/plans/${kind}/${x.id}`).catch(MM.err); MM.navigate(); } } }, 'حذف')),
      isExam && x.days_left !== null ? h('p', null, `⏰ ${MM.fa(x.days_left)} روز تا آزمون (${MM.dateOnly(x.exam_date)})`) : null, MM.progress(x.progress.percent, `پیشرفت: ${MM.fa(x.progress.percent)}٪ (${MM.fa(x.progress.done)} از ${MM.fa(x.progress.total)})`))) : MM.card('', h('p', { class: 'muted' }, 'هنوز برنامه‌ای نساخته‌ای. از فرم زیر شروع کن.')));
    };
    wrap.appendChild(list); await loadPlans(); wrap.appendChild(tasksBox); loadTasks().catch(MM.err);
    // آیا ساخت برنامه پولی است؟
    let feature = null, purchase = null;
    try {
      const feats = await MM.get('/api/paid-features'); feature = feats.items.find(x => x.feature_key === 'study_plan');
      if (feature && feature.is_paid && MM.token()) { const mine = await MM.get('/api/purchases/mine').catch(() => ({ items: [] })); purchase = mine.items.find(x => x.product_key === 'feature:study_plan'); }
    } catch { /* اگر تنظیم نشده بود، ساخت برنامه رایگان می‌ماند */ }
    if (feature && feature.is_paid && !(purchase && ['approved', 'active', 'completed'].includes(purchase.status))) {
      wrap.appendChild(MM.card('', h('h2', null, '🔒 ساخت برنامه‌ی جدید'), h('div', { class: 'notice warn' }, 'ساخت برنامه یک ویژگی پولی است — ', h('strong', null, MM.money(feature.price)), '.'),
        !MM.token() ? MM.btn('ورود برای خرید', () => { sessionStorage.setItem('mm_after', location.hash); MM.go('/login'); }, 'primary')
          : purchase && purchase.status === 'payment_submitted' ? h('p', { class: 'notice' }, 'پرداخت ثبت شده و در انتظار تأیید مدیر است.')
          : MM.btn(purchase ? 'ادامه‌ی پرداخت' : 'خرید این ویژگی', (e) => MM.busy(e.target, async () => {
              let r = purchase;
              if (!r) r = await MM.post('/api/purchases', { product_key: 'feature:study_plan' });
              if (r.final_amount > 0) MM.paymentModal(r.id, r.final_amount, () => MM.navigate()); else { MM.toast('باز شد!'); MM.navigate(); }
            }), 'primary')));
      return wrap;
    }
    // فرم ساخت برنامه
    const grades = MM.parse(MM.S('grades', '[]'), []); const fields = MM.parse(MM.S('fields', '[]'), []);
    const se = subjectsEditor(null, isExam ? 'درس‌های ضعیف (۱ و ۲) بیشتر وقت می‌گیرند و درس‌های قوی (۴ و ۵) مرور می‌شوند.' : 'سطح ضعیف‌تر، زمان بیشتر.'); const dp = daysPicker(isExam ? [6, 0, 1, 2, 3, 4] : [6, 0, 1, 2, 3]);
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); const b = e.target.querySelector('button[type=submit]'); MM.busy(b, async () => {
        const f = MM.formData(form); const body = { grade: f.grade, field_name: f.field_name, subjects: se.get(), study_days: dp.get(), daily_minutes: Number(f.daily_minutes) };
        if (isExam) { body.exam_date = f.exam_date; body.target = f.target; body.current_status = f.current_status; } else { body.goal = f.goal; body.exam_date = f.exam_date || ''; }
        const r = await MM.post('/api/plans/' + kind, body); MM.toast(`برنامه ساخته شد (${MM.fa(r.tasks)} فعالیت)`); MM.navigate(); }); } },
      h('div', { class: 'formgrid' }, MM.field('پایه', MM.select('grade', [['', 'انتخاب کن'], ...grades])), MM.field('رشته', MM.select('field_name', [['', 'انتخاب کن'], ...fields])),
        MM.field('ساعت مطالعه‌ی روزانه (دقیقه)', h('input', { name: 'daily_minutes', type: 'number', min: isExam ? 30 : 20, max: 720, value: isExam ? 300 : 120, required: true })),
        isExam ? MM.field('تاریخ آزمون (میلادی، مثل 2027-06-15)', h('input', { name: 'exam_date', type: 'date', required: true })) : MM.field('تاریخ آزمون (اختیاری)', h('input', { name: 'exam_date', type: 'date' })),
        isExam ? MM.field('هدف (رشته/دانشگاه)', h('input', { name: 'target', maxlength: 100 })) : MM.field('هدف', h('input', { name: 'goal', maxlength: 100 }))),
      isExam ? MM.field('وضعیت فعلی (اختیاری)', h('textarea', { name: 'current_status', maxlength: 500 })) : null, se.el, h('div', { style: 'height:.6rem' }), dp.el,
      h('button', { class: 'btn primary block', type: 'submit', style: 'margin-top:1rem' }, 'ساخت برنامه‌ی پیشنهادی'));
    wrap.appendChild(MM.card('', h('h2', null, mine.length ? 'ساخت برنامه‌ی جدید' : 'ساخت برنامه'), form));
    return wrap;
  }
  MM.route('/study-plan', 'برنامه مطالعه', () => planPage('study'), { auth: true });
  MM.route('/exam-plan', 'برنامه کنکور', () => planPage('exam'), { auth: true });
})();
