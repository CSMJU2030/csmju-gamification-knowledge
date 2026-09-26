/**
 * ทางเข้า/ออกผ่าน Core Hub (auth-contract ข้อ 5 · 7) — ระบบย่อยไม่มีหน้า login ของตัวเอง
 * ค่ามาจาก NEXT_PUBLIC_* (ฝังตอน build) ดู frontend/.env.example
 */
const SUBSYSTEM = 'csmju-gamification-knowledge';
const RETURN_KEY = 'csmju:return-to';

function fill(template: string | undefined, fallback: string): string {
  return (template ?? fallback).replace('{subsystem}', encodeURIComponent(SUBSYSTEM));
}

/*
 * ค่าเริ่มต้นตรงกับหน้าเว็บ Core Hub ตัวจริง (csmju-core-hub/frontend :3100 · ตรวจกับ develop 6674ef6)
 * - เข้า: /api/sso/<subsystem> ขอ handoff แล้วส่งไป callback ของเรา · ยังไม่ login จะผ่าน /login?next=… ก่อนแล้วกลับมาเอง
 *   (หน้า /login ของ Core Hub ไม่อ่าน ?subsystem= — login แล้วจะค้างที่หน้าแรกของ Core Hub)
 * - ออก: ดู signOut() ข้างล่าง — จบ session ของระบบนี้แล้วไปหน้าแรกของ Core Hub (ออกจาก Core Hub ทำที่นั่น)
 * - ใช้ localhost ไม่ใช่ 127.0.0.1: /api/sso ของ Core Hub พาไปหน้า login ที่ localhost:3100 เสมอ
 *   และคุกกี้ของสอง host แยกกัน — host อื่นทำให้ login แล้วไม่กลับมา
 */
const CORE_HUB_WEB = 'http://localhost:3100';

export const ssoLoginUrl = () =>
  fill(process.env.NEXT_PUBLIC_SSO_LOGIN_URL, `${CORE_HUB_WEB}/api/sso/{subsystem}`);
/** หน้าที่พาไปหลังออกจากระบบ — หน้าแรกของ Core Hub */
export const ssoLogoutUrl = () => fill(process.env.NEXT_PUBLIC_SSO_LOGOUT_URL, `${CORE_HUB_WEB}/`);
export const coreDashboardUrl = () => fill(process.env.NEXT_PUBLIC_CORE_DASHBOARD_URL, `${CORE_HUB_WEB}/`);

/** รอคำขอที่ไม่จำเป็นต้องสำเร็จ แต่ไม่เกินเวลาที่กำหนด — ปุ่มออกจากระบบต้องไปต่อเสมอ */
async function settle(request: () => Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([request(), new Promise((resolve) => (timer = setTimeout(resolve, ms)))]);
  } catch {
    // ไม่สำเร็จก็ไปต่อ
  } finally {
    clearTimeout(timer);
  }
}

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

let signingOut = false;

/**
 * ปุ่ม "ออกจากระบบ" — จบ session ของระบบนี้ แล้วไปหน้าแรกของ Core Hub
 *
 * 1. DELETE /api/v1/sessions/current — ลบคุกกี้ session ของเรา (ไม่ลบ = ยังเข้าเกมได้อีก ≤ 15 นาที)
 * 2. ไปหน้าแรกของ Core Hub — session ของ Core Hub เป็นของ Core Hub ระบบนี้ไม่แตะ
 *    (สัญญา 1.0 ไม่มี SSO logout · ถ้ายัง login ที่ Core Hub อยู่ เปิดเกมอีกครั้งจะเข้าได้ทันทีผ่าน SSO
 *    ออกจาก Core Hub ด้วยปุ่มของ Core Hub เอง)
 */
export async function signOut(): Promise<void> {
  if (typeof window === 'undefined' || signingOut) return;
  signingOut = true;
  redirecting = true; // คำขอที่ค้างอยู่ได้ 401 ระหว่างนี้ ห้ามพาไป SSO (Core Hub ยัง login อยู่ = เด้งกลับเข้ามาใหม่)
  try {
    window.sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // ไม่เป็นไร
  }
  await settle(() => fetch('/api/v1/sessions/current', { method: 'DELETE', credentials: 'same-origin' }), 5000);
  window.location.assign(ssoLogoutUrl());
}
