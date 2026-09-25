import type { ReactNode } from 'react';

/** ชื่อหน้า + คำอธิบาย 1 บรรทัด (ข้อ 5.2) · `aside` = ของเสริมชิดขวา เช่น badge บทบาท */
export function PageHeader({
  title,
  description,
  aside,
  className = '',
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`fade-slide-up flex flex-col gap-3 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-[24px] leading-[1.3] font-bold text-on-surface md:text-headline-lg">{title}</h1>
        {description && <p className="text-body-md text-on-surface-variant">{description}</p>}
      </div>
      {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
    </header>
  );
}
