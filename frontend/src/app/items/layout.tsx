import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'กระเป๋า' };

export default function ItemsLayout({ children }: { children: ReactNode }) {
  return children;
}
