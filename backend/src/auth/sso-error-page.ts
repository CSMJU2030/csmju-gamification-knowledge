/**
 * หน้า HTML ของ /auth/callback ที่ไม่สำเร็จ — ให้คนที่เปิดด้วยเบราว์เซอร์เห็นปุ่ม ไม่ใช่ JSON ดิบ
 * (auth-contract.md 1.2 ข้อ 5.1: state ไม่ตรงหรือคุกกี้ state หมดอายุ → 401 พร้อมปุ่ม "เข้าสู่ระบบอีกครั้ง")
 *
 * ใช้เฉพาะเมื่อ client ขอ text/html มากกว่า JSON (เบราว์เซอร์) — script และ conformance ที่ส่ง Accept: application/json
 * ยังได้ envelope JSON ตามเดิม · status code เหมือนกันทั้งสองแบบ
 * หน้าไม่มีข้อมูลจาก request เลย (ไม่สะท้อน query กลับ) · ไม่มี script · สีใช้ system color ตามธีมของเครื่อง
 */
import type { Request } from 'express';
import { LOGIN_PATH } from './sso';

export const wantsHtml = (req: Request): boolean => req.accepts(['application/json', 'text/html']) === 'text/html';

interface Page {
  title: string;
  body: string;
  action: { href: string; label: string };
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function pageFor(status: number, coreHubHome: string): Page {
  const again = { href: LOGIN_PATH, label: 'เข้าสู่ระบบอีกครั้ง' };
  if (status === 403) {
    return {
      title: 'บัญชีของคุณไม่มีสิทธิ์เข้าระบบนี้',
      body: 'Code Tower เปิดให้นักศึกษา ศิษย์เก่า อาจารย์ และบุคลากร — ถ้าคิดว่าควรเข้าได้ ให้ติดต่อผู้ดูแลระบบ',
      action: { href: coreHubHome, label: 'กลับหน้าหลัก CSMJU' },
    };
  }
  if (status === 400) {
    return { title: 'ลิงก์เข้าระบบไม่ถูกต้อง', body: 'ลิงก์นี้ไม่มีข้อมูลการเข้าสู่ระบบจาก Core Hub', action: again };
  }
  return {
    title: 'เข้าสู่ระบบไม่สำเร็จ',
    body: 'การเข้าสู่ระบบครั้งนี้หมดเวลาหรือเริ่มจากหน้าอื่น (เช่น อยู่ที่หน้า login ของ Core Hub นานเกิน 10 นาที) — กดปุ่มด้านล่างเพื่อเริ่มใหม่',
    action: again,
  };
}

export function ssoErrorPage(status: number, coreHubHome: string): string {
  const page = pageFor(status, coreHubHome);
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(page.title)} · Code Tower</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; box-sizing: border-box;
  font-family: system-ui, "Noto Sans Thai", sans-serif; line-height: 1.6; background: Canvas; color: CanvasText; }
main { max-width: 30rem; text-align: center; }
h1 { font-size: 1.375rem; margin: 0 0 0.5rem; }
p { margin: 0 0 1.25rem; }
a { display: inline-block; padding: 0.75rem 1.5rem; border: 0.125rem solid currentColor; border-radius: 0.5rem;
  color: LinkText; font-weight: 600; text-decoration: none; }
a:focus-visible { outline: 0.1875rem solid Highlight; outline-offset: 0.1875rem; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(page.title)}</h1>
<p>${escapeHtml(page.body)}</p>
<a href="${escapeHtml(page.action.href)}">${escapeHtml(page.action.label)}</a>
</main>
</body>
</html>
`;
}
