/**
 * رازی ۳۶۰ - Auth Helper (فرانت‌اند)
 * ---------------------------------
 * این فایل را در تمام صفحاتی که نیاز به لاگین دارند include کن.
 */

const AUTH_CONFIG = {
  // ✅ آدرس Worker شما
  API_BASE: "https://razi360-auth.persianowl100.workers.dev",

  // نام ربات تلگرام (بدون @)
  TELEGRAM_BOT_USERNAME: "Razi360Bot",

  // کلیدهای ذخیره‌سازی
  TOKEN_KEY: "razi360_token",
  USER_KEY: "razi360_user",
};

function getHomePath() {
  return window.location.pathname.includes("/pages/") ? "../index.html" : "index.html";
}

function getLoginPath() {
  return window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
}

// ─── توابع اصلی ───────────────────────────────────────

export function getToken() {
  return localStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_CONFIG.USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return !!getToken();
}

export function saveSession(token, user) {
  localStorage.setItem(AUTH_CONFIG.TOKEN_KEY, token);
  localStorage.setItem(AUTH_CONFIG.USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(AUTH_CONFIG.TOKEN_KEY);
  localStorage.removeItem(AUTH_CONFIG.USER_KEY);
}

export function logout() {
  clearSession();
  window.location.href = getHomePath();
}

// ─── ارسال OTP ────────────────────────────────────────

export async function sendOtp(phone) {
  const url = `${AUTH_CONFIG.API_BASE}/api/auth/send-otp`;
  console.log('📤 ارسال به:', url);
  console.log('📱 شماره:', phone);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ phone }),
    });

    console.log('📥 وضعیت:', response.status);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      console.error('❌ پاسخ HTML:', html.substring(0, 200));
      throw new Error('سرور پاسخ HTML برگرداند. آدرس Worker را بررسی کنید.');
    }

    if (!response.ok) {
      const text = await response.text();
      console.error('❌ خطای سرور:', text);
      throw new Error(`خطای ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log('✅ پاسخ:', data);
    return data;

  } catch (error) {
    console.error('❌ خطا:', error);
    throw error;
  }
}

// ─── تأیید OTP ────────────────────────────────────────

export async function verifyOtp(phone, code) {
  const url = `${AUTH_CONFIG.API_BASE}/api/auth/verify-otp`;
  console.log('📤 تأیید کد:', url);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ phone, code }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('سرور پاسخ HTML برگرداند');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`خطای ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (data.success) {
      saveSession(data.token, data.user);
    }
    return data;

  } catch (error) {
    console.error('❌ خطا:', error);
    throw error;
  }
}

// ─── ورود با تلگرام ────────────────────────────────────

export async function loginWithTelegram(telegramData) {
  const url = `${AUTH_CONFIG.API_BASE}/api/auth/telegram`;
  console.log('📤 ورود با تلگرام:', url);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(telegramData),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('سرور پاسخ HTML برگرداند');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`خطای ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (data.success) {
      saveSession(data.token, data.user);
    }
    return data;

  } catch (error) {
    console.error('❌ خطا:', error);
    throw error;
  }
}

// ─── بررسی توکن ───────────────────────────────────────

export async function fetchMe() {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch(`${AUTH_CONFIG.API_BASE}/api/auth/me`, {
      headers: { 
        Authorization: `Bearer ${token}`,
        "Accept": "application/json"
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      clearSession();
      return null;
    }

    if (!response.ok) {
      clearSession();
      return null;
    }

    const data = await response.json();
    if (!data.success) {
      clearSession();
      return null;
    }
    return data.user;

  } catch (error) {
    console.error('❌ خطا:', error);
    clearSession();
    return null;
  }
}

// ─── تست اتصال ────────────────────────────────────────

export async function testConnection() {
  const url = `${AUTH_CONFIG.API_BASE}/health`;
  console.log('🔍 تست اتصال به:', url);

  try {
    const response = await fetch(url);
    const text = await response.text();
    
    if (text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      console.log('✅ اتصال برقرار است:', data);
      return { success: true, data };
    } else {
      console.error('❌ پاسخ غیر JSON:', text.substring(0, 100));
      return { success: false, error: 'پاسخ غیر JSON' };
    }
  } catch (error) {
    console.error('❌ خطا:', error);
    return { success: false, error: error.message };
  }
}

// ─── رندر ویجت تلگرام ─────────────────────────────────

export function renderTelegramButton(containerId, onSuccess) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  const btn = document.createElement("script");
  btn.async = true;
  btn.src = "https://telegram.org/js/telegram-widget.js?22";
  btn.setAttribute("data-telegram-login", AUTH_CONFIG.TELEGRAM_BOT_USERNAME);
  btn.setAttribute("data-size", "large");
  btn.setAttribute("data-radius", "12");
  btn.setAttribute("data-request-access", "write");
  btn.setAttribute("data-userpic", "false");
  btn.setAttribute("data-lang", "fa");
  btn.setAttribute("data-onauth", "onTelegramAuth(user)");

  window.onTelegramAuth = async function (user) {
    try {
      const result = await loginWithTelegram(user);
      if (result.success) {
        onSuccess?.(result.user);
      } else {
        alert(result.message || "خطا در ورود با تلگرام");
      }
    } catch (e) {
      console.error(e);
      alert("خطا در ارتباط با سرور");
    }
  };

  container.appendChild(btn);
}

// ─── محافظت از صفحات ──────────────────────────────────

export function requireAuth(redirectTo = null) {
  if (!isLoggedIn()) {
    window.location.href = redirectTo || getLoginPath();
    return false;
  }
  return true;
}

// ─── تست خودکار هنگام بارگذاری ─────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    testConnection().then(result => {
      if (!result.success) {
        console.warn('⚠️ اتصال به سرور برقرار نیست:', result.error);
      } else {
        console.log('✅ اتصال به سرور برقرار است');
      }
    });
  });
}
