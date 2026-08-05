/**
 * رازی ۳۶۰ - پرداخت بانک ملت (فرانت‌اند)
 * رمز درگاه اینجا نیست — فقط روی Worker
 */

const PAYMENT_CONFIG = {
  // ← آدرس Worker خودت را بگذار
  API_BASE: "https://razi360-auth.persianowl100.workers.dev",

  // بهتر است callback روی خود Worker باشد
  // اگر خالی بماند، Worker خودش /api/payment/callback را استفاده می‌کند
  CALLBACK_URL: "", // مثال: "https://razi360-auth.persianowl100.workers.dev/api/payment/callback"
};

/**
 * @param {number|string} orderId   شماره یکتای سفارش
 * @param {number} amountRial       مبلغ به ریال (۱۰۰۰ تومان = ۱۰۰۰۰ ریال)
 * @param {string} [description]
 * @param {string} [mobileNo]       اختیاری، مثل 98912...
 */
export function initiatePayment(orderId, amountRial, description, mobileNo) {
  const url = PAYMENT_CONFIG.API_BASE.replace(/\/$/, "") + "/api/payment/request";

  const payload = {
    orderId: Number(orderId),
    amount: Number(amountRial),
    additionalData: description || "خرید از رازی ۳۶۰",
  };
  if (PAYMENT_CONFIG.CALLBACK_URL) {
    payload.callBackUrl = PAYMENT_CONFIG.CALLBACK_URL;
  }
  if (mobileNo) payload.mobileNo = mobileNo;

  sessionStorage.setItem(
    "razi360_pending_order",
    JSON.stringify({ orderId: Number(orderId), amount: Number(amountRial) })
  );

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  })
    .then((res) => res.json())
    .then((result) => {
      if (!result.success || !result.refId) {
        throw new Error(result.message || "خطا در شروع پرداخت");
      }

      // طبق مستند ملت: RefId با POST
      const form = document.createElement("form");
      form.method = "POST";
      form.action = result.startPayUrl || "https://bpm.shaparak.ir/pgwchannel/startpay.mellat";
      form.acceptCharset = "UTF-8";

      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "RefId";
      input.value = result.refId;
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();
      return result;
    });
}

export function verifyPayment(orderId, saleOrderId, saleReferenceId) {
  const url = PAYMENT_CONFIG.API_BASE.replace(/\/$/, "") + "/api/payment/verify";
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      orderId: Number(orderId),
      saleOrderId: Number(saleOrderId || orderId),
      saleReferenceId: Number(saleReferenceId),
    }),
  }).then((res) => res.json());
}
