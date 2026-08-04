/**
 * رازی ۳۶۰ - Auth Helper (فقط پیامک کاوه‌نگار)
 *
 * قبل از استفاده:
 * API_BASE را به آدرس Worker خودت تغییر بده
 */

const AUTH_CONFIG = {
  API_BASE: "razi360-auth.persianowl100.workers.dev",  // ← بعد از دیپلوی Worker این را عوض کن
  TOKEN_KEY: "razi360_token",
  USER_KEY: "razi360_user",
};

function getHomePath() {
  return window.location.pathname.includes("/pages/") ? "../index.html" : "index.html";
}

function getLoginPath() {
  return window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
}

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

export async function sendOtp(phone) {
  const res = await fetch(`${AUTH_CONFIG.API_BASE}/api/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  return res.json();
}

export async function verifyOtp(phone, code) {
  const res = await fetch(`${AUTH_CONFIG.API_BASE}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  const data = await res.json();
  if (data.success) {
    saveSession(data.token, data.user);
  }
  return data;
}

export async function fetchMe() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${AUTH_CONFIG.API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) {
    clearSession();
    return null;
  }
  return data.user;
}

export function requireAuth(redirectTo = null) {
  if (!isLoggedIn()) {
    window.location.href = redirectTo || getLoginPath();
    return false;
  }
  return true;
}
