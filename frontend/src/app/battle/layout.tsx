import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** title ของแท็บ (ui-design-system ข้อ 11.4) — page.tsx เป็น client component จึงประกาศ metadata ที่นี่ */
export const metadata: Metadata = { title: 'เวทีรบ' };

export default function BattleLayout({ children }: { children: ReactNode }) {
  return children;
}
