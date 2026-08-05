/**
 * رازی ۳۶۰ - Backend Authentication + Payment (Cloudflare Workers)
 */

export default {
  async fetch(request, env, ctx) {
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
      // ─── روتر ───────────────────────────────────────────
      const routes = {
        // 🔐 مسیرهای احراز هویت
        "/api/auth/send-otp": handleSendOtp,
        "/api/auth/verify-otp": handleVerifyOtp,
        "/api/auth/telegram": handleTelegramLogin,
        "/api/auth/me": handleMe,
        "/health": handleHealth,
        
        // 💳 مسیرهای پرداخت (جدید)
        "/api/payment/initiate": handlePaymentInitiate,
        "/api/payment/verify": handlePaymentVerify,
        "/api/payment/settle": handlePaymentSettle,
      };

      const handler = routes[path];
      if (handler) {
        return await handler(request, env, corsHeaders);
      }

      return json({ 
        success: false, 
        message: "مسیر یافت نشد",
        availableRoutes: Object.keys(routes)
      }, 404, corsHeaders);

    } catch (err) {
      console.error('❌ Error:', err);
      return json({ 
        success: false, 
        message: "خطای سرور",
        error: env.ENVIRONMENT === "development" ? err.message : undefined
      }, 500, corsHeaders);
    }
  },
};

// ════════════════════════════════════════════════════════════
//  بخش ۱: توابع احراز هویت
// ════════════════════════════════════════════════════════════

async function handleHealth(request, env, corsHeaders) {
  try {
    let kvStatus = "unknown";
    try {
      await env.OTP_STORE.get("health-check");
      kvStatus = "connected";
    } catch {
      kvStatus = "error";
    }

    return json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: env.ENVIRONMENT || "production",
      kv: kvStatus,
      jwtSecret: env.JWT_SECRET ? "✅ set" : "❌ missing",
      kavenegar: env.KAVENEGAR_API_KEY ? "✅ set" : "❌ missing",
      uptime: "running"
    }, 200, corsHeaders);
  } catch (error) {
    return json({
      status: "unhealthy",
      error: error.message
    }, 500, corsHeaders);
  }
}

async function handleSendOtp(request, env, corsHeaders) {
  try {
    const body = await request.json();
    let phone = normalizePhone(body.phone);

    if (!phone) {
      return json({ 
        success: false, 
        message: "شماره موبایل نامعتبر است" 
      }, 400, corsHeaders);
    }

    const rateKey = `rate:${phone}`;
    const lastSent = await env.OTP_STORE.get(rateKey);
    if (lastSent) {
      const elapsed = Date.now() - Number(lastSent);
      if (elapsed < 60_000) {
        const wait = Math.ceil((60_000 - elapsed) / 1000);
        return json({ 
          success: false, 
          message: `لطفاً ${wait} ثانیه صبر کنید` 
        }, 429, corsHeaders);
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await env.OTP_STORE.put(`otp:${phone}`, code, { expirationTtl: 120 });
    await env.OTP_STORE.put(rateKey, String(Date.now()), { expirationTtl: 60 });

    if (env.KAVENEGAR_API_KEY) {
      try {
        const kavenegarUrl = `https://api.kavenegar.com/v1/${env.KAVENEGAR_API_KEY}/verify/lookup.json`;
        const params = new URLSearchParams({
          receptor: phone,
          token: code,
          template: env.KAVENEGAR_TEMPLATE || "razi360-otp",
        });

        const smsRes = await fetch(`${kavenegarUrl}?${params.toString()}`);
        const smsData = await smsRes.json();

        if (smsData.return && smsData.return.status === 200) {
          return json({
            success: true,
            message: "کد تأیید ارسال شد",
            ...(env.ENVIRONMENT === "development" && { debugCode: code })
          }, 200, corsHeaders);
        } else {
          return json({ 
            success: false, 
            message: "خطا در ارسال پیامک"
          }, 500, corsHeaders);
        }
      } catch (kavenegarError) {
        return json({ 
          success: false, 
          message: "خطا در ارتباط با سرویس پیامک"
        }, 500, corsHeaders);
      }
    } else {
      return json({
        success: true,
        message: "کد تأیید (حالت تست)",
        debugCode: code,
        testMode: true
      }, 200, corsHeaders);
    }

  } catch (error) {
    return json({ 
      success: false, 
      message: "خطا در سرور"
    }, 500, corsHeaders);
  }
}

async function handleVerifyOtp(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const phone = normalizePhone(body.phone);
    const code = String(body.code || "").trim();

    if (!phone || !code) {
      return json({ 
        success: false, 
        message: "اطلاعات ناقص است" 
      }, 400, corsHeaders);
    }

    const stored = await env.OTP_STORE.get(`otp:${phone}`);
    if (!stored || stored !== code) {
      return json({ 
        success: false, 
        message: "کد تأیید اشتباه یا منقضی شده است" 
      }, 400, corsHeaders);
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

    return json({
      success: true,
      message: "ورود موفقیت‌آمیز",
      token,
      user,
    }, 200, corsHeaders);

  } catch (error) {
    return json({ 
      success: false, 
      message: "خطا در سرور"
    }, 500, corsHeaders);
  }
}

async function handleTelegramLogin(request, env, corsHeaders) {
  return json({ 
    success: false, 
    message: "ورود با تلگرام در حال توسعه است" 
  }, 501, corsHeaders);
}

async function handleMe(request, env, corsHeaders) {
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return json({ 
        success: false, 
        message: "توکن وجود ندارد" 
      }, 401, corsHeaders);
    }

    const payload = await verifyToken(token, env.JWT_SECRET);
    return json({ 
      success: true, 
      user: payload 
    }, 200, corsHeaders);

  } catch (error) {
    return json({ 
      success: false, 
      message: "توکن نامعتبر است" 
    }, 401, corsHeaders);
  }
}

