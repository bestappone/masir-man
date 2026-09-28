# راه‌اندازی بدون کدنویسی (فقط با مرورگر)

به سه حساب رایگان نیاز داری: **GitHub**، **Cloudflare** و یک ایمیل.

## گام ۱ — دیتابیس
1. در Cloudflare: **Storage & Databases ← D1 ← Create database**. نام: `masir-man-db`.
2. **Database ID** را کپی کن (بعداً لازم می‌شود).

## گام ۲ — Worker (API)
1. در Cloudflare: **Workers & Pages ← Create ← Worker**. نام: `masir-man-api` ← Deploy.
2. **Edit code** را بزن و محتوای پوشه‌ی `worker/src` را بارگذاری کن.
   - ساده‌ترین راه برای بدون‌کد: ریپوی GitHub را به Cloudflare وصل کن (**Connect to Git**) و «Root directory» را `worker` بگذار؛ Cloudflare خودش `wrangler.toml` را می‌خواند.
3. در **Settings ← Bindings**: یک D1 با **Variable name = `DB`** و دیتابیس بند ۱ را وصل کن.
4. در **Settings ← Variables and Secrets** بساز:
   - `SETUP_KEY` (نوع **Secret**): یک رمز طولانی تصادفی، مثلاً ۳۰ نویسه. آن را یادداشت کن.
   - `ALLOWED_ORIGINS` (Text): آدرس سایتت، مثلاً `https://USERNAME.github.io`
   - `SESSION_DAYS` (Text): `7`
5. آدرس Worker را کپی کن (مثل `https://masir-man-api.xxx.workers.dev`).

## گام ۳ — سایت روی GitHub Pages
1. ریپو بساز و همه‌ی فایل‌ها را آپلود کن.
2. فایل `frontend/config.js` را ویرایش کن: `API_BASE` را برابر آدرس Worker بگذار.
3. **Settings ← Pages**: Source را **GitHub Actions** بگذار (فایل `.github/workflows/pages.yml` آماده است). پس از چند دقیقه سایت بالا می‌آید.

## گام ۴ — ساخت جداول و مدیر (بدون خط فرمان)
1. آدرس `https://USERNAME.github.io/REPO/admin/#/setup` را باز کن.
2. **SETUP_KEY** را وارد کن و **«ساخت جداول و داده‌ی نمونه»** را بزن. نوار پیشرفت چند مرحله را طی می‌کند. اگر قطع شد، دوباره بزن؛ مشکلی ایجاد نمی‌شود.
3. در «گام دوم» نام، ایمیل و رمز مدیر اول را وارد کن.
4. **بعد از ساخت مدیر، `SETUP_KEY` را از Cloudflare حذف کن.**

## گام ۵ — تنظیمات ضروری در پنل
- **تنظیمات پرداخت:** شماره‌ی کارت و قوانین واقعی.
- **تنظیمات سایت:** نام، تماس، شهرها، پایه‌ها.
- **بنر تبلیغاتی و مشاوران نمونه:** بررسی و حذف/ویرایش.
- **هوش مصنوعی:** فقط در صورت نیاز فعال کن؛ کلید `AI_API_KEY` را به‌صورت Secret بگذار.

اگر به مشکل خوردی: **docs/TROUBLESHOOTING.md**
