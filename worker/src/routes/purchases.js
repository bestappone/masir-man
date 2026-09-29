// خرید چیزهای دیجیتال (آزمون پولی، ساخت برنامه‌ی مطالعه) با همان زیرساخت پرداخت کارت‌به‌کارت مشاوره.
// product_key اینجا یکی از این دو شکل است: "test:<slug>" یا "feature:<feature_key>"
import { HttpError, json } from '../lib/http.js';
import { all, first, run, getSettings } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { cleanFields, need } from '../lib/validate.js';
import { rateLimit, audit } from '../lib/limits.js';
import { pickCoupon } from '../services/common.js';

export function parseProductKey(key) {
  const s = String(key || '');
  const i = s.indexOf(':');
  if (i < 1) return null;
  return { kind: s.slice(0, i), ref: s.slice(i + 1) };
}

async function loadProduct(env, key) {
  const p = parseProductKey(key);
  if (!p) throw new HttpError(400, 'شناسه‌ی محصول نامعتبر است.');
  if (p.kind === 'test') {
    const t = await first(env, 'SELECT id, slug, title, is_paid, price FROM tests WHERE slug=? AND is_published=1', p.ref);
    if (!t) throw new HttpError(404, 'آزمون پیدا نشد.');
    return { title: t.title, is_paid: !!t.is_paid, price: t.price };
  }
  if (p.kind === 'feature') {
    const f = await first(env, 'SELECT feature_key, title, is_paid, price FROM paid_features WHERE feature_key=?', p.ref);
    if (!f) throw new HttpError(404, 'این ویژگی پیدا نشد.');
    return { title: f.title, is_paid: !!f.is_paid, price: f.price };
  }
  throw new HttpError(400, 'شناسه‌ی محصول نامعتبر است.');
}

// آیا کاربر همین حالا به این محصول دسترسی خریداری‌شده دارد؟
export async function hasAccess(env, userId, productKey) {
  const r = await first(env, "SELECT id FROM consultation_requests WHERE user_id=? AND product_key=? AND status IN ('approved','active','completed') LIMIT 1", userId, productKey);
  return !!r;
}

export async function myPurchases(ctx) {
  const u = requireUser(ctx);
  const rows = await all(ctx.env, "SELECT id, product_key, status, final_amount FROM consultation_requests WHERE user_id=? AND service_type='product' ORDER BY id DESC", u.id);
  return json({ items: rows });
}

export async function createPurchase(ctx) {
  const u = requireUser(ctx); const env = ctx.env;
  await rateLimit(env, `purchase:${u.id}`, 15, 3600);
  const b = await ctx.body();
  const d = cleanFields(b, { product_key: 't!', coupon_code: 't' });
  const product = await loadProduct(env, d.product_key);
  if (!product.is_paid) throw new HttpError(400, 'این مورد رایگان است و نیازی به خرید ندارد.');
  if (await hasAccess(env, u.id, d.product_key)) throw new HttpError(409, 'قبلاً این مورد را خریداری کرده‌ای.');
  const pending = await first(env, "SELECT id, status, final_amount FROM consultation_requests WHERE user_id=? AND product_key=? AND status IN ('pending_payment','payment_submitted') ORDER BY id DESC LIMIT 1", u.id, d.product_key);
  if (pending) return json({ id: pending.id, status: pending.status, final_amount: pending.final_amount }, 200);

  const s = await getSettings(env);
  const coupon = await pickCoupon(env, u, d.coupon_code, s);
  const discount = coupon ? Math.floor(product.price * coupon.effective / 100) : 0;
  const final = Math.max(0, product.price - discount);
  const status = final > 0 ? 'pending_payment' : 'approved'; // خرید رایگان‌شده با تخفیف ۱۰۰٪ مستقیم تأیید می‌شود
  const ins = await run(env, "INSERT INTO consultation_requests (user_id, service_type, product_key, status, price, discount, final_amount, coupon_id, note) VALUES (?,?,?,?,?,?,?,?,?)",
    u.id, 'product', d.product_key, status, product.price, discount, final, coupon?.id ?? null, product.title);
  const rid = ins.meta.last_row_id;
  if (coupon) {
    const cu = await run(env, 'UPDATE coupons SET is_used=1, used_request_id=? WHERE id=? AND is_used=0', rid, coupon.id);
    if (!cu.meta.changes) { await run(env, 'DELETE FROM consultation_requests WHERE id=?', rid); throw new HttpError(400, 'کد تخفیف قبلاً استفاده شده است.'); }
  }
  await audit(env, ctx, 'purchase_create', 'consultation_requests', rid, d.product_key);
  return json({ id: rid, status, price: product.price, discount, final_amount: final }, 201);
}
