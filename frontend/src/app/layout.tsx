import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { CsmjuAppShell, type CsmjuNavItem } from '@/csmju';
import { ToastProvider } from '@/components/Toast';
import { GameProvider } from '@/lib/game/session';
import './globals.css';

/**
 * ฟอนต์ self-host ผ่าน next/font/local (ui-design-system ข้อ 4.1 — ห้ามโหลดจาก CDN)
 * ไฟล์ variable ของ fontsource 3 ไฟล์ (≤ 4 ไฟล์ ตามงบข้อ 15) · Noto Sans Thai แยก subset ไทย/ละติน
 * subset ไทยไม่มีตัวอักษรละติน เบราว์เซอร์จึงไล่ไปใช้ subset ละตินที่อยู่ถัดไปใน stack เอง
 */
const jakarta = localFont({
  src: '../fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  variable: '--font-jakarta',
  weight: '200 800',
  display: 'swap',
});
const notoThai = localFont({
  src: '../fonts/noto-sans-thai-thai-wght-normal.woff2',
  variable: '--font-noto-thai',
  weight: '100 900',
  display: 'swap',
  // ถ้ามี fallback ของ next ต่อท้าย ตัวละตินจะไปจบที่ fallback ก่อนถึง subset ละติน
  adjustFontFallback: false,
});
const notoLatin = localFont({
  src: '../fonts/noto-sans-thai-latin-wght-normal.woff2',
  variable: '--font-noto-latin',
  weight: '100 900',
  display: 'swap',
});

/** เมนูตาม G0 ข้อ 2 — เรียงตาม loop ของผู้เล่น: ดูตัวเอง → แก้โค้ด → ออกรบ → จัดของ */
const NAV: CsmjuNavItem[] = [
  { label: 'ตัวละคร', labelEn: 'Character', href: '/', icon: 'person' },
  { label: 'โปรแกรม BloxCode', labelEn: 'Program', href: '/program', icon: 'code' },
  { label: 'แผนที่โลก', labelEn: 'World', href: '/world', icon: 'map' },
  { label: 'หอคอย', labelEn: 'Tower', href: '/tower', icon: 'tower' },
  { label: 'กระเป๋า', labelEn: 'Items', href: '/items', icon: 'inventory' },
  { label: 'ประวัติการรบ', labelEn: 'Battles', href: '/battles', icon: 'history' },
  { label: 'โจทย์', labelEn: 'Challenges', href: '/challenges', icon: 'assignment' },
];

export const metadata: Metadata = {
  title: { default: 'Code Tower หอคอยนักสู้อัตโนมัติ', template: '%s · Code Tower' },
  description: 'เขียนโปรแกรม BloxCode ให้ตัวละครสู้เอง — ระบบย่อยของ CSMJU2030',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={`${jakarta.variable} ${notoThai.variable} ${notoLatin.variable} h-full antialiased`}>
      <body className="min-h-full">
        {/* จุดเดียวที่เรียก CsmjuAppShell (ui-design-system ข้อ 16.2) · ปุ่มหลักของระบบ "ลงรบ" → /world */}
        <ToastProvider>
          <CsmjuAppShell
            subsystemName="csmju-code-tower"
            displayName="Code Tower หอคอยนักสู้อัตโนมัติ"
            nav={NAV}
            primaryAction={{ label: 'ลงรบ', href: '/world', icon: 'swords' }}
          >
            <GameProvider>{children}</GameProvider>
          </CsmjuAppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
