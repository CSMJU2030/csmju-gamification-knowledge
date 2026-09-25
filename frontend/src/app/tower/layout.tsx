import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'หอคอย' };

export default function TowerLayout({ children }: { children: ReactNode }) {
  return children;
}
