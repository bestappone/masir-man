/* صفحه‌ی خانه، ورود/ثبت‌نام، داشبورد، مسیر من (ویزارد)، رشته‌ها و مشاغل */
(function () {
  const { h } = MM;

  // ---------- کارت آگهی (تصویر/ویدیو) که از پنل مدیر فعال/غیرفعال می‌شود ----------
  function adBanner(b) {
    let media;
    if (b.media_type === 'video') media = h('video', { src: b.media_url, poster: b.poster_url || null, controls: true, playsinline: true, preload: 'metadata' });
    else if (b.media_type === 'embed') media = h('iframe', { src: b.media_url, loading: 'lazy', allowfullscreen: true, sandbox: 'allow-scripts allow-same-origin allow-presentation', title: b.title || 'آگهی' });
    else media = h('img', { src: b.media_url, alt: b.title || 'آگهی', loading: 'lazy' });
    const box = h('div', { class: 'ad' }, media, h('span', { class: 'adtag' }, 'تبلیغ'));
    return b.link_url && b.media_type === 'image' ? h('a', { href: b.link_url, target: '_blank', rel: 'noopener sponsored' }, box) : box;
  }

  const TILES = [
    ['📝', 'تست علاقه', 'کشف تیپ‌های علاقه‌ی شغلی', '/tests/holland-interest'], ['🧩', 'تست شخصیت شغلی', 'ویژگی‌های شخصیتی کار و تحصیل', '/tests/big-five-mini'],
    ['💡', 'تست استعداد', 'توانایی‌های عددی، کلامی و منطقی', '/tests/aptitude-basic'], ['🏫', 'وضعیت تحصیلی', 'مهارت‌های مطالعه و آمادگی', '/tests/study-skills'],
    ['🎯', 'هدف آینده', 'هدف بساز و به اقدام تبدیلش کن', '/coach'], ['🎓', 'رشته‌ها', 'همه‌ی رشته‌ها با جزئیات', '/majors'],
    ['💼', 'مشاغل', 'شغل‌ها و مسیر ورود به آن‌ها', '/jobs'], ['📅', 'برنامه مطالعه', 'برنامه‌ی هفتگی شخصی', '/study-plan'],
    ['⏳', 'برنامه کنکور', 'تا روز آزمون برنامه‌ریزی کن', '/exam-plan'], ['🎯', 'کوچ من', 'پیگیری اقدام‌ها و پیشرفت', '/coach'],
    ['🤝', 'مشاوره', 'مشاور، منتور و متخصص واقعی', '/consult'], ['🤖', 'مشاور AI', 'پرسش‌وپاسخ رایگان', '/ai'],
  ];

  MM.route('/', 'خانه', async () => {
    const [home, sug] = await Promise.all([MM.get('/api/home'), MM.get('/api/suggestions').catch(() => ({ items: [] }))]);
    const S = MM.S;
    const wrap = h('div');
    if (MM.token()) wrap.appendChild(h('div', { id: 'dash' }));
    wrap.appendChild(h('div', { class: 'hero' }, h('h1', null, S('hero_title', 'فقط نپرس چی بخونم؛ بفهم برای چه آینده‌ای می‌خونی.')), h('p', null, S('hero_text', '')),
      MM.link(S('hero_cta', 'شروع کشف مسیر من'), MM.token() ? '#/my-path' : '#/register', 'btn primary')));
    home.banners.filter(b => b.placement === 'home_ad').forEach(b => wrap.appendChild(adBanner(b)));
    wrap.appendChild(h('div', { class: 'grid g3' }, TILES.filter(t => t[3] !== '/ai' || home.ai_enabled || true).map(([i, t, d, l]) => h('a', { class: 'tile', href: '#' + l }, h('div', { class: 'ti' }, i), h('h3', null, t), h('p', { class: 'muted small' }, d)))));
    if (sug.items.length) wrap.appendChild(MM.card('', h('h2', null, '✨ پیشنهاد بعدی برای تو'), sug.items.map(s => h('a', { class: 'item', href: s.link || '#/' }, h('div', { class: 'grow' }, h('strong', null, s.title), s.description ? h('p', { class: 'muted small' }, s.description) : null), h('span', null, '‹')))));
    wrap.appendChild(MM.card('', h('h2', null, 'تفاوت مشاور، منتور و کوچ'), h('div', { class: 'grid g3' }, (() => { const x = MM.parse(S('service_explain', '{}'), {}); return ['counselor', 'mentor', 'coach'].filter(k => x[k]).map(k => h('div', { class: 'card flat' }, h('p', null, x[k]))); })())));
    if (home.articles.length) wrap.appendChild(MM.card('', h('div', { class: 'row between' }, h('h2', null, 'مقالات'), MM.link('همه‌ی مقالات', '#/articles', 'btn sm')), home.articles.map(a => h('a', { class: 'item', href: '#/articles/' + a.slug }, a.image_url ? h('img', { class: 'thumb', src: a.image_url, alt: '', loading: 'lazy' }) : h('div', { class: 'thumb' }, '📰'), h('div', { class: 'grow' }, h('strong', null, a.title), h('p', { class: 'muted small' }, a.summary))))));
    if (MM.token()) fillDashboard(wrap.querySelector('#dash'));
    return wrap;
  });

  async function fillDashboard(box) {
    try {
      const d = await MM.get('/api/my/dashboard'); const c = d.coaching;
      MM.mount(box, MM.card('hl', h('h2', null, `سلام ${d.name} 👋`),
        d.major ? h('p', null, h('strong', null, 'مسیر پیشنهادی: '), d.major) : h('p', { class: 'muted' }, 'هنوز رشته‌ای انتخاب نکرده‌ای. با «مسیر من» شروع کن.'),
        d.progress || d.today.length ? MM.progress(d.progress, 'پیشرفت برنامه: ' + MM.fa(d.progress) + '٪') : null,
        h('h3', null, 'امروز'), d.today.length ? d.today.slice(0, 6).map(t => h('div', { class: 'row between small' }, h('span', null, `${t.title} — ${MM.fa(t.minutes)} دقیقه`), MM.badge(t.status === 'done' ? 'انجام شد' : 'انجام نشده', t.status === 'done' ? 'good' : 'warn'))) : h('p', { class: 'muted small' }, 'برای امروز کاری ثبت نشده است.'),
        d.tests_done === 0 ? h('p', { class: 'small' }, '📝 تست شغلی انجام نشده — ', h('a', { href: '#/tests' }, 'شروع تست')) : null,
        h('hr'), h('h3', null, '🎯 کوچ من'),
        c ? h('div', null, h('p', { class: 'small' }, `${c.program.title}${c.month_goal ? ' — هدف: ' + c.month_goal : ''}`), MM.progress(c.progress, 'اقدام‌های این هفته: ' + MM.fa(c.progress) + '٪'), d.next_session ? h('p', { class: 'small' }, '⏰ جلسه‌ی بعدی: ' + MM.dt(d.next_session.session_at)) : null)
          : h('p', { class: 'muted small' }, 'برنامه‌ی کوچینگ فعالی نداری.'),
        h('div', { class: 'row', style: 'margin-top:.6rem' }, MM.link('ادامه مسیر', '#/my-path', 'btn sm primary'), MM.link('برنامه امروز', '#/study-plan', 'btn sm'), MM.link('کوچ من', '#/coach', 'btn sm'), MM.link('مشاور من', '#/consult', 'btn sm'), MM.link('مشاور AI', '#/ai', 'btn sm'), MM.link('تست‌ها', '#/tests', 'btn sm'))));
    } catch { MM.clear(box); }
  }

  // ---------- ورود و ثبت‌نام ----------
  function afterAuth() { const a = sessionStorage.getItem('mm_after'); sessionStorage.removeItem('mm_after'); MM.renderNav(); MM.go(a ? a.replace(/^#/, '') : '/'); }
  MM.route('/login', 'ورود', async () => {
    if (MM.token()) return h('div', null, MM.card('', h('p', null, 'قبلاً وارد شده‌ای.'), MM.link('رفتن به خانه', '#/', 'btn primary')));
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); const b = e.target.querySelector('button'); MM.busy(b, async () => { const r = await MM.post('/api/auth/login', MM.formData(form)); MM.setSession(r.token, r.user); MM.toast('خوش آمدی!'); afterAuth(); }); } },
      MM.field('ایمیل', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'username', dir: 'ltr' })),
      MM.field('رمز عبور', h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password', dir: 'ltr' })),
      h('button', { class: 'btn primary block', type: 'submit' }, 'ورود'));
    return h('div', { style: 'max-width:440px;margin:auto' }, MM.card('', h('h1', null, 'ورود'), form, h('p', { class: 'center small' }, 'حساب نداری؟ ', h('a', { href: '#/register' }, 'ثبت‌نام'))));
  });
  MM.route('/register', 'ثبت‌نام', async ({ query }) => {
    const ref = query.ref || sessionStorage.getItem('mm_ref') || ''; if (query.ref) sessionStorage.setItem('mm_ref', query.ref);
    const s = MM.settings; const invite = ref && s.referral_enabled !== '0';
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); const b = e.target.querySelector('button[type=submit]'); MM.busy(b, async () => {
        const d = MM.formData(form); d.consent_privacy = form.elements.consent.checked; if (ref) d.ref = ref; delete d.consent;
        const r = await MM.post('/api/auth/register', d); MM.setSession(r.token, r.user); sessionStorage.removeItem('mm_ref');
        MM.toast(r.reward ? `ثبت‌نام انجام شد؛ کد تخفیف ${MM.fa(r.reward.percent)}٪ برای تو ساخته شد 🎁` : 'ثبت‌نام انجام شد!'); afterAuth(); }); } },
      MM.field('نام', h('input', { name: 'name', required: true, maxlength: 60, autocomplete: 'name' })),
      MM.field('ایمیل', h('input', { name: 'email', type: 'email', required: true, dir: 'ltr', autocomplete: 'email' })),
      MM.field('رمز عبور', h('input', { name: 'password', type: 'password', required: true, minlength: 8, dir: 'ltr', autocomplete: 'new-password' }), 'حداقل ۸ نویسه، شامل حرف و عدد'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'consent', required: true }), h('span', { class: 'small' }, 'قوانین و ', h('a', { href: '#/privacy', target: '_blank' }, 'سیاست حریم خصوصی'), ' را خوانده‌ام و می‌پذیرم.')),
      h('button', { class: 'btn primary block', type: 'submit' }, 'ساخت حساب'));
    return h('div', { style: 'max-width:440px;margin:auto' }, MM.card('', h('h1', null, 'ثبت‌نام'),
      invite ? h('div', { class: 'notice info' }, '🎁 با لینک دعوت یکی از دوستانت آمده‌ای؛ بعد از ثبت‌نام کد تخفیف هدیه می‌گیری.') : null,
      form, h('p', { class: 'center small' }, 'حساب داری؟ ', h('a', { href: '#/login' }, 'ورود'))));
  });

  // ---------- مسیر من: خلاصه‌ی مسیر + ویزارد ----------
  const WSTEPS = [['me', 'شناخت من'], ['interests', 'علایق'], ['abilities', 'توانایی‌ها'], ['goal', 'هدف'], ['major', 'رشته'], ['job', 'شغل'], ['plan', 'برنامه'], ['coaching', 'کوچینگ'], ['consult', 'مشاوره'], ['final', 'مسیر نهایی']];
  MM.route('/my-path', 'مسیر من', async () => {
    const [d, p] = await Promise.all([MM.get('/api/my/dashboard'), MM.get('/api/my/path')]);
    const wrap = h('div', null, h('h1', null, '🧭 مسیر من'));
    const done = d.wizard.filter(x => x.done).length;
    wrap.appendChild(MM.card('hl', h('h2', null, `مراحل مسیر (${MM.fa(done)} از ${MM.fa(10)})`), h('div', { class: 'steps' }, d.wizard.map(x => h('i', { class: x.done ? 'on' : '' }))),
      h('div', { class: 'tags' }, WSTEPS.map(([k, t], i) => h('span', { class: 'tag', style: d.wizard[i].done ? 'background:var(--brand-l);color:var(--brand)' : '' }, (d.wizard[i].done ? '✓ ' : '') + t))),
      h('div', { class: 'row', style: 'margin-top:.6rem' }, MM.btn('ویزارد ساخت مسیر', () => wizard(wrap, p), 'primary'))));
    if (!p.ready) { wrap.appendChild(MM.card('', h('h2', null, 'اول خودت را بشناس'), h('p', null, p.why), MM.link('شروع تست علاقه', '#/tests/holland-interest', 'btn primary'))); return wrap; }
    wrap.appendChild(pathResult(p)); return wrap;
  });

  function pathResult(p) {
    const w = h('div');
    w.appendChild(MM.card('', h('h2', null, '🎯 هدف'), h('p', null, p.goal ? p.goal.title : 'هنوز هدفی ثبت نشده — در «کوچ من» هدف بساز.'), h('h2', null, '🧠 علایق'), h('p', null, p.why), h('div', { class: 'tags' }, p.holland.map(c => h('span', { class: 'tag' }, c)))));
    if (p.abilities.length) w.appendChild(MM.card('', h('h2', null, '📊 توانایی‌ها و ویژگی‌ها'), p.abilities.slice(0, 4).map(a => h('div', null, h('strong', { class: 'small' }, a.title), Object.entries(a.scores).slice(0, 6).map(([k, v]) => h('div', { class: 'bar-row' }, h('span', { class: 'nm' }, k), MM.progress(v.pct)))))));
    w.appendChild(MM.card('', h('h2', null, '🎓 رشته‌های پیشنهادی'), p.majors.map(m => h('a', { class: 'item', href: '#/majors/' + m.slug }, h('div', { class: 'grow' }, h('strong', null, m.name), h('p', { class: 'muted small' }, (m.description || '').slice(0, 110))), '‹')),
      h('h2', null, '💼 مشاغل مرتبط'), p.jobs.map(j => h('a', { class: 'item', href: '#/jobs/' + j.slug }, h('div', { class: 'grow' }, h('strong', null, j.name), h('p', { class: 'muted small' }, (j.intro || '').slice(0, 110))), '‹'))));
    if (p.key_lessons.length || p.skills.length) w.appendChild(MM.card('', p.key_lessons.length ? [h('h2', null, '📚 درس‌های مهم'), h('div', { class: 'tags' }, p.key_lessons.map(x => h('span', { class: 'tag' }, x)))] : null, p.skills.length ? [h('h2', null, '🛠 مهارت‌ها'), h('div', { class: 'tags' }, p.skills.map(x => h('span', { class: 'tag' }, x)))] : null));
    if (p.path) w.appendChild(MM.card('', h('h2', null, '🗺 نقشه‌ی مسیر: ' + p.path.title), p.path.description ? h('p', { class: 'muted' }, p.path.description) : null, h('div', { class: 'timeline' }, p.path.steps.map(s => h('div', { class: 'tl' }, h('strong', null, s.title), s.desc ? h('p', { class: 'small muted' }, s.desc) : null, s.link ? h('a', { class: 'small', href: s.link }, 'بخش مرتبط ‹') : null)))));
    const provs = Object.entries(p.providers).filter(([, l]) => l.length);
    if (provs.length) w.appendChild(MM.card('', h('h2', null, '🤝 افراد مرتبط برای گفت‌وگو'), provs.map(([t, l]) => h('div', null, h('h3', null, ({ counselor: '👨‍🏫 مشاوران', coach: '🧑‍🏫 کوچ‌ها', professional: '💼 متخصصان', mentor: '🏆 منتورها' })[t]), l.map(x => h('a', { class: 'item', href: '#/consult/' + x.id }, h('div', { class: 'grow' }, h('strong', null, x.name), h('p', { class: 'muted small' }, x.specialty)), '‹'))))));
    w.appendChild(MM.card('', h('h2', null, '🤖 پیشنهاد مشاور AI'), h('p', { class: 'muted small' }, 'نتیجه‌ی مسیرت را با مشاور AI مرور کن و سؤال‌هایت را بپرس.'), MM.link('گفت‌وگو با مشاور AI', '#/ai', 'btn')));
    return w;
  }

  async function wizard(host, path) {
    const [maj, jb] = await Promise.all([MM.get('/api/majors'), MM.get('/api/jobs')]);
    const me = await MM.get('/api/me'); const pr = me.profile || {};
    const grades = MM.parse(MM.S('grades', '[]'), []); const fields = MM.parse(MM.S('fields', '[]'), []); const cities = MM.parse(MM.S('cities', '[]'), []);
    const st = { grade: pr.grade || '', field_of_study: pr.field_of_study || '', city: pr.city || '', goal_text: pr.goal_text || '', chosen_major_slug: pr.chosen_major_slug || '', chosen_job_slug: pr.chosen_job_slug || '' };
    let step = 0; const body = h('div'); let m;
    const titles = ['شناخت من', 'علایق', 'توانایی‌ها', 'هدف', 'رشته', 'شغل', 'برنامه', 'کوچینگ', 'مشاوره', 'مسیر نهایی'];
    const draw = () => {
      const nav = h('div', { class: 'row between', style: 'margin-top:1rem' }, step > 0 ? MM.btn('قبلی', () => { step--; draw(); }) : h('span'), step < 9 ? MM.btn('بعدی', async () => { if (!(await save())) return; step++; draw(); }, 'primary') : MM.btn('پایان و مشاهده‌ی مسیر', async () => { if (await save()) { m.close(); MM.navigate(); } }, 'primary'));
      MM.mount(body, h('div', { class: 'steps' }, titles.map((t, i) => h('i', { class: i <= step ? 'on' : '' }))), h('h3', null, `${MM.fa(step + 1)}. ${titles[step]}`), content(), nav);
    };
    const inp = (k, label, list) => MM.field(label, MM.select(k, [['', 'انتخاب کن…'], ...list], st[k]));
    function content() {
      switch (step) {
        case 0: { const f = h('div', null, MM.field('پایه‌ی تحصیلی', h('select', { onchange: (e) => (st.grade = e.target.value) }, [h('option', { value: '' }, 'انتخاب کن…'), ...grades.map(g => h('option', { value: g, selected: g === st.grade }, g))])), MM.field('رشته‌ی دبیرستان', h('select', { onchange: (e) => (st.field_of_study = e.target.value) }, [h('option', { value: '' }, 'انتخاب کن…'), ...fields.map(g => h('option', { value: g, selected: g === st.field_of_study }, g))])), MM.field('شهر', h('select', { onchange: (e) => (st.city = e.target.value) }, [h('option', { value: '' }, 'انتخاب کن…'), ...cities.map(g => h('option', { value: g, selected: g === st.city }, g))]))); return f; }
        case 1: return h('div', null, h('p', null, path.ready ? 'تست علاقه را انجام داده‌ای ✓ نتیجه در صفحه‌ی مسیر دیده می‌شود.' : 'برای شناخت علایقت تست علاقه (RIASEC) را انجام بده.'), MM.link('رفتن به تست علاقه', '#/tests/holland-interest', 'btn'));
        case 2: return h('div', null, h('p', null, 'برای شناخت توانایی‌ها و ویژگی‌هایت این تست‌ها را انجام بده:'), h('div', { class: 'row' }, MM.link('تست استعداد', '#/tests/aptitude-basic', 'btn sm'), MM.link('هوش‌های چندگانه', '#/tests/multiple-intelligences', 'btn sm'), MM.link('شخصیت شغلی', '#/tests/big-five-mini', 'btn sm'), MM.link('ارزش‌های کاری', '#/tests/work-values', 'btn sm')));
        case 3: return MM.field('هدفت برای آینده چیست؟ (به زبان خودت)', h('textarea', { maxlength: 300, oninput: (e) => (st.goal_text = e.target.value), placeholder: 'مثلاً: می‌خواهم برنامه‌نویس شوم' }, st.goal_text));
        case 4: return h('div', null, MM.field('رشته‌ی مورد نظرت را انتخاب کن (می‌توانی بعداً عوض کنی)', h('select', { onchange: (e) => (st.chosen_major_slug = e.target.value) }, [h('option', { value: '' }, 'هنوز نمی‌دانم'), ...maj.items.map(x => h('option', { value: x.slug, selected: x.slug === st.chosen_major_slug }, x.name))])), h('p', { class: 'muted small' }, 'پیشنهادها: ' + path.majors.map(x => x.name).join('، ')));
        case 5: return h('div', null, MM.field('شغل مورد نظرت', h('select', { onchange: (e) => (st.chosen_job_slug = e.target.value) }, [h('option', { value: '' }, 'هنوز نمی‌دانم'), ...jb.items.map(x => h('option', { value: x.slug, selected: x.slug === st.chosen_job_slug }, x.name))])), h('p', { class: 'muted small' }, 'پیشنهادها: ' + path.jobs.map(x => x.name).join('، ')));
        case 6: return h('div', null, h('p', null, 'برنامه‌ی مطالعه یا کنکورت را بساز:'), h('div', { class: 'row' }, MM.link('برنامه مطالعه', '#/study-plan', 'btn'), MM.link('برنامه کنکور', '#/exam-plan', 'btn')));
        case 7: return h('div', null, h('p', null, 'کوچینگ تصمیم را به اقدام تبدیل می‌کند و پیگیری می‌کند.'), MM.link('رفتن به کوچ من', '#/coach', 'btn'));
        case 8: return h('div', null, h('div', { class: 'paid' }, 'مشاوره‌ی انسانی پولی است.'), h('p', null, 'می‌توانی با مشاور، منتور یا متخصص واقعی صحبت کنی.'), MM.link('مشاهده‌ی افراد', '#/consult', 'btn'));
        default: return h('p', null, 'همه‌چیز آماده است! با «پایان» انتخاب‌هایت ذخیره می‌شود و مسیر نهایی را می‌بینی.');
      }
    }
    async function save() { try { await MM.post('/api/my/wizard/finish', st); return true; } catch (e) { MM.err(e); return false; } }
    m = MM.modal('ویزارد مسیر من', body); draw();
  }

  // ---------- رشته‌ها ----------
  const HOL = { R: 'عملی', I: 'پژوهشی', A: 'هنری', S: 'اجتماعی', E: 'کارآفرین', C: 'سازمانی' };
  const holTags = (codes) => h('div', { class: 'tags' }, MM.csv(codes).map(c => h('span', { class: 'tag' }, HOL[c] || c)));
  function listPage(kind, title, nameKey, descKey, icon) {
    MM.route('/' + kind, title, async ({ query }) => {
      const st = { q: '', group: query.group || '', holland: query.holland || '' };
      const wrap = h('div', { class: 'page' }, h('h1', null, icon + ' ' + title)); const list = h('div', { class: 'grid g2' }); const count = h('p', { class: 'small muted', 'aria-live': 'polite' });
      const chips = h('div', { class: 'stack' });
      const draw = () => {
        const groups = kind === 'majors' ? MM.parse(MM.S('konkur_groups', '[]'), []) : [];
        const chip = (label, on, fn) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), onclick: fn }, label);
        MM.mount(chips,
          groups.length ? h('div', { class: 'chips', role: 'group', 'aria-label': 'گروه آزمایشی' }, [chip('همه‌ی گروه‌ها', !st.group, () => { st.group = ''; go(); }), ...groups.map(g => chip(g, st.group === g, () => { st.group = g; go(); }))]) : null,
          h('div', { class: 'chips', role: 'group', 'aria-label': 'تیپ علاقه' }, [chip('همه‌ی تیپ‌ها', !st.holland, () => { st.holland = ''; go(); }), ...Object.entries(HOL).map(([k, l]) => chip(l, st.holland === k, () => { st.holland = k; go(); }))]));
      };
      const load = async () => {
        const qs = new URLSearchParams(); if (st.q) qs.set('q', st.q); if (st.group) qs.set('group', st.group); if (st.holland) qs.set('holland', st.holland);
        const r = await MM.get(`/api/${kind}?${qs}`);
        count.textContent = MM.fa(r.items.length) + ' مورد';
        MM.mount(list, r.items.length ? r.items.map(x => h('a', { class: 'tile', href: `#/${kind}/${x.slug}` }, h('h3', null, x[nameKey]), kind === 'majors' && x.konkur_group ? h('div', { class: 'small' }, MM.badge(x.konkur_group)) : null, h('p', { class: 'muted small' }, (x[descKey] || '').slice(0, 130)), x.holland_codes ? holTags(x.holland_codes) : null)) : [MM.empty('چیزی پیدا نشد', 'فیلتر یا عبارت جست‌وجو را تغییر بده.')]);
      };
      const go = () => { draw(); load().catch(MM.err); };
      let t; wrap.appendChild(h('input', { type: 'search', placeholder: 'جست‌وجو…', 'aria-label': 'جست‌وجو', oninput: (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load().catch(MM.err); }, 300); } }));
      wrap.appendChild(chips); wrap.appendChild(count); wrap.appendChild(list); draw(); await load(); return wrap;
    });
  }
  listPage('majors', 'انتخاب رشته', 'name', 'description', '🎓'); listPage('jobs', 'مشاغل', 'name', 'intro', '💼');

  const sec = (title, text, mode) => text ? MM.card('', h('h2', null, title), mode === 'tags' ? MM.tags(text) : (MM.bullets(text) || h('p', null, text))) : null;
  const relLinks = (title, arr, base) => arr && arr.length ? MM.card('', h('h2', null, title), h('div', { class: 'row' }, arr.map(x => MM.link(x.name, `#/${base}/${x.slug}`, 'btn sm')))) : null;
  const faqBlock = (faq) => { const l = MM.lines(faq); if (!l.length) return null; return MM.card('', h('h2', null, '❓ سؤالات متداول'), l.map(x => { const i = x.search(/[؟?]/); const q = i > 0 ? x.slice(0, i + 1) : x; const a = i > 0 ? x.slice(i + 1) : ''; return h('details', null, h('summary', null, q.trim()), h('p', { class: 'muted' }, a.trim())); })); };
  MM.route('/majors/:id', 'رشته', async ({ params }) => {
    const { item: m, related } = await MM.get('/api/majors/' + params.id);
    return h('div', null, MM.link('‹ همه‌ی رشته‌ها', '#/majors', 'btn sm'), h('h1', null, m.name), MM.card('', h('p', null, m.description), MM.tags(m.holland_codes), m.konkur_group ? h('p', { class: 'small muted' }, 'گروه آزمایشی: ' + m.konkur_group) : null),
      sec('برای چه افرادی مناسب است؟', m.suitable_for), sec('درس‌های مهم', m.key_lessons), sec('توانایی‌های لازم', m.abilities), sec('مهارت‌ها', m.skills), sec('دانشگاه‌ها', m.universities), sec('مسیر تحصیلی', m.study_path), relLinks('💼 مشاغل مرتبط', related.jobs, 'jobs'),
      sec('بازار کار', m.job_market), sec('مهارت‌های آینده', m.future_skills), sec('مزایا', m.pros), sec('چالش‌ها', m.challenges), faqBlock(m.faq), relLinks('رشته‌های مشابه', related.similar, 'majors'),
      MM.card('hl', h('h3', null, 'این رشته را برای مسیرم انتخاب کن'), h('div', { class: 'row' }, MM.token() ? MM.btn('انتخاب به‌عنوان رشته‌ی من', (e) => MM.busy(e.target, async () => { await MM.put('/api/me/profile', { chosen_major_slug: m.slug }); MM.toast('رشته‌ی مسیر تو ثبت شد ✓'); })) : MM.link('ورود برای انتخاب', '#/login', 'btn'), MM.link('صحبت با یک متخصص', '#/consult', 'btn'))));
  });
  MM.route('/jobs/:id', 'شغل', async ({ params }) => {
    const { item: j, related } = await MM.get('/api/jobs/' + params.id);
    return h('div', null, MM.link('‹ همه‌ی مشاغل', '#/jobs', 'btn sm'), h('h1', null, j.name), MM.card('', h('p', null, j.intro), MM.tags(j.holland_codes)),
      sec('وظایف', j.duties), sec('مهارت‌ها', j.skills), relLinks('🎓 رشته‌های مرتبط', related.majors, 'majors'), sec('مسیر ورود', j.entry_path), sec('تحصیلات', j.education), sec('مهارت‌های ضروری', j.essential_skills), sec('ابزارها', j.tools, 'tags'), sec('محیط کار', j.work_env), sec('مسیر رشد', j.growth_path), faqBlock(j.faq),
      related.experts && related.experts.length ? MM.card('', h('h2', null, '🤝 افراد متخصص مرتبط'), related.experts.map(x => h('a', { class: 'item', href: '#/consult/' + x.id }, h('div', { class: 'grow' }, h('strong', null, x.name), h('p', { class: 'muted small' }, x.specialty)), '‹'))) : null,
      MM.card('hl', MM.token() ? MM.btn('انتخاب به‌عنوان شغل مورد نظر من', (e) => MM.busy(e.target, async () => { await MM.put('/api/me/profile', { chosen_job_slug: j.slug }); MM.toast('شغل مسیر تو ثبت شد ✓'); })) : MM.link('ورود برای انتخاب', '#/login', 'btn')));
  });
  MM.adBanner = adBanner;
})();
