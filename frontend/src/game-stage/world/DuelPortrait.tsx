'use client';

/**
 * portrait ของคู่ดวลบนหน้าคำประกาศ — รวม classSpriteId + SpritePortrait ไว้ในไฟล์เดียว
 * เพื่อให้หน้าโหลดทั้งก้อนแบบ lazy ได้ในครั้งเดียว: decode.ts อ่าน sprites.json (~140KB)
 * ถ้าหน้า import classSpriteId ตรง ๆ ไฟล์นั้นจะติดเข้า JS แรกเข้าไปด้วยแม้ตัว portrait จะ lazy ก็ตาม
 */
import SpritePortrait from '@/game-stage/sprites/SpritePortrait';
import { classSpriteId } from '@/game-stage/sprites/decode';

export default function DuelPortrait({ classId, size = 48, alt }: { classId: string; size?: number; alt: string }) {
  return <SpritePortrait spriteId={classSpriteId(classId)} size={size} crop alt={alt} className="shrink-0" />;
}
