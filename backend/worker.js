/**
 * رازی ۳۶۰ - Worker یکپارچه
 * احراز هویت (کاوه‌نگار) + پرداخت (بانک ملت)
 *
 * ─── Secrets ─────────────────────────────────────────
 * KAVENEGAR_API_KEY
 * KAVENEGAR_TEMPLATE          (مثلاً razi360-otp)
 * JWT_SECRET
 * ALLOWED_ORIGIN              (https://razi360.ir)
 * MELLAT_TERMINAL_ID          (9591783)
 * MELLAT_USERNAME             (IPG9591783)
 * MELLAT_PASSWORD             (رمز درگاه — فقط اینجا)
 *
 * ─── KV Binding ──────────────────────────────────────
 * OTP_STORE
 */

const MELLAT_ENDPOINT = "https://bpm.shaparak.ir/pgwchannel/services/pgw";
const MELLAT_STARTPAY = "https://bpm.shaparak.ir/pgwchannel/startpay.mellat";

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
      // ── Auth ──
      if (path === "/api/auth/send-otp" && request.method === "POST") {
        return await handleSendOtp(request, env, corsHeaders);
      }
      if (path === "/api/auth/verify-otp" && request.method === "POST") {
        return await handleVerifyOtp(request, env, corsHeaders);
      }
      if (path === "/api/auth/me" && request.method === "GET") {
        return await handleMe(request, env, corsHeaders);
      }
      if (path === "/health") {
        return handleHealth(env, corsHeaders);
      }

      // ── Payment ──
      // هم request و هم initiate (سازگاری با کدهای قدیمی)
      if ((path === "/api/payment/request" || path === "/api/payment/initiate") && request.method === "POST") {
        return await handlePaymentRequest(request, env, corsHeaders);
      }
      if ((path === "/api/payment/verify" || path === "/api/payment/settle") && request.method === "POST") {
        return await handlePaymentVerify(request, env, corsHeaders);
      }
      if (path === "/api/payment/callback" && (request.method === "POST" || request.method === "GET")) {
        return await handlePaymentCallback(request, env, corsHeaders);
      }

      return json({
        success: false,
        message: "مسیر یافت نشد",
        path,
        method: request.method,
        availableRoutes: [
          "GET  /health",
          "POST /api/auth/send-otp",
          "POST /api/auth/verify-otp",
          "GET  /api/auth/me",
          "POST /api/payment/request",
          "POST /api/payment/initiate",
          "POST /api/payment/verify",
          "POST /api/payment/callback",
        ]
      }, 404, corsHeaders);
    } catch (err) {
      console.error(err);
      return json({ success: false, message: "خطای سرور", error: String(err.message || err) }, 500, corsHeaders);
    }
  },
};

// ═══════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════
function handleHealth(env, corsHeaders) {
  return json({
    status: "ok",
    kavenegar: env.KAVENEGAR_API_KEY ? "set" : "missing",
    jwt: env.JWT_SECRET ? "set" : "missing",
    mellatTerminal: env.MELLAT_TERMINAL_ID ? "set" : "missing",
    mellatUser: env.MELLAT_USERNAME ? "set" : "missing",
    mellatPass: env.MELLAT_PASSWORD ? "set" : "missing",
  }, 200, corsHeaders);
}

// ═══════════════════════════════════════════════════════
// Auth - OTP
// ═══════════════════════════════════════════════════════
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

  if (!env.KAVENEGAR_API_KEY) {
    return json({ success: true, message: "حالت تست", debugCode: code, testMode: true }, 200, corsHeaders);
  }

  const template = env.KAVENEGAR_TEMPLATE || "razi360-otp";
  const apiUrl = `https://api.kavenegar.com/v1/${env.KAVENEGAR_API_KEY}/verify/lookup.json`;
  const params = new URLSearchParams({ receptor: phone, token: code, template });
  const smsRes = await fetch(`${apiUrl}?${params}`);
  const smsData = await smsRes.json();

  if (smsData.return && smsData.return.status === 200) {
    return json({ success: true, message: "کد تأیید ارسال شد" }, 200, corsHeaders);
  }
  console.error("Kavenegar", smsData);
  return json({ success: false, message: "خطا در ارسال پیامک" }, 500, corsHeaders);
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
  if (!token) return json({ success: false, message: "توکن وجود ندارد" }, 401, corsHeaders);
  try {
    const payload = await verifyToken(token, env.JWT_SECRET);
    return json({ success: true, user: payload }, 200, corsHeaders);
  } catch {
    return json({ success: false, message: "توکن نامعتبر است" }, 401, corsHeaders);
  }
}

