/**
 * ทางเข้า/ออกตามสัญญา auth 1.1 (auth-contract ข้อ 5 · 7) — ระบบย่อยไม่มีหน้าฟอร์ม login ของตัวเอง
 *
 * - เข้า: ทุกการเข้าสู่ระบบเริ่มที่ `/auth/login?next=` ของเราเอง (Next ส่งต่อไป backend) ซึ่งสร้าง state
 *   แล้วพาเบราว์เซอร์ไปเว็บ Core Hub · กลับมาที่หน้า `next` เอง — ไม่ต้องจำหน้าไว้ฝั่งเบราว์เซอร์อีก
 * - 401 (token หมดอายุ) → silent re-SSO: พาทั้งหน้าไป `/auth/login?next=<หน้าปัจจุบัน>` (ห้ามใช้ fetch)
 *   · กันวน: ถ้าเพิ่งเริ่ม re-SSO ไม่ถึง 30 วินาทีแล้วยัง 401 → แสดงปุ่ม "เข้าสู่ระบบอีกครั้ง" แทน
 *   · หน้าที่มีงานค้าง (useUnsavedWork · holdUnsavedWork) ห้าม redirect ทับ → แสดงปุ่มให้ผู้ใช้เลือกเอง
 *   · ต่ออายุล่วงหน้าตอนเปลี่ยนหน้า เมื่อ session.expiresAt จาก /api/v1/me ใกล้หมด (renewIfExpiring)
 * - ออก: `POST /auth/logout` (ฟอร์มจริง) — backend ลบคุกกี้ของเราแล้วพาไปหน้า /logout ของ Core Hub = ออกทั้งระบบ
 */
export const LOGIN_PATH = '/auth/login';
export const LOGOUT_PATH = '/auth/logout';
/** สัญญาข้อ 7: กลับจาก re-SSO ไม่ถึง 30 วินาทีแล้วยัง 401 = วน */
export const LOOP_GUARD_MS = 30_000;
/** ต่ออายุล่วงหน้าเมื่อเหลือไม่ถึงเท่านี้ ตอนเปลี่ยนหน้า (ยังไม่มีงานค้างให้เสีย) */
export const RENEW_BEFORE_MS = 120_000;
const STARTED_KEY = 'csmju:sso-started-at';

/** หน้าแรกของ Core Hub (ปุ่ม "กลับหน้าหลัก CSMJU") — ค่ามาจาก NEXT_PUBLIC_* ตอน build */
export const coreDashboardUrl = () => process.env.NEXT_PUBLIC_CORE_DASHBOARD_URL ?? 'http://localhost:3100/';

export const loginUrl = (next?: string) => (next ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}` : LOGIN_PATH);

const currentPath = () => window.location.pathname + window.location.search;

export type SessionNotice = null | { kind: 'loop' | 'unsaved'; loginHref: string };

let leaving = false;
let unsavedCount = 0;
let notice: SessionNotice = null;
const listeners = new Set<(n: SessionNotice) => void>();

function publish(next: SessionNotice): void {
  notice = next;
  for (const listener of listeners) listener(notice);
}

/** shell ฟังเพื่อแสดงแถบ "เซสชันหมดอายุ" พร้อมปุ่มเข้าสู่ระบบอีกครั้ง */
export function subscribeSessionNotice(listener: (n: SessionNotice) => void): () => void {
  listeners.add(listener);
  listener(notice);
  return () => {
    listeners.delete(listener);
  };
}

function readStartedAt(): number {
  try {
    return Number(window.sessionStorage.getItem(STARTED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** เริ่ม sign-in ใหม่แบบ top-level navigation — เรียกซ้ำได้ ไปครั้งเดียว */
export function startLogin(next: string = currentPath()): void {
  if (typeof window === 'undefined' || leaving) return;
  leaving = true;
  try {
    window.sessionStorage.setItem(STARTED_KEY, String(Date.now()));
  } catch {
    // sessionStorage ใช้ไม่ได้ — กันวนไม่ได้แต่ยังเข้าได้
  }
  window.location.assign(loginUrl(next));
}

/** API ตอบ 401 — ตัดสินว่าจะพาไป re-SSO เลย หรือถามผู้ใช้ก่อน */
export function handleUnauthorized(): void {
  if (typeof window === 'undefined' || leaving) return;
  const loginHref = loginUrl(currentPath());
  if (Date.now() - readStartedAt() < LOOP_GUARD_MS) {
    publish({ kind: 'loop', loginHref });
    return;
  }
  if (unsavedCount > 0) {
    publish({ kind: 'unsaved', loginHref });
    return;
  }
  startLogin();
}

/**
 * หน้าที่มีงานยังไม่บันทึกประกาศไว้ (ผ่าน hook useUnsavedWork) — ระหว่างนี้ 401 จะไม่พาออกจากหน้าเอง
 * คืนฟังก์ชันปลดการประกาศ
 */
export function holdUnsavedWork(): () => void {
  unsavedCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unsavedCount -= 1;
  };
}

/** ตอนเปลี่ยนหน้า: session ใกล้หมด (ดูจาก /api/v1/me) → ต่ออายุเลยก่อนหน้าใหม่จะมีงานค้าง */
export function renewIfExpiring(expiresAt: string | undefined, next: string, now: number = Date.now()): boolean {
  if (!expiresAt || unsavedCount > 0) return false;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at) || at - now > RENEW_BEFORE_MS) return false;
  if (now - readStartedAt() < LOOP_GUARD_MS) return false;
  startLogin(next);
  return true;
}

/** ฟอร์ม POST /auth/logout กำลังส่ง — 401 ที่ค้างอยู่ห้ามพาไป login ทับ */
export function markSigningOut(): void {
  leaving = true;
}
