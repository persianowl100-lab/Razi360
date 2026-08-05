/**
 * رازی ۳۶۰ - پرداخت با بانک ملت
 * ---------------------------------
 * این فایل وظیفه ارتباط با درگاه پرداخت بانک ملت را دارد.
 * قبل از استفاده:
 * 1. API_BASE را به آدرس Worker خود تغییر دهید
 * 2. اطلاعات درگاه را از بانک دریافت کنید
 */

const PAYMENT_CONFIG = {
  // ✅ آدرس Worker شما
  API_BASE: "https://razi360-auth.persianowl100.workers.dev",
  
  // 📌 اطلاعات درگاه (از بانک ملت دریافت شده)
  TERMINAL_ID: "9591783",
  USERNAME: "IPG9591783",
  PASSWORD: "94150004",
  
  // 🔄 آدرس بازگشت از بانک
  CALLBACK_URL: "https://razi360.ir/pages/callback.html",
};

// ─── تاریخ و ساعت جاری ──────────────────────────────────

function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}${minutes}${seconds}`;
}

// ─── شروع پرداخت ──────────────────────────────────────────

export async function initiatePayment(orderId, amount, description = "") {
  const url = `${PAYMENT_CONFIG.API_BASE}/api/payment/initiate`;
  
  console.log("📤 [payment] شروع پرداخت:");
  console.log("  - orderId:", orderId);
  console.log("  - amount:", amount);
  console.log("  - description:", description);

  const payload = {
    terminalId: PAYMENT_CONFIG.TERMINAL_ID,
    userName: PAYMENT_CONFIG.USERNAME,
    userPassword: PAYMENT_CONFIG.PASSWORD,
    orderId: orderId,
    amount: amount,
    localDate: getCurrentDate(),
    localTime: getCurrentTime(),
    additionalData: description,
    callBackUrl: PAYMENT_CONFIG.CALLBACK_URL,
    payerId: 0,
  };

  console.log("📤 [payment] payload:", payload);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload),
    });

    console.log("📥 [payment] وضعیت:", response.status);
    
    // بررسی اینکه پاسخ JSON است یا HTML
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      console.error("❌ [payment] پاسخ HTML:", html.substring(0, 200));
      throw new Error('سرور پاسخ HTML برگرداند. آدرس Worker را بررسی کنید.');
    }

    const result = await response.json();
    console.log("📥 [payment] نتیجه:", result);

    if (result.success && result.refId) {
      // ✅ هدایت به صفحه پرداخت بانک
      const payUrl = `https://bpm.shaparak.ir/pgwchannel/startpay.mellat?RefId=${result.refId}`;
      console.log("🔗 [payment] هدایت به:", payUrl);
      window.location.href = payUrl;
    } else {
      throw new Error(result.message || "خطا در شروع پرداخت");
    }

    return result;

  } catch (error) {
    console.error("❌ [payment] خطا:", error);
    throw error;
  }
}

// ─── تأیید پرداخت ──────────────────────────────────────

export async function verifyPayment(refId, orderId, saleOrderId, saleReferenceId) {
  const url = `${PAYMENT_CONFIG.API_BASE}/api/payment/verify`;
  
  console.log("📤 [verify] تأیید پرداخت:");
  console.log("  - refId:", refId);
  console.log("  - orderId:", orderId);

  const payload = {
    terminalId: PAYMENT_CONFIG.TERMINAL_ID,
    userName: PAYMENT_CONFIG.USERNAME,
    userPassword: PAYMENT_CONFIG.PASSWORD,
    refId: refId,
    orderId: orderId,
    saleOrderId: saleOrderId,
    saleReferenceId: saleReferenceId,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('سرور پاسخ HTML برگرداند');
    }

    const result = await response.json();
    console.log("📥 [verify] نتیجه:", result);
    return result;

  } catch (error) {
    console.error("❌ [verify] خطا:", error);
    throw error;
  }
}

// ─── تسویه پرداخت ──────────────────────────────────────

export async function settlePayment(orderId, saleOrderId, saleReferenceId) {
  const url = `${PAYMENT_CONFIG.API_BASE}/api/payment/settle`;
  
  console.log("📤 [settle] تسویه پرداخت:");
  console.log("  - orderId:", orderId);

  const payload = {
    terminalId: PAYMENT_CONFIG.TERMINAL_ID,
    userName: PAYMENT_CONFIG.USERNAME,
    userPassword: PAYMENT_CONFIG.PASSWORD,
    orderId: orderId,
    saleOrderId: saleOrderId,
    saleReferenceId: saleReferenceId,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('سرور پاسخ HTML برگرداند');
    }

    const result = await response.json();
    console.log("📥 [settle] نتیجه:", result);
    return result;

  } catch (error) {
    console.error("❌ [settle] خطا:", error);
    throw error;
  }
}

// ─── تست اتصال به Worker ──────────────────────────────

export async function testPaymentConnection() {
  const url = `${PAYMENT_CONFIG.API_BASE}/health`;
  console.log("🔍 [test] تست اتصال به:", url);

  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log("📥 [test] پاسخ:", text.substring(0, 200));
    
    if (text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      console.log("✅ [test] اتصال برقرار است:", data);
      return { success: true, data };
    } else {
      return { success: false, error: 'پاسخ غیر JSON' };
    }
  } catch (error) {
    console.error("❌ [test] خطا:", error);
    return { success: false, error: error.message };
  }
}    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("📥 نتیجه پرداخت:", result);

    if (result.success && result.refId) {
      // هدایت به صفحه پرداخت بانک
      window.location.href = `https://bpm.shaparak.ir/pgwchannel/startpay.mellat?RefId=${result.refId}`;
    } else {
      throw new Error(result.message || "خطا در شروع پرداخت");
    }

    return result;

  } catch (error) {
    console.error("❌ خطا:", error);
    throw error;
  }
}

// ─── تأیید پرداخت ──────────────────────────────────────

export async function verifyPayment(refId, orderId, saleOrderId, saleReferenceId) {
  const url = `${PAYMENT_CONFIG.API_BASE}/api/payment/verify`;
  
  const payload = {
    terminalId: PAYMENT_CONFIG.TERMINAL_ID,
    userName: PAYMENT_CONFIG.USERNAME,
    userPassword: PAYMENT_CONFIG.PASSWORD,
    refId: refId,
    orderId: orderId,
    saleOrderId: saleOrderId,
    saleReferenceId: saleReferenceId,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("📥 نتیجه تأیید:", result);
    return result;

  } catch (error) {
    console.error("❌ خطا:", error);
    throw error;
  }
}

// ─── تسویه پرداخت ──────────────────────────────────────

export async function settlePayment(orderId, saleOrderId, saleReferenceId) {
  const url = `${PAYMENT_CONFIG.API_BASE}/api/payment/settle`;
  
  const payload = {
    terminalId: PAYMENT_CONFIG.TERMINAL_ID,
    userName: PAYMENT_CONFIG.USERNAME,
    userPassword: PAYMENT_CONFIG.PASSWORD,
    orderId: orderId,
    saleOrderId: saleOrderId,
    saleReferenceId: saleReferenceId,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("📥 نتیجه تسویه:", result);
    return result;

  } catch (error) {
    console.error("❌ خطا:", error);
    throw error;
  }
}

// ─── توابع کمکی ──────────────────────────────────────

function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}${minutes}${seconds}`;
}
