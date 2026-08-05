/**
 * رازی ۳۶۰ - پرداخت با بانک ملت
 * ---------------------------------
 * این فایل فقط مسئول ارتباط با Worker است
 */

const PAYMENT_CONFIG = {
  // ⚠️ این آدرس باید دقیقاً با Worker یکی باشد
  API_BASE: "https://razi360-auth.persianowl100.workers.dev",

  TERMINAL_ID: "9591783",
  USERNAME: "IPG9591783",
  PASSWORD: "94150004",

  CALLBACK_URL: "https://razi360.ir/pages/callback.html",
};

function getCurrentDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getCurrentTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${h}${min}${s}`;
}

// ─── شروع پرداخت ──────────────────────────────────
function initiatePayment(orderId, amount, description) {
  // ✅ استفاده از function معمولی به جای async
  var url = PAYMENT_CONFIG.API_BASE + "/api/payment/initiate";

  console.log("📤 [payment] آدرس:", url);
  console.log("📤 [payment] مبلغ:", amount);

  var payload = {
    terminalId: PAYMENT_CONFIG.TERMINAL_ID,
    userName: PAYMENT_CONFIG.USERNAME,
    userPassword: PAYMENT_CONFIG.PASSWORD,
    orderId: orderId,
    amount: amount,
    localDate: getCurrentDate(),
    localTime: getCurrentTime(),
    additionalData: description || "خرید از رازی‌۳۶۰",
    callBackUrl: PAYMENT_CONFIG.CALLBACK_URL,
    payerId: 0,
  };

  // ✅ برگرداندن Promise با then/catch به جای async/await
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then(function(response) {
      return response.json();
    })
    .then(function(result) {
      console.log("📥 [payment] نتیجه:", result);

      if (result.success && result.refId) {
        var bankUrl =
          "https://bpm.shaparak.ir/pgwchannel/startpay.mellat?RefId=" +
          result.refId;
        window.location.href = bankUrl;
        return result;
      } else {
        throw new Error(result.message || "خطا در شروع پرداخت");
      }
    });
}

// ─── تست اتصال ──────────────────────────────────
function testPaymentConnection() {
  var url = PAYMENT_CONFIG.API_BASE + "/health";
  console.log("🔍 [test] تست اتصال به:", url);

  return fetch(url)
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      console.log("✅ [test] اتصال برقرار است:", data);
      return { success: true, data: data };
    })
    .catch(function(error) {
      console.error("❌ [test] خطا:", error);
      return { success: false, error: error.message };
    });
}

// ─── صادر کردن توابع ──────────────────────────────
export { initiatePayment, testPaymentConnection };
