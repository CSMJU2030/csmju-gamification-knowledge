import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * มีไว้เพื่อ metadata อย่างเดียว — page.tsx เป็น 'use client' (ใช้ hook) จึง export metadata เองไม่ได้
 * title ต่อท้ายด้วย template ของ layout ราก → "โปรแกรม BloxCode · Code Tower"
 */
export const metadata: Metadata = {
  title: 'โปรแกรม BloxCode',
};

export default function ProgramLayout({ children }: { children: ReactNode }) {
  return children;
}
