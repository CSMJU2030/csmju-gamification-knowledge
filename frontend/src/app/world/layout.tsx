import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** หน้าในโฟลเดอร์นี้เป็น client component ทั้งหมด (export metadata ไม่ได้) — ตั้งชื่อแท็บที่ layout แทน (ข้อ 11.4) */
export const metadata: Metadata = { title: 'แผนที่โลก' };

export default function WorldLayout({ children }: { children: ReactNode }) {
  return children;
}
