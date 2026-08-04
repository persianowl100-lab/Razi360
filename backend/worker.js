/**
 * رازی ۳۶۰ - Backend (فقط ورود با پیامک کاوه‌نگار)
 * Cloudflare Workers
 *
 * Secrets:
 *   KAVENEGAR_API_KEY, KAVENEGAR_TEMPLATE, JWT_SECRET, ALLOWED_ORIGIN
 * KV Binding:
 *   OTP_STORE
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === "/api/auth/send-otp" && request.method === "POST") {
        return await handleSendOtp(request, env, corsHeaders);
      }
      if (path === "/api/auth/verify-otp" && request.method === "POST") {
        return await handleVerifyOtp(request, env, corsHeaders);
      }
      if (path === "/api/auth/me" && request.method === "GET") {
        return await handleMe(request, env, corsHeaders);
      }
      return json({ success: false, message: "مسیر یافت نشد" }, 404, corsHeaders);
    } catch (err) {
      console.error(err);
      return json({ success: false, message: "خطای سرور" }, 500, corsHeaders);
    }
  },
};

async function handleSendOtp(request, env, corsHeaders) {
  const body = await request.json();
  const phone = normalizePhone(body.phone);

  if (!phone) {
    return json({ success: false, message: "شماره موبایل نامعتبر است" }, 400, corsHeaders);
  }

  const rateKey = `rate:${phone}`;
  const lastSent = await env.OTP_STORE.get(rateKey);
  if (lastSent) {
    const elapsed = Date.now() - Number(lastSent);
    if (elapsed < 60_000) {
      const wait = Math.ceil((60_000 - elapsed) / 1000);
      return json({ success: false, message: `لطفاً ${wait} ثانیه صبر کنید` }, 429, corsHeaders);
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await env.OTP_STORE.put(`otp:${phone}`, code, { expirationTtl: 120 });
  await env.OTP_STORE.put(rateKey, String(Date.now()), { expirationTtl: 60 });

  const apiKey = env.KAVENEGAR_API_KEY;
  const template = env.KAVENEGAR_TEMPLATE || "razi360-otp";
  const kavenegarUrl = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`;
  const params = new URLSearchParams({ receptor: phone, token: code, template });

  const smsRes = await fetch(`${kavenegarUrl}?${params.toString()}`);
  const smsData = await smsRes.json();

  if (smsData.return && smsData.return.status === 200) {
    return json({ success: true, message: "کد تأیید ارسال شد" }, 200, corsHeaders);
  }

  console.error("Kavenegar error:", JSON.stringify(smsData));
  return json({ success: false, message: "خطا در ارسال پیامک. دوباره تلاش کنید" }, 500, corsHeaders);
}

async function handleVerifyOtp(request, env, corsHeaders) {
  const body = await request.json();
  const phone = normalizePhone(body.phone);
  const code = String(body.code || "").trim();

  if (!phone || !code) {
    return json({ success: false, message: "اطلاعات ناقص است" }, 400, corsHeaders);
  }

  const stored = await env.OTP_STORE.get(`otp:${phone}`);
  if (!stored || stored !== code) {
    return json({ success: false, message: "کد تأیید اشتباه یا منقضی شده است" }, 400, corsHeaders);
  }

  await env.OTP_STORE.delete(`otp:${phone}`);

  const user = {
    id: `phone_${phone}`,
    phone,
    name: `کاربر ${phone.slice(-4)}`,
    provider: "phone",
    createdAt: new Date().toISOString(),
  };

  const token = await createToken(user, env.JWT_SECRET);
  return json({ success: true, message: "ورود موفقیت‌آمیز", token, user }, 200, corsHeaders);
}

async function handleMe(request, env, corsHeaders) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return json({ success: false, message: "توکن وجود ندارد" }, 401, corsHeaders);
  }
  try {
    const payload = await verifyToken(token, env.JWT_SECRET);
    return json({ success: true, user: payload }, 200, corsHeaders);
  } catch {
    return json({ success: false, message: "توکن نامعتبر است" }, 401, corsHeaders);
  }
}

function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/\D/g, "");
  if (p.startsWith("98") && p.length === 12) p = p.slice(2);
  if (p.startsWith("0") && p.length === 11) p = p.slice(1);
  if (p.length === 10 && p.startsWith("9")) return "98" + p;
  return null;
}

async function createToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + 60 * 60 * 24 * 30 };
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(fullPayload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerB64}.${payloadB64}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

async function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "HMAC", key,
    Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
    encoder.encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error("Invalid signature");
  const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
