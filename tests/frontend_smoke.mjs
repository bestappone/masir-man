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
for (const f of ['pages-main', 'pages-tests', 'pages-plan', 'pages-coach', 'pages-consult', 'pages-misc']) vm.runInThisContext(fs.readFileSync(`frontend/js/${f}.js`, 'utf8'));
const MM = globalThis.MM; MM.setActive = () => {}; const view = doc.getElementById('view');
const go = async (hash) => { location.hash = hash; await MM.navigate(); return view; };
// دانش‌آموز
const reg = await call('POST', '/api/auth/register', { name: 'دانش‌آموز', email: 'stu@test.com', password: 'Passw0rdX', accept_terms: true, consent_privacy: true, consent: true });
let tok = reg.token; if (!tok) { const l = await call('POST', '/api/auth/login', { email: 'stu@test.com', password: 'Passw0rdX' }); tok = l.token; MM.setSession(tok, l.user); } else MM.setSession(tok, reg.user);
await MM.loadSettings();
const tst = await call('GET', '/api/tests/holland-interest'); const a = {}; for (const q of tst.questions) a[q.id] = q.options[q.options.length - 1].id;
const sub = await call('POST', '/api/tests/holland-interest/submit', { answers: a }, tok);
const arts = await call('GET', '/api/articles'); const provs = await call('GET', '/api/providers');
const routes = ['#/', '#/majors', '#/majors/computer-engineering', '#/majors/dentistry', '#/majors?group=' + encodeURIComponent('هنر'), '#/jobs', '#/jobs/software-developer', '#/jobs/dentist', '#/tests', '#/tests/holland-interest', '#/results/' + sub.id, '#/results',
  '#/consult', '#/consult/provider/' + provs.items[0].id, '#/requests', '#/provider', '#/resources', '#/articles', '#/articles/' + arts.items[0].slug, '#/ai', '#/profile', '#/faq', '#/privacy', '#/terms', '#/login', '#/register',
  '#/plan', '#/goals', '#/coaching', '#/paths', '#/lessons', '#/skills', '#/my', '#/dashboard', '#/study', '#/exam'];
for (const r of routes) { const v = await go(r); const bad = v.has('errbox'); ok(!bad, 'route ' + r + (bad ? ' -> ' + v.text().slice(0, 140) : '')); }
const v = await go('#/majors'); ok(v.text().includes('۱۳۵ مورد') || v.text().includes('135'), 'majors count shown: ' + v.text().slice(0, 100));
console.log(`\nFRONTEND SMOKE: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
