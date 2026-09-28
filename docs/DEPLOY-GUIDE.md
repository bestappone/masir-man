# راهنمای استقرار (خط فرمان)

پیش‌نیاز: Node 20+، حساب Cloudflare، `npm i -g wrangler` و `wrangler login`.

```bash
cd worker
wrangler d1 create masir-man-db          # database_id را در wrangler.toml بگذار
# wrangler.toml: ALLOWED_ORIGINS را برابر آدرس سایت بگذار
wrangler d1 migrations apply masir-man-db --remote   # 0001_schema.sql تا 0008_seed_part7.sql
wrangler secret put SETUP_KEY
wrangler secret put AI_API_KEY   # اختیاری
wrangler deploy
```

مهاجرت‌ها به‌ترتیب شماره اجرا می‌شوند: `0001` ساختار، `0002…0008` داده‌ی اولیه (چند فایل کوچک تا در کنسول D1 هم اجرا شود).
**جایگزین:** مهاجرت را نزن و از صفحه‌ی `admin/#/setup` استفاده کن (NO-CODE-SETUP-GUIDE).

## ساخت مدیر
یا از صفحه‌ی `admin/#/setup`، یا:
```bash
curl -X POST $API/api/auth/setup-admin -H 'content-type: application/json' \
  -d '{"setup_key":"...","name":"مدیر","email":"you@example.com","password":"رمز-قوی123"}'
```
سپس `wrangler secret delete SETUP_KEY`.

## سایت
`frontend/config.js` ← `API_BASE`. سپس GitHub Pages (workflow آماده) یا هر هاست ایستا.

## به‌روزرسانی داده‌ی پایه
فایل‌های `tools/seed_*.py` را ویرایش کن و `python3 tools/build_seed.py` را بزن؛ مهاجرت‌ها و `worker/src/sql/*.js` بازتولید می‌شوند. توجه: بذر با `INSERT OR IGNORE` است و ردیف‌های موجود را بازنویسی نمی‌کند؛ ویرایش محتوای زنده را از پنل انجام بده.
