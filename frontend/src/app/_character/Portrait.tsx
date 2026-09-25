'use client';

/**
 * portrait ของตัวละคร — สไปรต์เป็นเวทีเกม (sprites.json) จึงโหลดแบบ lazy
 * ไม่ให้ข้อมูลภาพเข้า JS แรกเข้าของหน้าตัวละคร (G0 ข้อ 8)
 */
import dynamic from 'next/dynamic';

const SpritePortrait = dynamic(() => import('@/game-stage/sprites/SpritePortrait'), {
  ssr: false,
  loading: () => <span className="skeleton block h-full w-full rounded-lg" aria-hidden="true" />,
});

export function Portrait({ classId, size, alt }: { classId: string; size: number; alt: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-end justify-center overflow-hidden rounded-xl bg-surface-container p-2"
      style={{ width: size + 16, height: size + 16 }}
    >
      <SpritePortrait spriteId={`class:${classId}`} size={size} alt={alt} />
    </span>
  );
}
