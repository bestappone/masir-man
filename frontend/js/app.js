/* راه‌اندازی برنامه: منو، پایین‌صفحه، بارگذاری تنظیمات، ثبت Service Worker */
(function () {
  const { h } = MM;
  const MENU = [
    ['/', 'خانه', '🏠'], ['/my-path', 'مسیر من', '🧭'], ['/tests', 'تست‌ها', '📝'], ['/majors', 'انتخاب رشته', '🎓'], ['/jobs', 'مشاغل', '💼'],
    ['/study-plan', 'برنامه مطالعه', '📅'], ['/exam-plan', 'برنامه کنکور', '⏳'], ['/coach', 'کوچ من', '🎯'], ['/consult', 'مشاوره', '🤝'],
    ['/ai', 'مشاور AI', '🤖'], ['/resources', 'منابع و کتاب‌ها', '📚'], ['/articles', 'مقالات', '📰'], ['/profile', 'پروفایل من', '👤'],
  ];
  const TABS = [['/', 'خانه', '🏠'], ['/my-path', 'مسیر من', '🧭'], ['/tests', 'تست‌ها', '📝'], ['/coach', 'کوچ من', '🎯']];
  const cur = () => MM.parseHash().path;
  const isOn = (p) => (p === '/' ? cur() === '/' : cur().startsWith(p));

  MM.setActive = () => { document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', isOn(a.dataset.nav))); };

  MM.renderNav = function () {
    const top = document.getElementById('top'); const tab = document.getElementById('tabbar');
    const loggedIn = !!MM.token();
    MM.mount(top, h('div', { class: 'top-in' },
      h('a', { class: 'brand', href: '#/' }, h('img', { src: 'assets/icon.svg', alt: '' }), h('span', null, MM.siteName || 'مسیر من')),
      h('nav', { class: 'nav-links', 'aria-label': 'منوی اصلی' }, MENU.map(([p, t]) => h('a', { href: '#' + p, 'data-nav': p }, t))),
      h('span', { class: 'spacer' }),
      loggedIn ? null : h('a', { class: 'btn sm primary', href: '#/login' }, 'ورود / ثبت‌نام'),
      h('button', { id: 'menuBtn', class: 'icon-btn', 'aria-label': 'منو', onclick: openDrawer }, '☰')));
    MM.mount(tab, TABS.map(([p, t, i]) => h('a', { href: '#' + p, 'data-nav': p }, h('span', { class: 'ti' }, i), t)),
      h('button', { onclick: openDrawer, 'aria-label': 'همه‌ی بخش‌ها' }, h('span', { class: 'ti' }, '☰'), 'بیشتر'));
    MM.setActive();
  };
  function openDrawer() {
    const close = () => d.remove();
    const d = h('div', { class: 'drawer', onclick: (e) => { if (e.target === d) close(); } },
      h('div', { class: 'drawer-in' },
        h('div', { class: 'row between' }, h('strong', null, MM.siteName || 'مسیر من'), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'بستن' }, '✕')),
        MENU.map(([p, t, i]) => h('a', { href: '#' + p, 'data-nav': p, onclick: close }, h('span', null, i), t)),
        h('hr'), h('a', { href: '#/faq', onclick: close }, '❓ سؤالات متداول'), h('a', { href: '#/privacy', onclick: close }, '🔒 حریم خصوصی'), h('a', { href: '#/terms', onclick: close }, '📄 قوانین'),
        MM.token() ? h('a', { href: '#/provider', onclick: close }, '🧑‍🏫 پنل مشاور/کوچ') : h('a', { href: '#/login', onclick: close }, '🔑 ورود / ثبت‌نام'),
        h('a', { href: 'admin/', onclick: close }, '⚙️ پنل مدیریت')));
    document.body.appendChild(d); MM.setActive();
  }
  function renderFooter() {
    MM.mount(document.getElementById('foot'),
      h('div', null, MM.S('footer_text', '')),
      h('div', null, h('a', { href: '#/faq' }, 'سؤالات متداول'), h('a', { href: '#/privacy' }, 'حریم خصوصی'), h('a', { href: '#/terms' }, 'قوانین'), MM.S('contact_email') ? h('span', null, 'ارتباط: ' + MM.S('contact_email')) : null));
  }

  async function boot() {
    await MM.loadSettings(); MM.renderNav(); renderFooter();
    window.addEventListener('hashchange', () => { MM.navigate(); });
    if (MM.token()) { MM.get('/api/me').then(r => { MM.user = r.user; localStorage.setItem('mm_user', JSON.stringify(r.user)); }).catch(() => {}); }
    MM.navigate();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
