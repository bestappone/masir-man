export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export async function readJson(req, max = 300000) {
  const t = await req.text();
  if (t.length > max) throw new HttpError(413, 'حجم درخواست بیش از حد مجاز است.');
  if (!t) return {};
  try { const v = JSON.parse(t); if (v === null || typeof v !== 'object') throw 0; return v; }
  catch { throw new HttpError(400, 'درخواست نامعتبر است (JSON).'); }
}
export function securityHeaders(res) {
  const h = new Headers(res.headers);
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('x-frame-options', 'DENY');
  return new Response(res.body, { status: res.status, headers: h });
}
export function corsHeaders(req, env) {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-max-age': '86400', vary: 'origin' };
}