// ════════════════════════════════════════════════════════════
//  بخش ۲: توابع پرداخت (جدید)
// ════════════════════════════════════════════════════════════

async function handlePaymentInitiate(request, env, corsHeaders) {
  try {
    const body = await request.json();
    console.log("📤 [payment] Initiate:", body);

    const {
      terminalId,
      userName,
      userPassword,
      orderId,
      amount,
      localDate,
      localTime,
      additionalData,
      callBackUrl,
      payerId = 0,
    } = body;

    // اعتبارسنجی
    if (!terminalId || !orderId || !amount) {
      return json({ 
        success: false, 
        message: "پارامترهای لازم ارسال نشده است" 
      }, 400, corsHeaders);
    }

    // فراخوانی وب‌سرویس بانک ملت
    const wsdlUrl = "https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl";
    
    const soapRequest = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:pgw="http://interfaces.pgw.esb.bpm/">
        <soapenv:Header/>
        <soapenv:Body>
          <pgw:bpPayRequest>
            <terminalId>${terminalId}</terminalId>
            <userName>${userName}</userName>
            <userPassword>${userPassword}</userPassword>
            <orderId>${orderId}</orderId>
            <amount>${amount}</amount>
            <localDate>${localDate}</localDate>
            <localTime>${localTime}</localTime>
            <additionalData>${additionalData || ""}</additionalData>
            <callBackUrl>${callBackUrl}</callBackUrl>
            <payerId>${payerId}</payerId>
          </pgw:bpPayRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const response = await fetch(wsdlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "",
      },
      body: soapRequest,
    });

    const responseText = await response.text();
    console.log("📥 [payment] Bank response:", responseText);

    const refIdMatch = responseText.match(/<return>(.+?)<\/return>/);
    if (refIdMatch) {
      const result = refIdMatch[1];
      const parts = result.split(",");
      
      if (parts[0] === "0") {
        return json({
          success: true,
          refId: parts[1],
          message: "درخواست پرداخت ثبت شد",
        }, 200, corsHeaders);
      } else {
        return json({
          success: false,
          code: parts[0],
          message: getPaymentErrorMessage(parts[0]),
        }, 400, corsHeaders);
      }
    }

    return json({
      success: false,
      message: "پاسخ نامعتبر از بانک",
    }, 500, corsHeaders);

  } catch (error) {
    console.error("❌ [payment] Error:", error);
    return json({
      success: false,
      message: "خطا در ارتباط با بانک: " + error.message,
    }, 500, corsHeaders);
  }
}

