// انتخاب رشته‌ی کنکور: راهنمای گام‌به‌گام (رایگان) + تحلیل سه‌دسته‌ای و چیدمان پیشنهادی (ممکن است پولی باشد؛ از پنل تنظیم می‌شود)
(function () {
  const { h } = MM;
  const TIER = { ambitious: ['🚀 خوش‌بینانه', 'کمی بالاتر از رتبه‌ی تو؛ شانس کمتر ولی ارزش امتحان کردن دارد.'], realistic: ['🎯 منطقی', 'هم‌سطح رتبه‌ی تو؛ هسته‌ی اصلی لیست.'], safe: ['🛟 مطمئن', 'محتمل‌تر؛ ته لیست بگذار تا بی‌دانشگاه نمانی.'] };
  const FEATURE_KEY = 'feature:konkur_pick';

  // انتخاب چندتایی ساده با «چیپ»
  function chips(label, options, state, key) {
    const box = h('div', { class: 'tags' }); const sel = h('select', null);
    const draw = () => {
      MM.mount(box, state[key].map(v => h('span', { class: 'tag', style: 'cursor:pointer', title: 'حذف', onclick: () => { state[key] = state[key].filter(x => x !== v); draw(); } }, (options.find(o => o[0] === v) || [v, v])[1] + ' ✕')));
      MM.mount(sel, [h('option', { value: '' }, 'افزودن…'), ...options.filter(o => !state[key].includes(o[0])).map(o => h('option', { value: o[0] }, o[1]))]);
    };
    sel.onchange = () => { if (sel.value) { state[key].push(sel.value); draw(); } };
    draw();
    return MM.field(label, h('div', null, sel, box));
  }

  function tierCard(k, list, count) {
    if (!list.length) return null;
    return MM.card('', h('h2', null, `${TIER[k][0]} (${MM.fa(count)})`), h('p', { class: 'muted small' }, TIER[k][1]),
      list.slice(0, 15).map(x => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, x.field_name), h('p', { class: 'muted small' }, [x.university, x.city, x.course_type, 'کد ' + x.code].filter(Boolean).join(' • '))), x.likes ? h('span', { class: 'tag' }, 'علاقه‌ی تو') : null)),
      list.length > 15 ? h('p', { class: 'muted small' }, `و ${MM.fa(list.length - 15)} گزینه‌ی دیگر در «لیست پیشنهادی کامل» پایین صفحه.`) : null);
  }

  MM.route('/konkur-pick', 'انتخاب رشته‌ی کنکور', async () => {
    const info = await MM.get('/api/konkur/info');
    const wrap = h('div', { class: 'narrow' }, h('h1', null, '🎓 انتخاب رشته‌ی کنکور'),
      h('p', { class: 'muted' }, 'روش امروزی و مورد استفاده‌ی مشاوران: اول علاقه، بعد تحلیل سه‌دسته‌ای با داده‌ی سال‌های قبل، بعد چیدمان نهایی تا ' + MM.fa(info.max_choices) + ' انتخاب.'));
    wrap.appendChild(MM.card('', h('h2', null, '🧭 روش گام‌به‌گام'), h('div', { class: 'timeline' }, info.guide.map((s, i) => h('div', { class: 'tl' }, h('strong', null, MM.fa(i + 1) + '. ' + s.title), h('p', { class: 'small muted' }, s.text))))));

    const f = info.feature;
    if (!f.has_access) {
      let purchase = null;
      if (MM.token()) { const mine = await MM.get('/api/purchases/mine').catch(() => ({ items: [] })); purchase = mine.items.find(x => x.product_key === FEATURE_KEY); }
      wrap.appendChild(MM.card('hl', h('h2', null, '🔒 تحلیل شخصی و چیدمان لیست'), h('div', { class: 'notice warn' }, 'این بخش پولی است — ', h('strong', null, MM.money(f.price)), '.'),
        !MM.token() ? MM.btn('ورود برای خرید', () => { sessionStorage.setItem('mm_after', location.hash); MM.go('/login'); }, 'primary')
          : purchase && purchase.status === 'payment_submitted' ? h('p', { class: 'notice' }, 'پرداخت ثبت شده و در انتظار تأیید مدیر است.')
          : MM.btn(purchase ? 'ادامه‌ی پرداخت' : 'خرید این بخش', (e) => MM.busy(e.target, async () => {
              let r = purchase; if (!r) r = await MM.post('/api/purchases', { product_key: FEATURE_KEY });
              if (r.final_amount > 0) MM.paymentModal(r.id, r.final_amount, () => MM.navigate()); else { MM.toast('باز شد!'); MM.navigate(); }
            }), 'primary')));
      return wrap;
    }
    if (!MM.token()) { wrap.appendChild(MM.card('', h('p', null, 'برای تحلیل شخصی وارد حسابت شو.'), MM.btn('ورود', () => { sessionStorage.setItem('mm_after', location.hash); MM.go('/login'); }, 'primary'))); return wrap; }
    if (!info.groups.length) wrap.appendChild(h('div', { class: 'notice' }, 'فهرست رشته‌محل‌ها هنوز در سایت بارگذاری نشده؛ ولی می‌توانی تحلیل را اجرا کنی تا راهنمای مرحله‌ای را ببینی.'));

    const majors = (await MM.get('/api/majors').catch(() => ({ items: [] }))).items;
    const st = { interests: [], cities: [], course_types: [] };
    const out = h('div');
    const groups = info.groups.length ? info.groups.map(g => g.name) : MM.parse(MM.S('konkur_groups', ''), ['ریاضی', 'تجربی', 'انسانی', 'هنر', 'زبان']);
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); MM.busy(e.target.querySelector('button[type=submit]'), async () => {
      const v = MM.formData(form);
      const r = await MM.post('/api/konkur/analyze', { group: v.group, rank: v.rank, region: Number(v.region), interests: st.interests, cities: st.cities, course_types: st.course_types });
      MM.mount(out, result(r));
    }); } },
      h('div', { class: 'formgrid' }, MM.field('گروه آزمایشی', MM.select('group', [['', 'انتخاب کن'], ...groups])), MM.field('رتبه‌ات در سهمیه‌ی خودت', h('input', { name: 'rank', inputmode: 'numeric', required: true, placeholder: 'مثلاً ۴۵۰۰' })),
        MM.field('منطقه‌ی سهمیه', MM.select('region', [['3', 'منطقه ۳ (عمومی)'], ['2', 'منطقه ۲'], ['1', 'منطقه ۱']]))),
      chips('رشته‌های مورد علاقه (اختیاری ولی مهم)', majors.map(m => [m.slug, m.name]), st, 'interests'),
      chips('شهرهای ترجیحی (اختیاری)', (info.cities || []).map(c => [c, c]), st, 'cities'),
      info.course_types.length ? chips('فقط این دوره‌ها (اختیاری)', info.course_types.map(c => [c, c]), st, 'course_types') : null,
      h('button', { class: 'btn primary', type: 'submit' }, 'تحلیل کن و لیستم را بچین'));
    wrap.appendChild(MM.card('', h('h2', null, '🧮 تحلیل شخصی'), form)); wrap.appendChild(out);
    return wrap;
  });

  function result(r) {
    const w = h('div');
    w.appendChild(MM.narrative(r.narrative, '💬 نظر من درباره‌ی لیستت'));
    if (r.mode === 'guide_only') return w;
    for (const k of ['ambitious', 'realistic', 'safe']) { const c = tierCard(k, r.tiers[k], r.counts[k]); if (c) w.appendChild(c); }
    if (r.form.length) w.appendChild(h('details', { class: 'card' }, h('summary', null, `📋 لیست پیشنهادی کامل (${MM.fa(r.form.length)} گزینه — پیش‌نویس)`),
      h('p', { class: 'muted small' }, 'ترتیب نهایی را خودت تعیین کن؛ این فقط پیش‌نویس است. کدها را با دفترچه‌ی رسمی تطبیق بده.'),
      h('ol', null, r.form.map(x => h('li', null, `${x.field_name} — ${x.university}${x.city ? ' (' + x.city + ')' : ''} • کد ${x.code}`)))));
    return w;
  }
})();
