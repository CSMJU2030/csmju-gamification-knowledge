import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'โจทย์' };

export default function ChallengesLayout({ children }: { children: ReactNode }) {
  return children;
}
