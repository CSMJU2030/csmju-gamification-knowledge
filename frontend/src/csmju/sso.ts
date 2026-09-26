/**
 * ทางเข้า/ออกผ่าน Core Hub (auth-contract ข้อ 5 · 7) — ระบบย่อยไม่มีหน้า login ของตัวเอง
 * ค่ามาจาก NEXT_PUBLIC_* (ฝังตอน build) ดู frontend/.env.example
 */
const SUBSYSTEM = 'csmju-gamification-knowledge';
const RETURN_KEY = 'csmju:return-to';

function fill(template: string | undefined, fallback: string): string {
  return (template ?? fallback).replace('{subsystem}', encodeURIComponent(SUBSYSTEM));
}

export const ssoLoginUrl = () =>
  fill(process.env.NEXT_PUBLIC_SSO_LOGIN_URL, 'http://localhost:3100/login?subsystem={subsystem}');
export const ssoLogoutUrl = () =>
  fill(process.env.NEXT_PUBLIC_SSO_LOGOUT_URL, 'http://localhost:3100/logout?subsystem={subsystem}');
export const coreDashboardUrl = () => fill(process.env.NEXT_PUBLIC_CORE_DASHBOARD_URL, 'http://localhost:3100/');

let redirecting = false;

/** 401 → จำหน้าที่อยู่ (ไม่ใช่ token) แล้วพาไป SSO — เรียกซ้ำได้ ไปครั้งเดียว */
export function redirectToSsoLogin(): void {
  if (typeof window === 'undefined' || redirecting) return;
  redirecting = true;
  try {
    window.sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
  } catch {
    // sessionStorage ใช้ไม่ได้ — กลับมาที่หน้าแรกแทน
  }
  window.location.assign(ssoLoginUrl());
}

/** หลัง SSO กลับมาที่ `/` — ถ้าเคยจำหน้าไว้ คืน path นั้นครั้งเดียว */
export function takeReturnPath(): string | null {
  try {
    const path = window.sessionStorage.getItem(RETURN_KEY);
    window.sessionStorage.removeItem(RETURN_KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}
