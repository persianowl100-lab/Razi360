/**
 * رازی ۳۶۰ - پرداخت با بانک ملت
 */

const PAYMENT_CONFIG = {
  // آدرس Worker
  API_BASE: "https://razi360-auth.persianowl100.workers.dev",
  
  // اطلاعات درگاه (از طرف بانک)
  TERMINAL_ID: "9591783",
  USERNAME: "IPG9591783",
  PASSWORD: "94150004",
  
  // آدرس بازگشت
  CALLBACK_URL: "https://razi360.ir/pages/callback.html",
};

// ─── پردازش پرداخت ──────────────────────────────────────

export async function initiatePayment(orderId, amount, description = "") {
  const url = `${PAYMENT_CONFIG.API_BASE}/api/payment/initiate`;
  
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

  try {
    const response = await fetch(url, {
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
