/**
 * กฎของแผนที่โลกที่หน้า /world และ /world/run ใช้ร่วมกัน — ฟังก์ชันล้วน ไม่มี React จึงเทสต์ได้ตรง ๆ
 * (ย้ายจาก spotStateOf / metaOf / RegionSheet ใน client/src/pages/WorldMapPage.tsx เดิม)
 *
 * ข้อความเหตุผลตอน disable ต้องตรงกับที่ backend ตอบ 409 (G0 ข้อ 4) เพราะผู้เล่นควรเห็นคำเดียวกัน
 * ไม่ว่าจะถูกกันไว้ที่ปุ่มหรือหลุดไปถึงเซิร์ฟเวอร์ — ต้นทางอยู่ที่ backend/src/world/region-runs.service.ts
 */
import type { StatusTone } from '@/csmju';
import type { Region } from '@/lib/api/types';

/** ทุกรอบในโซนมี 10 เวฟเสมอ — engine ไม่ส่งตัวเลขนี้มากับคำประกาศ ของเดิมก็เขียนตายตัวไว้แบบนี้ */
export const WAVES_PER_RUN = 10;

/** สัดส่วนของไฟล์แผนที่ (worldmap.jpg 1920×1072) — hotspot เป็นสัดส่วนของกรอบนี้ กรอบจึงต้องตรงกับภาพเป๊ะ */
export const MAP_WIDTH = 1920;
export const MAP_HEIGHT = 1072;

export type RegionStatus = 'town' | 'locked' | 'open' | 'progress' | 'done';

type ProgressFields = Pick<Region, 'depths' | 'unlocked' | 'completed' | 'depthCleared'>;
type RuleFields = Pick<Region, 'depths' | 'unlocked' | 'floorBase' | 'maxDepthAllowed'>;

export function regionStatus(r: ProgressFields): RegionStatus {
  // เมืองใช้ depths 0 เป็นตัวบอกว่า "ไม่มีการรบ" (engine: isBattleRegion) — ต้องเช็กก่อน unlocked
  // เพราะเมืองปลดล็อกเสมอ ถ้าเช็กทีหลังเมืองจะกลายเป็น "เข้าได้" ทั้งที่กดเข้าไม่ได้
  if (r.depths <= 0) return 'town';
  if (!r.unlocked) return 'locked';
  if (r.completed) return 'done';
  return r.depthCleared > 0 ? 'progress' : 'open';
}

/**
 * badge ในรายการ/การ์ด — "กำลังไป" กับ "ยังไม่เคยผ่าน" ใช้ป้ายเดียวกันว่า "เข้าได้"
 * เพราะสิ่งที่ผู้เล่นต้องรู้จาก badge คือกดได้หรือไม่ ความคืบหน้าอยู่ในบรรทัดข้าง ๆ แล้ว
 */
export const STATUS_BADGE: Record<RegionStatus, { label: string; tone: StatusTone }> = {
  town: { label: 'ไม่มีการรบ', tone: 'neutral' },
  locked: { label: 'ล็อก', tone: 'neutral' },
  open: { label: 'เข้าได้', tone: 'info' },
  progress: { label: 'เข้าได้', tone: 'info' },
  done: { label: 'ผ่านแล้ว', tone: 'success' },
};

/**
 * ความยากที่ต้องผ่านก่อนโซนนี้จะปลดล็อก
 * backend: `unlocked = highestFloor >= floorBase - 1` — ชนะความยากนั้นที่โซนไหนก็ได้ (รวมหอคอย)
 */
export function unlockFloor(r: Pick<Region, 'floorBase'>): number {
  return r.floorBase - 1;
}

export function lockedReason(r: RuleFields): string | null {
  if (r.depths <= 0 || r.unlocked) return null;
  return `ต้องผ่านความยาก ${unlockFloor(r)} ก่อน`;
}

export function depthReason(r: RuleFields, depth: number): string | null {
  if (r.depths <= 0 || !r.unlocked) return null;
  if (depth > r.maxDepthAllowed) return `ตอนนี้เข้าได้ถึงรอบที่ ${r.maxDepthAllowed}`;
  return null;
}

/** เหตุผลที่ปุ่ม "เข้าโซน" กดไม่ได้ตอนนี้ (null = กดได้) — ล็อกทั้งโซนมาก่อนรอบเกิน */
export function enterBlockReason(r: RuleFields, depth: number): string | null {
  if (r.depths <= 0) return 'ที่นี่ไม่มีการรบ';
  return lockedReason(r) ?? depthReason(r, depth);
}

/**
 * รอบที่เลือกไว้ให้ตอนเปิดการ์ด — รอบลึกสุดที่เข้าได้
 * คนที่เคลียร์ 3 รอบแล้วแทบไม่เคยอยากกลับไปรอบ 1 (เหตุผลเดียวกับของเดิม)
 */
export function defaultDepth(r: Pick<Region, 'depths' | 'maxDepthAllowed'>): number {
  return Math.min(Math.max(1, r.depths), Math.max(1, r.maxDepthAllowed));
}

export function floorOfDepth(r: Pick<Region, 'floorBase'>, depth: number): number {
  return r.floorBase + depth - 1;
}

