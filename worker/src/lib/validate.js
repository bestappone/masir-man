import { HttpError } from './http.js';
const RX_SLUG = /^[a-z0-9][a-z0-9\-_]{0,80}$/;
const RX_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const RX_DATE = /^[0-9\-T:.+Z ]{0,40}$/;
export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && RX_EMAIL.test(s);
export function isUrl(s) { return /^https?:\/\/[^\s]{1,1000}$/i.test(s) || /^\/[^\s]{0,500}$/.test(s) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(s); }
export function strongPassword(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 100 && /[A-Za-z\u0600-\u06FF]/.test(p) && /[0-9\u06F0-\u06F9]/.test(p); }
export const toEnDigits = (s) => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

// spec: 't' متن کوتاه، 'x' متن بلند، 'X' متن خیلی بلند، 'i' عدد صحیح، 'r' عدد اعشاری، 'b' بله/خیر،
// 'd' تاریخ، 'u' آدرس اینترنتی، 's' شناسه انگلیسی، 'j' JSON، 'e:a|b' انتخابی. علامت ! یعنی اجباری
export function cleanFields(input, fields, { partial = false } = {}) {
  const out = {}; const errors = [];
  for (const [name, specRaw] of Object.entries(fields)) {
    const req = specRaw.endsWith('!'); const spec = req ? specRaw.slice(0, -1) : specRaw;
    let v = input[name];
    if (v === undefined) { if (req && !partial) errors.push(name); continue; }
    if (v === null || v === '') {
      if (req) { errors.push(name); continue; }
      if (['i', 'r', 'b'].includes(spec)) continue;
      out[name] = ''; continue;
    }
    const t = spec[0];
    if (['t', 'x', 'X', 'd', 'u', 's', 'j'].includes(t) || t === 'e') {
      if (typeof v !== 'string') { if (typeof v === 'number') v = String(v); else { errors.push(name); continue; } }
      v = v.replace(/\u0000/g, '').trim();
    }
    if (t === 't') { if (v.length > 500) { errors.push(name); continue; } }
    else if (t === 'x') { if (v.length > 20000) { errors.push(name); continue; } }
    else if (t === 'X') { if (v.length > 100000) { errors.push(name); continue; } }
    else if (t === 'i') { v = Number(toEnDigits(v)); if (!Number.isFinite(v) || !Number.isInteger(v) || Math.abs(v) > 1e12) { errors.push(name); continue; } }
    else if (t === 'r') { v = Number(toEnDigits(v)); if (!Number.isFinite(v) || Math.abs(v) > 1e9) { errors.push(name); continue; } }
    else if (t === 'b') { v = (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0; }
    else if (t === 'd') { if (!RX_DATE.test(v)) { errors.push(name); continue; } }
    else if (t === 'u') { if (v.length > 1000 || !isUrl(v)) { errors.push(name); continue; } }
    else if (t === 's') { if (!RX_SLUG.test(v)) { errors.push(name); continue; } }
    else if (t === 'j') { if (v.length > 30000) { errors.push(name); continue; } try { JSON.parse(v); } catch { errors.push(name); continue; } }
    else if (t === 'e') { if (!spec.slice(2).split('|').includes(v)) { errors.push(name); continue; } }
    out[name] = v;
  }
  if (errors.length) throw new HttpError(400, 'برخی فیلدها نامعتبر یا ناقص است.', { fields: errors });
  return out;
}
export function need(cond, msg = 'درخواست نامعتبر است.', status = 400) { if (!cond) throw new HttpError(status, msg); }
