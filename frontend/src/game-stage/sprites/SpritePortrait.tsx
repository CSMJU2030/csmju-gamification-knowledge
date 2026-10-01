'use client';

/**
 * สไปรต์พิกเซลจาก sprites.json เป็น <img> ที่คมทุกขนาด (ย้ายจาก client/src/components/SpritePortrait.tsx)
 * ส่วนหนึ่งของ "เวทีเกม" (G0 ข้อ 5.1 — portrait ของตัวละครและมอน) · กรอบรอบภาพใช้ token กลาง
 * inline style ใช้กับขนาดเท่านั้น (ไม่ใช่สี/ฟอนต์)
 */
import { useMemo } from 'react';
import type { AnimState } from './schema';
import { spriteDataUrl, spriteSize } from './decode';

interface Props {
  /** เช่น 'class:mage', 'mon:goblin' */
  spriteId: string;
  /** ความสูงเป็น px (โหมดปกติ) หรือขนาดกล่องจัตุรัส (โหมด crop) */
  size?: number;
  state?: AnimState;
  frame?: number;
  /** crop = ตัดเฉพาะหัวถึงไหล่ใส่กล่องจัตุรัส */
  crop?: boolean;
  className?: string;
  alt?: string;
}

export default function SpritePortrait({
  spriteId,
  size = 44,
  state = 'idle',
  frame = 0,
  crop = false,
  className = '',
  alt = '',
}: Props) {
  const dims = spriteSize(spriteId);

  const url = useMemo(() => {
    if (!dims) return null;
    const target = crop ? size * 1.2 : size;
    const scale = Math.min(6, Math.max(1, Math.ceil(target / dims.h)));
    return spriteDataUrl(spriteId, state, frame, scale);
  }, [spriteId, state, frame, size, crop, dims]);

  if (!url || !dims) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-lg bg-surface-container text-label-md text-outline ${className}`}
        style={{ width: size, height: size }}
        aria-label={alt || spriteId}
        role="img"
      >
        ?
      </span>
    );
  }

  if (crop) {
    return (
      <span
        className={`inline-flex shrink-0 justify-center overflow-hidden rounded-full bg-surface-container ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          className="[image-rendering:pixelated]"
          src={url}
          alt={alt}
          style={{ width: Math.round(size * 0.86), height: 'auto', marginTop: Math.round(size * 0.18) }}
        />
      </span>
    );
  }

  return (
    <img
      className={`[image-rendering:pixelated] ${className}`}
      src={url}
      alt={alt}
      style={{ height: size, width: Math.round((dims.w / dims.h) * size) }}
    />
  );
}
