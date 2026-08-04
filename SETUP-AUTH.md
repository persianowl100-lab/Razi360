# راهنمای راه‌اندازی ورود با پیامک (کاوه‌نگار)

فقط ورود با شماره موبایل — بدون تلگرام و بدون Firebase.

---

## مرحله ۱: ساخت Worker در Cloudflare

### در صفحه‌ای که الان می‌بینی:

1. روی **Start with Hello World!** کلیک کن
2. یک نام برای Worker بگذار (مثلاً `razi360-auth`)
3. روی **Deploy** بزن

### بعد از Deploy:

1. روی **Edit code** کلیک کن
2. **همه کد پیش‌فرض را پاک کن**
3. محتویات فایل `backend/worker.js` را کامل کپی و جای آن بگذار
4. **Save and Deploy** بزن

آدرس Worker چیزی شبیه این می‌شود:
`https://razi360-auth.YOUR-SUBDOMAIN.workers.dev`

این آدرس را یادداشت کن.

---

## مرحله ۲: ساخت KV Namespace

1. از منوی سمت چپ: **Storage & Databases → KV**
2. **Create a namespace**
3. نام: `OTP_STORE`
4. Create

### وصل کردن KV به Worker:

1. برو به Worker خودت → **Settings** → **Bindings**
2. **Add** → **KV Namespace**
3. Variable name: دقیقاً `OTP_STORE`
4. Namespace: همان `OTP_STORE` که ساختی
5. Save

---

## مرحله ۳: تنظیم Secrets

در Worker → **Settings** → **Variables and Secrets** → **Add**:

| Type   | Name                 | Value                          |
|--------|----------------------|--------------------------------|
| Secret | `KAVENEGAR_API_KEY`  | API Key کاوه‌نگار             |
| Secret | `KAVENEGAR_TEMPLATE` | `razi360-otp`                  |
| Secret | `JWT_SECRET`         | یک رشته تصادفی طولانی         |
| Secret | `ALLOWED_ORIGIN`     | `https://razi360.ir`           |

برای `JWT_SECRET` می‌توانی از این استفاده کنی (یا خودت یکی بساز):
```
razi360_secret_key_2026_x9k2m8p4q7
```

---

## مرحله ۴: کاوه‌نگار

1. برو به [kavenegar.com](https://kavenegar.com) و ثبت‌نام کن
2. **اعتبارسنجی → تعریف الگوی اعتبارسنجی**
3. نام الگو (انگلیسی): `razi360-otp`
4. متن الگو:
   ```
   کد ورود شما به رازی ۳۶۰: %token
   ```
5. ذخیره کن و منتظر تأیید بمان
6. API Key را از پنل کپی کن و در Secrets بگذار

---

## مرحله ۵: تنظیم فرانت‌اند

فایل `js/auth.js` را باز کن و این خط را تغییر بده:

```js
API_BASE: "https://razi360-auth.YOUR-SUBDOMAIN.workers.dev",
```

به‌جای آدرس بالا، آدرس واقعی Worker خودت را بگذار.

---

## تست

با این دستور می‌توانی ارسال OTP را تست کنی (در ترمینال یا Postman):

```bash
curl -X POST https://YOUR-WORKER.workers.dev/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"09121234567"}'
```

اگر `"success": true` دیدی، یعنی همه چیز درست کار می‌کند.

---

## خلاصه چک‌لیست

- [ ] Worker ساخته و کد `worker.js` داخلش قرار گرفته
- [ ] KV با نام `OTP_STORE` ساخته و Bind شده
- [ ] چهار Secret تنظیم شده
- [ ] الگوی کاوه‌نگار ساخته و تأیید شده
- [ ] `API_BASE` در `js/auth.js` درست شده
- [ ] سایت آپلود شده