async function handlePaymentVerify(request, env, corsHeaders) {
  try {
    const body = await request.json();
    console.log("📤 [payment] Verify:", body);

    const {
      terminalId,
      userName,
      userPassword,
      orderId,
      saleOrderId,
      saleReferenceId,
    } = body;

    const wsdlUrl = "https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl";

    const soapRequest = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:pgw="http://interfaces.pgw.esb.bpm/">
        <soapenv:Header/>
        <soapenv:Body>
          <pgw:bpVerifyRequest>
            <terminalId>${terminalId}</terminalId>
            <userName>${userName}</userName>
            <userPassword>${userPassword}</userPassword>
            <orderId>${orderId}</orderId>
            <saleOrderId>${saleOrderId}</saleOrderId>
            <saleReferenceId>${saleReferenceId}</saleReferenceId>
          </pgw:bpVerifyRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const response = await fetch(wsdlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "",
      },
      body: soapRequest,
    });

    const responseText = await response.text();
    console.log("📥 [payment] Verify response:", responseText);

    const codeMatch = responseText.match(/<return>(.+?)<\/return>/);
    if (codeMatch) {
      const code = codeMatch[1];
      
      if (code === "0") {
        return json({
          success: true,
          message: "تراکنش تأیید شد",
        }, 200, corsHeaders);
      } else {
        return json({
          success: false,
          code: code,
          message: getPaymentErrorMessage(code),
        }, 400, corsHeaders);
      }
    }

    return json({
      success: false,
      message: "پاسخ نامعتبر از بانک",
    }, 500, corsHeaders);

  } catch (error) {
    console.error("❌ [payment] Verify error:", error);
    return json({
      success: false,
      message: "خطا در تأیید پرداخت",
    }, 500, corsHeaders);
  }
}

async function handlePaymentSettle(request, env, corsHeaders) {
  try {
    const body = await request.json();
    console.log("📤 [payment] Settle:", body);

    const {
      terminalId,
      userName,
      userPassword,
      orderId,
      saleOrderId,
      saleReferenceId,
    } = body;

    const wsdlUrl = "https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl";

    const soapRequest = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:pgw="http://interfaces.pgw.esb.bpm/">
        <soapenv:Header/>
        <soapenv:Body>
          <pgw:bpSettleRequest>
            <terminalId>${terminalId}</terminalId>
            <userName>${userName}</userName>
            <userPassword>${userPassword}</userPassword>
            <orderId>${orderId}</orderId>
            <saleOrderId>${saleOrderId}</saleOrderId>
            <saleReferenceId>${saleReferenceId}</saleReferenceId>
          </pgw:bpSettleRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const response = await fetch(wsdlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "",
      },
      body: soapRequest,
    });

    const responseText = await response.text();
    console.log("📥 [payment] Settle response:", responseText);

    const codeMatch = responseText.match(/<return>(.+?)<\/return>/);
    if (codeMatch) {
      const code = codeMatch[1];
      
      if (code === "0") {
        return json({
          success: true,
          message: "تسویه با موفقیت انجام شد",
        }, 200, corsHeaders);
      } else {
        return json({
          success: false,
          code: code,
          message: getPaymentErrorMessage(code),
        }, 400, corsHeaders);
      }
    }

    return json({
      success: false,
      message: "پاسخ نامعتبر از بانک",
    }, 500, corsHeaders);

  } catch (error) {
    console.error("❌ [payment] Settle error:", error);
    return json({
      success: false,
      message: "خطا در تسویه پرداخت",
    }, 500, corsHeaders);
  }
}

// ════════════════════════════════════════════════════════════
//  بخش ۳: توابع کمکی
// ════════════════════════════════════════════════════════════

