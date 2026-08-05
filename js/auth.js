// ============================================
// افزودن به auth.js
// ============================================

// ─── مدیریت تایمر ارسال مجدد ──────────────────

export function startResendTimer(buttonElement, duration = 60) {
  let remaining = duration;
  
  // ذخیره متن اصلی دکمه
  const originalText = buttonElement.innerHTML;
  
  // غیرفعال کردن دکمه
  buttonElement.disabled = true;
  
  // به‌روزرسانی تایمر
  function updateTimer() {
    if (remaining <= 0) {
      // پایان تایمر
      buttonElement.disabled = false;
      buttonElement.innerHTML = originalText;
      return;
    }
    
    buttonElement.innerHTML = `⏳ ${remaining} ثانیه`;
    remaining--;
    setTimeout(updateTimer, 1000);
  }
  
  // شروع تایمر
  updateTimer();
  
  // برگرداندن تابع برای لغو تایمر (اختیاری)
  return () => {
    buttonElement.disabled = false;
    buttonElement.innerHTML = originalText;
  };
}
