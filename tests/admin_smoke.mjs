// تست دود پنل مدیریت: DOM ساده‌ی شبیه‌سازی‌شده + Worker واقعی + دیتابیس تست
import fs from 'node:fs'; import vm from 'node:vm';
import { makeDB } from './d1shim.mjs'; import worker from '../worker/src/index.js';
const DB = makeDB(fs.readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort().map(f => 'worker/migrations/' + f));
const env = { DB, ALLOWED_ORIGINS: '*', SETUP_KEY: 'setup-key-123', SESSION_DAYS: '7' };

class N { constructor(tag) { this.tag = tag; this.childNodes = []; this.attrs = {}; this.className = ''; this.listeners = {}; this.parentNode = null; this.classList = { add: c => { this.className += ' ' + c; }, remove: () => {}, toggle: () => {} }; this.style = {}; this.value = ''; this.textContent = ''; }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  remove() { this.parentNode && this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } focus() {}
  matches(sel) { return sel.split(',').some(one => { one = one.trim(); const m = one.match(/^([a-z0-9]*)((?:[#.][\w-]+|\[[^\]]+\])*)$/i); if (!m) return false; if (m[1] && m[1] !== this.tag) return false; for (const part of (m[2].match(/[#.][\w-]+|\[[^\]]+\]/g) || [])) { if (part[0] === '#') { if (this.attrs.id !== part.slice(1)) return false; } else if (part[0] === '.') { if (!(this.className || '').split(/\s+/).includes(part.slice(1))) return false; } else { const [k, v] = part.slice(1, -1).split('='); if (!(k in this.attrs)) return false; if (v !== undefined && String(this.attrs[k]) !== v.replace(/["']/g, '')) return false; } } return true; }); }
  querySelectorAll(sel) { const out = []; const walk = n => { for (const c of n.childNodes) { if (c.tag && c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  text() { return (this.tag ? (this.textContent || '') : this.data || '') + this.childNodes.map(c => c.text()).join(' '); }
  has(cls) { const w = n => (n.className || '').split(/\s+/).includes(cls) || n.childNodes.some(w); return w(this); } }
const T = class extends N { constructor(d) { super(null); this.data = d; } };
const els = {}; const doc = { createElement: t => new N(t), createTextNode: d => new T(d), getElementById: id => (els[id] ||= new N('div')), body: new N('body'), title: '', querySelectorAll: () => [] };
globalThis.Node = N; globalThis.document = doc; globalThis.window = globalThis; globalThis.location = { hash: '', origin: 'https://x.github.io', pathname: '/masir-man/' }; globalThis.history = { length: 1, back() {} };
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }; globalThis.sessionStorage = globalThis.localStorage;
globalThis.scrollTo = () => {}; globalThis.addEventListener = () => {};
globalThis.MM_CONFIG = { API_BASE: 'https://api.test', SITE_NAME_FALLBACK: 'مسیر من' };
globalThis.fetch = async (u, o = {}) => { const p = u.replace('https://api.test', ''); return worker.fetch(new Request('https://api.test' + p, { method: o.method || 'GET', headers: { ...(o.headers || {}), 'cf-connecting-ip': '3.3.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250) }, body: o.body }), env); };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } };

const call = async (m, p, b, t) => (await worker.fetch(new Request('https://api.test' + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}), 'cf-connecting-ip': '2.2.2.2' }, body: b ? JSON.stringify(b) : undefined }), env)).json();
await call('POST', '/api/auth/setup-admin', { setup_key: 'setup-key-123', name: 'مدیر', email: 'adm@test.com', password: 'Passw0rdX' });
const lg = await call('POST', '/api/auth/login', { email: 'adm@test.com', password: 'Passw0rdX' });

vm.runInThisContext(fs.readFileSync('frontend/js/core.js', 'utf8'));
const errs = []; const origErr = console.error;
vm.runInThisContext(fs.readFileSync('frontend/admin/admin.js', 'utf8').replace('window.addEventListener(\'hashchange\', MM.navigate);\n  MM.navigate();', ''));
const view = doc.getElementById('view'); const MM = globalThis.MM;
const go = async (hash) => { location.hash = hash; await MM.navigate(); return view; };

// بدون ورود → فرم ورود
let v = await go('#/'); ok(v.text().includes('ورود به پنل مدیریت'), 'login shown when logged out');
MM.setSession(lg.token, lg.user);
v = await go('#/'); ok(!v.has('errbox') && v.text().includes('داشبورد'), 'dashboard renders: ' + v.text().slice(0, 80));
const meta = await call('GET', '/api/admin/meta', null, lg.token);
ok(meta.resources.length >= 40, 'meta resources ' + meta.resources.length);
ok(els.side.querySelectorAll('a').length > 40, 'sidebar links built');
for (const r of meta.resources) {
  v = await go('#/r/' + r.key); ok(!v.has('errbox'), 'list ' + r.key + ' -> ' + (v.has('errbox') ? v.text().slice(0, 120) : ''));
  if (!r.ro && !r.single && !r.noCreate) { v = await go('#/r/' + r.key + '/new'); ok(!v.has('errbox') && v.querySelectorAll('input').length + v.querySelectorAll('textarea').length + v.querySelectorAll('select').length > 0, 'form new ' + r.key); }
  if (r.single) { v = await go('#/r/' + r.key); ok(!v.has('errbox') && v.querySelectorAll('input').length > 0, 'single form ' + r.key); }
}
const list = await call('GET', '/api/admin/majors?size=5', null, lg.token);
v = await go('#/r/majors/' + list.items[0].id); ok(!v.has('errbox') && v.querySelectorAll('textarea').length > 3, 'edit major form');
v = await go('#/r/site_settings'); ok(!v.has('errbox') && v.text().includes('تهران') && v.text().includes('ریاضی'), 'settings editor shows list tags');
v = await go('#/tests/1/builder'); ok(!v.has('errbox') && v.text().includes('سؤال جدید') && v.has('q-item'), 'test builder: ' + v.text().slice(0, 80));
v = await go('#/queue'); ok(!v.has('errbox') && v.text().includes('صف بررسی'), 'queue');
v = await go('#/users/1'); ok(!v.has('errbox'), 'user summary ' + (v.has('errbox') ? v.text().slice(0, 100) : ''));
v = await go('#/staff-new'); ok(!v.has('errbox'), 'staff form');
v = await go('#/setup'); ok(!v.has('errbox') && v.text().includes('راه‌اندازی انجام شده'), 'setup wizard: ' + v.text().slice(0, 120));
console.log(`\nADMIN SMOKE: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