// ═══════════════════════════════════════════════════════
// Payment - Mellat
// ═══════════════════════════════════════════════════════
async function handlePaymentRequest(request, env, corsHeaders) {
  const body = await request.json();
  const orderId = Number(body.orderId);
  const amount = Number(body.amount); // ریال
  const callBackUrl =
    body.callBackUrl ||
    `https://${new URL(request.url).host}/api/payment/callback`;
  const additionalData = String(body.additionalData || "خرید از رازی ۳۶۰").slice(0, 1000);

  if (!orderId || !amount || amount < 1000) {
    return json({ success: false, message: "orderId یا amount نامعتبر (حداقل ۱۰۰۰ ریال)" }, 400, corsHeaders);
  }
  if (!env.MELLAT_TERMINAL_ID || !env.MELLAT_USERNAME || !env.MELLAT_PASSWORD) {
    return json({ success: false, message: "تنظیمات درگاه روی سرور ناقص است" }, 500, corsHeaders);
  }

  const now = new Date();
  const localDate =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const localTime =
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");

  const params = {
    terminalId: env.MELLAT_TERMINAL_ID,
    userName: env.MELLAT_USERNAME,
    userPassword: env.MELLAT_PASSWORD,
    orderId,
    amount,
    localDate,
    localTime,
    additionalData,
    callBackUrl,
    payerId: "0",
  };
  if (body.mobileNo) {
    params.mobileNo = String(body.mobileNo).replace(/\D/g, "");
  }

  // ذخیره order برای تطبیق در callback
  await env.OTP_STORE.put(
    `pay:${orderId}`,
    JSON.stringify({ amount, createdAt: Date.now() }),
    { expirationTtl: 3600 }
  );

  const result = await mellatSoap("bpPayRequest", params);
  const parts = result.split(",");
  const resCode = parts[0];
  const refId = parts[1];

  if (resCode === "0" && refId) {
    await env.OTP_STORE.put(`ref:${refId}`, String(orderId), { expirationTtl: 3600 });
    return json({
      success: true,
      refId,
      orderId,
      startPayUrl: MELLAT_STARTPAY,
      message: "آماده هدایت به درگاه",
    }, 200, corsHeaders);
  }

  return json({
    success: false,
    code: resCode,
    message: getPaymentErrorMessage(resCode),
    raw: result,
  }, 400, corsHeaders);
}

async function handlePaymentVerify(request, env, corsHeaders) {
  const body = await request.json();
  const orderId = Number(body.orderId);
  const saleOrderId = Number(body.saleOrderId || body.orderId);
  const saleReferenceId = Number(body.saleReferenceId);

  if (!orderId || !saleReferenceId) {
    return json({ success: false, message: "پارامتر ناقص است" }, 400, corsHeaders);
  }

  const base = {
    terminalId: env.MELLAT_TERMINAL_ID,
    userName: env.MELLAT_USERNAME,
    userPassword: env.MELLAT_PASSWORD,
    orderId,
    saleOrderId,
    saleReferenceId,
  };

  const verifyResult = await mellatSoap("bpVerifyRequest", base);
  if (verifyResult !== "0" && !["43", "45"].includes(verifyResult)) {
    return json({
      success: false,
      step: "verify",
      code: verifyResult,
      message: getPaymentErrorMessage(verifyResult),
    }, 400, corsHeaders);
  }

  const settleResult = await mellatSoap("bpSettleRequest", base);
  if (settleResult !== "0" && settleResult !== "45") {
    return json({
      success: false,
      step: "settle",
      code: settleResult,
      message: getPaymentErrorMessage(settleResult),
    }, 400, corsHeaders);
  }

  return json({
    success: true,
    message: "پرداخت تأیید و تسویه شد",
    orderId,
    saleReferenceId,
  }, 200, corsHeaders);
}

