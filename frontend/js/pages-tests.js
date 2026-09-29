/* تست‌ها: فهرست، پاسخ‌دادن، نتیجه */
(function () {
  const { h } = MM;
  const KIND = { likert: 'خودسنجی', ability: 'توانایی (پاسخ درست/نادرست)' };

  MM.route('/tests', 'تست‌ها', async () => {
    const r = await MM.get('/api/tests'); let mine = { items: [] };
    if (MM.token()) mine = await MM.get('/api/my/results').catch(() => ({ items: [] }));
    const doneSlugs = new Set(mine.items.map(x => x.slug));
    return h('div', null, h('h1', null, '📝 تست‌ها'), h('p', { class: 'muted' }, 'نتیجه‌ی تست‌ها یک نقطه‌ی شروع برای فکر کردن است، نه حکم نهایی. صادقانه و بدون عجله پاسخ بده.'),
      h('div', { class: 'grid g2' }, r.items.map(t => h('a', { class: 'tile', href: '#/tests/' + t.slug }, h('div', { class: 'row between' }, h('h3', null, t.title), doneSlugs.has(t.slug) ? MM.badge('انجام شده ✓', 'good') : (t.is_paid ? MM.badge('🔒 ' + MM.money(t.price), 'warn') : null)),
        h('p', { class: 'muted small' }, t.description), h('div', { class: 'tags' }, h('span', { class: 'tag' }, `${MM.fa(t.questions)} سؤال`), h('span', { class: 'tag' }, `حدود ${MM.fa(t.est_minutes)} دقیقه`), h('span', { class: 'tag' }, KIND[t.kind] || t.kind))))),
      mine.items.length ? MM.card('', h('h2', null, 'نتایج قبلی من'), mine.items.slice(0, 10).map(x => h('a', { class: 'item', href: '#/results/' + x.id }, h('div', { class: 'grow' }, h('strong', null, x.title), h('p', { class: 'muted small' }, MM.dt(x.created_at))), '‹'))) : null);
  });

  async function purchaseBlock(box, test, reload) {
    let pending = null;
    if (MM.token()) { const mine = await MM.get('/api/purchases/mine').catch(() => ({ items: [] })); pending = mine.items.find(x => x.product_key === 'test:' + test.slug && ['pending_payment', 'payment_submitted'].includes(x.status)); }
    MM.mount(box, MM.card('', h('h1', null, test.title), h('p', null, test.description),
      h('div', { class: 'notice warn' }, '🔒 این آزمون پولی است — ', h('strong', null, MM.money(test.price)), '. برای شروع، ابتدا آن را بخر.'),
      !MM.token() ? MM.btn('ورود برای خرید', () => { sessionStorage.setItem('mm_after', location.hash); MM.go('/login'); }, 'primary')
        : pending && pending.status === 'payment_submitted' ? h('p', { class: 'notice' }, 'پرداخت ثبت شده و در انتظار تأیید مدیر است. بعد از تأیید، به همین صفحه برگرد.')
        : MM.btn(pending ? 'ادامه‌ی پرداخت' : 'خرید و شروع', (e) => MM.busy(e.target, async () => {
            let r = pending;
            if (!r) r = await MM.post('/api/purchases', { product_key: 'test:' + test.slug });
            if (r.final_amount > 0) MM.paymentModal(r.id, r.final_amount, () => MM.navigate());
            else { MM.toast('باز شد! می‌تونی شروع کنی.'); reload(); }
          }), 'primary'),
      MM.link('‹ بازگشت به تست‌ها', '#/tests', 'btn sm')));
  }

  MM.route('/tests/:slug', 'تست', async ({ params }) => {
    let { test, questions, locked } = await MM.get('/api/tests/' + params.slug);
    const answers = {}; let idx = -1; const box = h('div');
    const saved = MM.parse(sessionStorage.getItem('mm_t_' + test.slug), {}); Object.assign(answers, saved);
    const reload = async () => { const d = await MM.get('/api/tests/' + params.slug); test = d.test; questions = d.questions; locked = d.locked; locked ? purchaseBlock(box, test, reload) : intro(); };
    const intro = () => MM.mount(box, MM.card('', h('h1', null, test.title), h('p', null, test.description),
      h('div', { class: 'tags' }, h('span', { class: 'tag' }, `${MM.fa(questions.length)} سؤال`), h('span', { class: 'tag' }, `حدود ${MM.fa(test.est_minutes)} دقیقه`)),
      test.science_note ? h('div', { class: 'notice info' }, h('strong', null, 'مبنای علمی و محدودیت‌ها: '), test.science_note) : null,
      !MM.token() ? h('div', { class: 'notice' }, 'برای ذخیره‌ی نتیجه باید وارد حساب شوی.') : null,
      MM.btn(Object.keys(saved).length ? 'ادامه‌ی تست' : 'شروع تست', () => { if (!MM.token()) { sessionStorage.setItem('mm_after', location.hash); return MM.go('/login'); } idx = Math.min(Object.keys(saved).length, questions.length - 1); show(); }, 'primary')));
    const show = () => {
      const q = questions[idx]; const likert = q.options.length === 5 && test.kind === 'likert';
      const pick = (o) => { answers[q.id] = o.id; sessionStorage.setItem('mm_t_' + test.slug, JSON.stringify(answers)); if (idx < questions.length - 1) { idx++; setTimeout(show, 120); } else show(); };
      const opts = q.options.map(o => h('label', { class: 'opt' + (answers[q.id] === o.id ? ' on' : '') }, h('input', { type: 'radio', name: 'q' + q.id, checked: answers[q.id] === o.id, onchange: () => pick(o) }), o.text));
      const last = idx === questions.length - 1; const answered = Object.keys(answers).length;
      MM.mount(box, MM.card('', h('div', { class: 'row between small muted' }, h('span', null, `سؤال ${MM.fa(idx + 1)} از ${MM.fa(questions.length)}`), h('span', null, `پاسخ‌داده‌شده: ${MM.fa(answered)}`)), MM.progress(Math.round(((idx + 1) / questions.length) * 100)),
        h('h2', { style: 'margin-top:1rem' }, q.text), h('div', { class: likert ? 'likert' : 'opts', role: 'radiogroup' }, opts),
        h('div', { class: 'row between', style: 'margin-top:1rem' }, idx > 0 ? MM.btn('قبلی', () => { idx--; show(); }) : h('span'),
          last || answered === questions.length ? MM.btn('ثبت و دیدن نتیجه', (e) => MM.busy(e.target, async () => { const r = await MM.post(`/api/tests/${test.slug}/submit`, { answers }); sessionStorage.removeItem('mm_t_' + test.slug); MM.go('/results/' + r.id); }), 'primary') : MM.btn('رد کردن', () => { idx++; show(); }))));
    };
    if (locked) await purchaseBlock(box, test, reload); else intro();
    return box;
  });

  MM.route('/results/:id', 'نتیجه‌ی تست', async ({ params }) => {
    const r = await MM.get('/api/my/results/' + params.id);
    const sug = r.suggested; const chip = (arr, base) => arr.length ? h('div', { class: 'row' }, arr.map(x => MM.link(x.name, `#/${base}/${x.slug}`, 'btn sm'))) : h('p', { class: 'muted small' }, 'موردی ثبت نشده است.');
    return h('div', null, MM.link('‹ همه‌ی تست‌ها', '#/tests', 'btn sm'), h('h1', null, 'نتیجه‌ی ' + r.test.title),
      MM.card('hl', r.categories.map(c => h('div', { class: 'bar-row' }, h('span', { class: 'nm' }, c.title), MM.progress(c.pct)))),
      MM.card('', h('h2', null, 'دسته‌های برتر تو'), r.categories.filter(c => r.top_codes.includes(c.code)).map(c => h('div', null, h('h3', null, `${c.title}`), h('p', null, c.description)))),
      r.next_action ? MM.card('', h('h2', null, '👣 اقدام بعدی'), h('p', null, r.next_action)) : null,
      MM.card('', h('h2', null, '🎓 رشته‌های پیشنهادی برای بررسی'), chip(sug.majors, 'majors'), h('h2', null, '💼 مشاغل مرتبط'), chip(sug.jobs, 'jobs'), sug.skills.length ? [h('h2', null, '🛠 مهارت‌های پیشنهادی'), h('div', { class: 'tags' }, sug.skills.map(s => h('span', { class: 'tag' }, s.name)))] : null),
      r.test.result_note ? h('div', { class: 'notice info' }, r.test.result_note) : null,
      h('div', { class: 'row' }, MM.link('ادامه‌ی مسیر من', '#/my-path', 'btn primary'), MM.link('صحبت با مشاور AI', '#/ai', 'btn'), MM.link('صحبت با متخصص', '#/consult', 'btn')));
  }, { auth: true });
})();