function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/\D/g, "");
  if (p.startsWith("98") && p.length === 12) p = p.slice(2);
  if (p.startsWith("0") && p.length === 11) p = p.slice(1);
  if (p.length === 10 && p.startsWith("9")) return "98" + p;
  return null;
}

async function createToken(payload, secret) {
  try {
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }
    
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = { 
      ...payload, 
      iat: now, 
      exp: now + 60 * 60 * 24 * 30 
    };

    const encoder = new TextEncoder();
    
    const headerJson = JSON.stringify(header);
    const headerBytes = encoder.encode(headerJson);
    let headerB64 = btoa(String.fromCharCode(...headerBytes));
    headerB64 = headerB64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    
    const payloadJson = JSON.stringify(fullPayload);
    const payloadBytes = encoder.encode(payloadJson);
    let payloadB64 = btoa(String.fromCharCode(...payloadBytes));
    payloadB64 = payloadB64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC", 
      key, 
      encoder.encode(`${headerB64}.${payloadB64}`)
    );
    
    const sigBytes = new Uint8Array(signature);
    let sigB64 = btoa(String.fromCharCode(...sigBytes));
    sigB64 = sigB64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    return `${headerB64}.${payloadB64}.${sigB64}`;

  } catch (error) {
    console.error('Create token error:', error);
    throw error;
  }
}

async function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), 
      (c) => c.charCodeAt(0)),
    encoder.encode(`${parts[0]}.${parts[1]}`)
  );

  if (!valid) throw new Error("Invalid signature");

  const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const payloadBytes = Uint8Array.from(atob(payloadBase64), (c) => c.charCodeAt(0));
  const payloadJson = new TextDecoder().decode(payloadBytes);
  const payload = JSON.parse(payloadJson);
  
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return payload;
}

function getPaymentErrorMessage(code) {
  const messages = {
    "0": "تراکنش با موفقیت انجام شد",
    "11": "شماره کارت نامعتبر است",
    "12": "موجودی کافی نیست",
    "13": "رمز نادرست است",
    "14": "تعداد دفعات وارد کردن رمز بیش از حد مجاز است",
    "15": "کارت نامعتبر است",
    "16": "دفعات برداشت وجه بیش از حد مجاز است",
    "17": "کاربر از انجام تراکنش منصرف شده است",
    "18": "تاریخ انقضای کارت گذشته است",
    "19": "مبلغ برداشت وجه بیش از حد مجاز است",
    "21": "پذیرنده نامعتبر است",
    "23": "خطای امنیتی رخ داده است",
    "24": "اطلاعات کاربری پذیرنده نامعتبر است",
    "25": "مبلغ نامعتبر است",
    "41": "شماره درخواست تکراری است",
    "42": "تراکنش Sale یافت نشد",
    "43": "قبلاً درخواست Verify داده شده است",
    "44": "درخواست Verify یافت نشد",
    "45": "تراکنش Settle شده است",
    "46": "تراکنش Settle نشده است",
    "47": "تراکنش Settle یافت نشد",
    "48": "تراکنش Reverse شده است",
    "51": "تراکنش تکراری است",
    "54": "تراکنش مرجع موجود نیست",
    "55": "تراکنش نامعتبر است",
    "61": "خطا در واریز",
    "62": "مسیر بازگشت به سایت در دامنه ثبت شده قرار ندارد",
    "98": "سقف استفاده از رمز ایستا به پایان رسیده است",
    "111": "صادر کننده کارت نامعتبر است",
    "112": "خطای سوئیچ صادر کننده کارت",
    "113": "پاسخی از سامانه مقصد دریافت نشد",
    "114": "دارنده کارت مجاز به انجام این تراکنش نیست",
    "115": "شما امکان انجام این تراکنش را ندارید",
    "116": "صادر کننده کارت قادر به پاسخگویی نیست",
    "117": "در حال حاضر صادر کننده کارت قادر به پاسخگویی نیست",
    "211": "امکان انجام تراکنش توسط این دستگاه مقدور نیست",
  };
  return messages[code] || `کد خطا: ${code}`;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