async function handlePaymentCallback(request, env, corsHeaders) {
  // بانک با POST برمی‌گرداند
  let params = {};
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      params = Object.fromEntries(new URLSearchParams(text));
    } else if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      form.forEach((v, k) => { params[k] = v; });
    } else {
      try {
        const text = await request.text();
        params = Object.fromEntries(new URLSearchParams(text));
      } catch {
        params = {};
      }
    }
  } else {
    const url = new URL(request.url);
    url.searchParams.forEach((v, k) => { params[k] = v; });
  }

  const resCode = String(params.ResCode || "");
  const saleOrderId = params.SaleOrderId || params.saleOrderId || "";
  const saleReferenceId = params.SaleReferenceId || params.saleReferenceId || "";
  const refId = params.RefId || params.refId || "";

  const siteBase = (env.ALLOWED_ORIGIN || "https://razi360.ir").replace(/\/$/, "");
  const successUrl = `${siteBase}/pages/callback.html`;

  if (resCode !== "0") {
    return Response.redirect(
      `${successUrl}?ResCode=${encodeURIComponent(resCode)}&ok=0`,
      302
    );
  }

  try {
    const base = {
      terminalId: env.MELLAT_TERMINAL_ID,
      userName: env.MELLAT_USERNAME,
      userPassword: env.MELLAT_PASSWORD,
      orderId: Number(saleOrderId),
      saleOrderId: Number(saleOrderId),
      saleReferenceId: Number(saleReferenceId),
    };
    await mellatSoap("bpVerifyRequest", base);
    await mellatSoap("bpSettleRequest", base);
  } catch (e) {
    console.error("callback verify/settle", e);
  }

  const q = new URLSearchParams({
    ResCode: "0",
    SaleOrderId: String(saleOrderId),
    SaleReferenceId: String(saleReferenceId),
    RefId: String(refId),
    ok: "1",
  });
  return Response.redirect(`${successUrl}?${q.toString()}`, 302);
}

async function mellatSoap(method, params) {
  const bodyInner = Object.entries(params)
    .map(([k, v]) => `<${k}>${escapeXml(String(v ?? ""))}</${k}>`)
    .join("");

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:int="http://interfaces.core.sw.bps.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <int:${method}>
      ${bodyInner}
    </int:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(MELLAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    body: soap,
  });
  const text = await res.text();
  const match = text.match(/<return[^>]*>([\s\S]*?)<\/return>/i);
  if (!match) {
    throw new Error("پاسخ نامعتبر بانک: " + text.slice(0, 400));
  }
  return match[1].trim();
}

function getPaymentErrorMessage(code) {
  const m = {
    "0": "موفق",
    "11": "شماره کارت نامعتبر",
    "12": "موجودی کافی نیست",
    "13": "رمز نادرست",
    "17": "انصراف کاربر",
    "21": "پذیرنده نامعتبر",
    "23": "خطای امنیتی",
    "24": "اطلاعات کاربری پذیرنده نامعتبر",
    "25": "مبلغ نامعتبر",
    "41": "شماره درخواست تکراری",
    "42": "تراکنش Sale یافت نشد",
    "43": "قبلاً Verify شده",
    "45": "قبلاً Settle شده",
    "51": "تراکنش تکراری",
    "61": "خطا در واریز",
    "62": "آدرس بازگشت خارج از دامنه ثبت‌شده",
    "421": "IP نامعتبر / ثبت‌نشده",
  };
  return m[String(code)] || `خطای بانک (کد ${code})`;
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════════════════════
// Helpers Auth
// ═══════════════════════════════════════════════════════
function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/\D/g, "");
  if (p.startsWith("98") && p.length === 12) p = p.slice(2);
  if (p.startsWith("0") && p.length === 11) p = p.slice(1);
  if (p.length === 10 && p.startsWith("9")) return "98" + p;
  return null;
}

async function createToken(payload, secret) {
  if (!secret) throw new Error("JWT_SECRET is not set");
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + 60 * 60 * 24 * 30 };
  const encoder = new TextEncoder();
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(fullPayload));
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerB64}.${payloadB64}`));
  return `${headerB64}.${payloadB64}.${b64urlBytes(new Uint8Array(sig))}`;
}

async function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  const raw = parts[2].replace(/-/g, "+").replace(/_/g, "/");
  const pad = raw + "=".repeat((4 - (raw.length % 4)) % 4);
  const sigBytes = Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    "HMAC", key, sigBytes, encoder.encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error("Invalid signature");
  const payloadPad = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const payloadJson = atob(payloadPad + "=".repeat((4 - (payloadPad.length % 4)) % 4));
  const payload = JSON.parse(payloadJson);
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}

function b64url(str) {
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlBytes(bytes) {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
