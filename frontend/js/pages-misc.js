/* منابع، مقالات، مشاور AI، پروفایل، سؤالات متداول، حریم خصوصی و شرایط */
(function () {
  const { h } = MM;

  function filterBar(placeholder, q, cats, cat, base) {
    const go = (nq, nc) => MM.go(base + '?q=' + encodeURIComponent(nq || '') + '&category=' + encodeURIComponent(nc || ''));
    const inp = h('input', { type: 'search', value: q || '', placeholder, 'aria-label': 'جست‌وجو', onkeydown: (e) => { if (e.key === 'Enter') go(e.target.value, cat); } });
    return h('div', { class: 'stack' }, inp, cats.length ? h('div', { class: 'chips' }, [h('a', { class: 'chip' + (!cat ? ' on' : ''), href: '#' + base + '?q=' + encodeURIComponent(q || '') }, 'همه'), ...cats.map(c => h('a', { class: 'chip' + (c === cat ? ' on' : ''), href: '#' + base + '?q=' + encodeURIComponent(q || '') + '&category=' + encodeURIComponent(c) }, c))]) : null);
  }
  const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => v && p.set(k, v)); return p.toString(); };
  const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : null;

  // ---------- منابع و کتاب‌ها ----------
  MM.route('/resources', 'منابع و کتاب‌ها', async ({ query }) => {
    const [d, c] = await Promise.all([MM.get('/api/resources?' + qs({ q: query.q, category: query.category })), MM.get('/api/categories/resources').catch(() => ({ items: [] }))]);
    return h('div', { class: 'page' }, h('h1', null, 'منابع و کتاب‌ها'), filterBar('جست‌وجوی عنوان یا نویسنده…', query.q, c.items, query.category, '/resources'),
      d.items.length ? h('div', { class: 'grid g3' }, d.items.map(r => h('article', { class: 'card' },
        r.image_url && safeUrl(r.image_url) ? h('img', { class: 'cover', src: r.image_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
        h('h3', null, r.title), h('div', { class: 'small muted' }, [r.author, r.publisher].filter(Boolean).join(' · ')),
        h('div', { class: 'row' }, r.category ? MM.badge(r.category) : null, r.level ? MM.badge(r.level) : null),
        r.description ? h('p', { class: 'small' }, r.description) : null,
        safeUrl(r.link_url) ? h('a', { class: 'btn block', href: r.link_url, target: '_blank', rel: 'noopener noreferrer nofollow' }, 'مشاهده / خرید') : null)))
        : MM.empty('منبعی پیدا نشد', 'جست‌وجو یا دسته را تغییر بده.'));
  });

  // ---------- مقالات ----------
  MM.route('/articles', 'مقالات', async ({ query }) => {
    const [d, c] = await Promise.all([MM.get('/api/articles?' + qs({ q: query.q, category: query.category })), MM.get('/api/categories/articles').catch(() => ({ items: [] }))]);
    return h('div', { class: 'page' }, h('h1', null, 'مقالات و مطالب آموزشی'), filterBar('جست‌وجو در مقالات…', query.q, c.items, query.category, '/articles'),
      d.items.length ? h('div', { class: 'grid g3' }, d.items.map(a => h('a', { class: 'card link', href: '#/articles/' + a.slug },
        a.image_url && safeUrl(a.image_url) ? h('img', { class: 'cover', src: a.image_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
        h('h3', null, a.title), a.category ? MM.badge(a.category) : null, h('p', { class: 'small' }, a.summary || ''), h('div', { class: 'small muted' }, MM.dateOnly(a.published_at || a.created_at))))) : MM.empty('مقاله‌ای پیدا نشد'));
  });
  MM.route('/articles/:id', 'مقاله', async ({ params }) => {
    const a = (await MM.get('/api/articles/' + encodeURIComponent(params.id))).item;
    document.title = a.title + ' | ' + (MM.siteName || 'مسیر من');
    return h('article', { class: 'page narrow' }, MM.link('← همه‌ی مقالات', '#/articles', 'btn ghost'), h('h1', null, a.title),
      h('div', { class: 'small muted' }, [a.author, MM.dateOnly(a.published_at || a.created_at)].filter(Boolean).join(' · ')),
      a.image_url && safeUrl(a.image_url) ? h('img', { class: 'cover wide', src: a.image_url, alt: '', referrerpolicy: 'no-referrer' }) : null,
      MM.card('prose', MM.richText(a.body || '')));
  });

  // ---------- مشاور AI ----------
  MM.route('/ai', 'مشاور AI', async () => {
    const st = await MM.get('/api/ai/status').catch(() => ({ enabled: false }));
    const wrap = h('div', { class: 'page narrow' }, h('h1', null, '🤖 مشاور AI رایگان'),
      h('p', { class: 'muted' }, 'درباره‌ی رشته، شغل، کنکور، برنامه‌ی مطالعه و مسیر شغلی بپرس. پاسخ‌ها بر پایه‌ی داده‌های همین پلتفرم و اطلاعات خودت ساخته می‌شود، ولی جای تصمیم‌گیری نهایی با مشاور انسانی را نمی‌گیرد.'));
    if (!st.enabled) return (wrap.appendChild(MM.card('', h('p', null, 'مشاور AI فعلاً در دسترس نیست. بقیه‌ی بخش‌های سایت کار می‌کنند.'), h('div', { class: 'row' }, MM.link('تست‌ها', '#/tests', 'btn'), MM.link('مشاوره‌ی انسانی', '#/consult', 'btn')))), wrap);
    if (!MM.token()) return (wrap.appendChild(MM.card('', h('p', null, 'برای استفاده از مشاور AI وارد حساب شو.'), MM.link('ورود', '#/login', 'btn primary'))), wrap);
    const log = h('div', { class: 'chat', 'aria-live': 'polite' });
    const bubble = (role, text) => { const b = h('div', { class: 'msg ' + (role === 'user' ? 'user' : 'assistant') }, MM.richText(text)); log.appendChild(b); b.scrollIntoView({ block: 'end' }); return b; };
    try { (await MM.get('/api/ai/history')).items.forEach(m => bubble(m.role, m.content)); } catch { /* تاریخچه اختیاری است */ }
    if (!log.children.length) bubble('assistant', 'سلام! چه چیزی درباره‌ی مسیر تحصیلی یا شغلی‌ات می‌خواهی بدانی؟');
    const inp = h('textarea', { rows: 2, maxlength: 1000, placeholder: 'سؤالت را بنویس…', 'aria-label': 'پیام' });
    const send = MM.btn('ارسال', () => MM.busy(send, async () => {
      const text = inp.value.trim(); if (text.length < 2) return; inp.value = ''; bubble('user', text); const wait = bubble('assistant', '…');
      try { const r = await MM.post('/api/ai/chat', { message: text }); wait.replaceWith(h('div', { class: 'msg assistant' }, MM.richText(r.reply || r.message || ''))); }
      catch (e) { wait.replaceWith(h('div', { class: 'msg assistant err' }, e.message || 'پاسخی دریافت نشد.')); }
      log.lastChild && log.lastChild.scrollIntoView({ block: 'end' });
    }), 'primary');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send.click(); });
    wrap.appendChild(MM.card('', log, h('div', { class: 'stack' }, inp, h('div', { class: 'row between' }, send, MM.btn('پاک‌کردن تاریخچه', async () => { if (await MM.confirm('تاریخچه‌ی گفتگو پاک شود؟')) { await MM.del('/api/ai/history').catch(MM.err); MM.navigate(); } }, 'sm')))));
    wrap.appendChild(h('p', { class: 'small muted' }, 'اطلاعات حساس (شماره تماس، آدرس، مشخصات هویتی) در گفتگو ننویس.'));
    return wrap;
  }, { auth: true });

  // ---------- پروفایل ----------
  MM.route('/profile', 'پروفایل من', async () => {
    const [me, ref] = await Promise.all([MM.get('/api/me'), MM.get('/api/me/referral').catch(() => null)]);
    const p = me.profile || {}; const u = me.user;
    const list = (k) => MM.parse(MM.S(k, '[]'), []);
    const opt = (arr, cur) => [['', 'انتخاب کن'], ...arr.map(x => [x, x])];
    const f = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() },
      MM.field('نام', h('input', { name: 'name', value: u.name || '', required: true, maxlength: 100 })),
      MM.field('پایه', MM.select('grade', opt(list('grades')), p.grade || '')), MM.field('رشته', MM.select('field_of_study', opt(list('fields')), p.field_of_study || '')),
      MM.field('شهر', MM.select('city', opt(list('cities')), p.city || '')), MM.field('سال تولد (شمسی)', h('input', { name: 'birth_year', type: 'number', inputmode: 'numeric', value: p.birth_year || '', min: 1300, max: 1420 }), 'برای رعایت ملاحظات ایمنی کاربران زیر ۱۸ سال؛ اختیاری.'),
      MM.field('درس‌های مورد علاقه', h('input', { name: 'favorite_lessons', value: p.favorite_lessons || '' })), MM.field('هدفم', h('textarea', { name: 'goal_text', rows: 3 }, p.goal_text || '')),
      MM.btn('ذخیره', (e) => MM.busy(e.target, async () => { const d = MM.formData(f); d.birth_year = d.birth_year ? Number(d.birth_year) : null; Object.keys(d).forEach(k => { if (d[k] === '' && k !== 'birth_year') d[k] = ''; }); await MM.put('/api/me/profile', d); const n = await MM.get('/api/me'); MM.setSession(MM.token(), n.user); MM.toast('ذخیره شد.'); }), 'primary'));
    const out = [h('h1', null, 'پروفایل من'), MM.card('', h('p', { class: 'small muted', dir: 'ltr' }, u.email || ''), f)];

    if (ref && ref.enabled) {
      const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '#/register?ref=' + ref.code;
      const inp = h('input', { readonly: true, value: link, dir: 'ltr', 'aria-label': 'لینک دعوت', onfocus: (e) => e.target.select() });
      out.push(MM.card('', h('h2', null, '🎁 دعوت از دوستان'),
        h('p', null, `دوستانت را دعوت کن. وقتی با لینک تو ثبت‌نام کنند، دوستت ${MM.fa(ref.invitee_percent)}٪ و تو ${MM.fa(ref.inviter_percent)}٪ کد تخفیف خدمات پولی می‌گیرید (حداکثر ${MM.fa(ref.max_rewards)} دعوت پاداش‌دار).`), inp,
        h('div', { class: 'row' }, MM.btn('کپی لینک', async () => { try { await navigator.clipboard.writeText(link); MM.toast('لینک کپی شد.'); } catch { inp.select(); MM.toast('لینک را انتخاب کردم؛ کپی کن.'); } }, 'primary'),
          navigator.share ? MM.btn('اشتراک‌گذاری', () => navigator.share({ title: MM.siteName || 'مسیر من', text: 'با این لینک در مسیر من ثبت‌نام کن و کد تخفیف بگیر.', url: link }).catch(() => { }), '') : null),
        h('p', { class: 'small muted' }, `دعوت‌شده‌ها: ${MM.fa(ref.invited)}`),
        ref.coupons.length ? h('div', null, h('h3', null, 'کدهای تخفیف من'), ref.coupons.map(c => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', { dir: 'ltr', class: 'mono' }, c.code), h('div', { class: 'small muted' }, `${MM.fa(c.percent)}٪` + (c.expires_at ? ' · تا ' + MM.dateOnly(c.expires_at) : ''))), MM.badge(c.is_used ? 'استفاده‌شده' : 'فعال', c.is_used ? '' : 'good')))) : null));
    }

    const pw = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() }, MM.field('رمز فعلی', h('input', { name: 'old_password', type: 'password', autocomplete: 'current-password', required: true })), MM.field('رمز جدید', h('input', { name: 'new_password', type: 'password', autocomplete: 'new-password', required: true }), 'حداقل ۸ نویسه، شامل حرف و عدد'),
      MM.btn('تغییر رمز', (e) => MM.busy(e.target, async () => { await MM.post('/api/auth/change-password', MM.formData(pw)); pw.reset(); MM.toast('رمز تغییر کرد.'); }), 'primary'));
    out.push(MM.card('', h('h2', null, 'امنیت'), pw));
    out.push(MM.card('', h('div', { class: 'row wrap' }, MM.link('مسیر من', '#/my-path', 'btn'), MM.link('درخواست‌های من', '#/requests', 'btn'), MM.link('پنل ارائه‌دهنده', '#/provider', 'btn'),
      ['admin', 'editor'].includes(u.role) ? h('a', { class: 'btn', href: 'admin/' }, 'پنل مدیریت') : null)));
    out.push(MM.card('', h('div', { class: 'row wrap' },
      MM.btn('خروج', async () => { try { await MM.post('/api/auth/logout'); } catch { /* ignore */ } MM.logoutLocal(); MM.toast('خارج شدی.'); MM.go('/'); location.reload(); }),
      MM.btn('حذف حساب', () => {
        const f2 = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() }, h('p', null, 'با حذف حساب، همه‌ی اطلاعات و نتایج تو پاک می‌شود و برگشت‌پذیر نیست.'), MM.field('رمز عبور برای تأیید', h('input', { name: 'password', type: 'password', required: true })));
        const m = MM.modal('حذف حساب', f2, [MM.btn('حذف دائمی', (e) => MM.busy(e.target, async () => { await MM.post('/api/auth/delete-account', { password: MM.formData(f2).password }); MM.logoutLocal(); m.close(); MM.toast('حساب حذف شد.'); location.hash = '#/'; location.reload(); }), 'danger'), MM.btn('انصراف', () => m.close())]);
      }, 'danger'))));
    return h('div', { class: 'page narrow stack' }, out);
  }, { auth: true });

  // ---------- FAQ، حریم خصوصی، شرایط ----------
  MM.route('/faq', 'سؤالات متداول', async () => {
    const d = await MM.get('/api/faqs');
    return h('div', { class: 'page narrow' }, h('h1', null, 'سؤالات متداول'), d.items.length ? d.items.map(x => h('details', { class: 'card' }, h('summary', null, x.question), MM.richText(x.answer))) : MM.empty('هنوز سؤالی ثبت نشده'));
  });
  const textPage = (path, title, key) => MM.route(path, title, () => h('div', { class: 'page narrow' }, h('h1', null, title), MM.card('prose', MM.S(key) ? MM.richText(MM.S(key)) : h('p', { class: 'muted' }, 'متن این صفحه هنوز توسط مدیر ثبت نشده است.'))));
  textPage('/privacy', 'حریم خصوصی', 'privacy_policy'); textPage('/terms', 'شرایط استفاده', 'terms_text');
})();