/** บรรทัดความคืบหน้าในรายการโซน — เป็นตัวหนังสือเสมอ เพราะสีกับรูปทรงบนแผนที่เล็กเกินกว่าจะพึ่งได้คนเดียว */
export function progressText(r: ProgressFields & Pick<Region, 'floorBase'>): string {
  const status = regionStatus(r);
  if (status === 'town') return 'เมือง ไม่มีการรบ';
  if (status === 'locked') return lockedReason({ ...r, maxDepthAllowed: 0 }) ?? '';
  return `ผ่านแล้ว ${r.depthCleared}/${r.depths} รอบ`;
}

/** ชื่อที่ screen reader อ่านเมื่อโฟกัสจุดบนแผนที่ — ชื่อโซน + สถานะ + คนในโซน (ของบนภาพเป็น aria-hidden หมด) */
export function hotspotLabel(r: Region): string {
  const status = regionStatus(r);
  const parts = [r.nameTh];
  if (status === 'town') parts.push('เมือง ไม่มีการรบ');
  else if (status === 'locked') parts.push(`ล็อก ${lockedReason(r) ?? ''}`.trim());
  else if (status === 'done') parts.push(`ผ่านแล้วครบ ${r.depths} รอบ`);
  else parts.push(`เข้าได้ ผ่านแล้ว ${r.depthCleared} จาก ${r.depths} รอบ`);
  if (r.playersHere > 0) parts.push(`มีผู้เล่นอยู่ ${r.playersHere} คน`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- ตำแหน่งบนภาพ

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
const percent = (v: number) => `${(clamp01(v) * 100).toFixed(2)}%`;

/**
 * hotspot เป็นสัดส่วนของภาพ (0..1) ไม่ใช่พิกเซล — แปลงเป็น % ของกรอบที่ตรึงอัตราส่วนเท่าภาพ
 * จุดจึงอยู่บนตำแหน่งเดิมของภาพทุกความกว้างจอ · ค่าหลุดช่วงถูกหนีบไว้ในกรอบ ไม่ให้ปุ่มหลุดออกไปกดไม่ได้
 */
export function hotspotPosition(h: Region['hotspot']): { left: string; top: string } {
  return { left: percent(h.x), top: percent(h.y) };
}

/**
 * ขนาดวง "ยกผืนดิน" ของโซนที่ชี้อยู่ — r เป็นสัดส่วนของความกว้างภาพ (รัศมี) วงจึงกว้าง 2r
 * แล้วขยายเผื่อขอบที่ฟุ้งหายอีกเท่าครึ่ง · มีพื้นขั้นต่ำเพราะโซนเล็กสุด (หอคอย r=0.045)
 * บนมือถือจะเหลือวงจิ๋วจนไม่รู้สึกว่ามีอะไรถูกยกขึ้น
 */
export function liftWidth(h: Region['hotspot']): string {
  const r = Number.isFinite(h.r) ? Math.max(0, h.r) : 0;
  return `max(${(r * 300).toFixed(1)}%, 88px)`;
}

// ---------------------------------------------------------------- นับถอยหลังของรอบ

/** เวลาที่เหลือก่อนรอบหมดอายุ (ms) · ไม่ติดลบ · expiresAt อ่านไม่ออก = ถือว่าหมดแล้ว */
export function remainingMs(expiresAt: string, now: number): number {
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - now);
}

/** 4:05 — ปัดวินาทีขึ้น จอจึงไม่ขึ้น 0:00 ทั้งที่ยังเหลือเวลาอีกเสี้ยววินาที */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** แบบที่ screen reader อ่านรู้เรื่อง — "4 นาที 5 วินาที" แทน "สี่ ทวิภาค ศูนย์ห้า" */
export function spokenCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} วินาที`;
  return s === 0 ? `${m} นาที` : `${m} นาที ${s} วินาที`;
}

/**
 * นาฬิกาเครื่องผู้เล่นเชื่อได้พอจะนับถอยหลังเองไหม — ตอนเพิ่งได้รอบมา มันต้องยังไม่หมดอายุ
 *
 * expiresAt เป็นเวลาของเซิร์ฟเวอร์ ถ้านาฬิกาเครื่องเดินเร็วกว่าเกินอายุรอบ (5 นาที)
 * การนับเองจะบอกว่า "หมดแล้ว" ตั้งแต่วินาทีแรกทั้งที่รอบยังใช้ได้ — กรณีนั้นไม่นับเอง
 * ปล่อยให้เซิร์ฟเวอร์เป็นคนตัดสินตอนกดเริ่มรบ (409 → modal เดียวกัน)
 */
export function clockTrusted(expiresAt: string, receivedAt: number): boolean {
  return remainingMs(expiresAt, receivedAt) > 0;
}

// ---------------------------------------------------------------- ข้อความของ ErrorState

/**
 * ข้อความใต้หัว ErrorState — INTERNAL_ERROR ใช้ข้อความมาตรฐานของ ErrorState (ข้อ 9.3: บอกทางไปต่อ
 * "แจ้งผู้ดูแลระบบ") แทนข้อความจาก backend ซึ่งซ้ำกับหัวข้อ · code อื่น (เช่นเน็ตหลุด) ข้อความของมันบอกสาเหตุจริง
 */
export function errorStateMessage(e: { code: string; message: string }): string | undefined {
  return e.code === 'INTERNAL_ERROR' ? undefined : e.message;
}
