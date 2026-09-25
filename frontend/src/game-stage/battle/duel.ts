/**
 * อ่านสองฝั่งของการดวลออกจาก event log (ย้ายจาก client/src/pages/DuelScreen.tsx)
 * แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้หน้าเพจเรียกได้โดยไม่ต้องโหลดตัวเรนเดอร์ และทดสอบได้
 */
import type { CombatEvent, DuelBlock } from '@/lib/api/types';
import type { DuelSides } from './director';

/** id ของคนชื่อนี้ใน event log (actor หรือ target ก็ได้) */
export function idOfName(events: CombatEvent[], name: string): string | null {
  for (const ev of events) {
    if (ev.actorName === name && ev.actorId !== 'system') return ev.actorId;
    for (const t of ev.targets) if (t.name === name) return t.id;
  }
  return null;
}

/**
 * เลือดเต็มของคนคนนี้ในสนามดวล — **อ่านจาก event log ไม่ใช่จากสเตตัสตัวละคร**
 *
 * `runDuel` ขยายเลือดทั้งสองฝ่ายด้วย `balance.duelHpMult` ก่อนเริ่ม ตัวเลขใน
 * หน้าตัวละครจึงไม่ใช่เลือดที่ใช้จริง และตัวคูณนั้นอยู่ฝั่ง engine ที่หน้าเว็บไม่ได้รับมา
 * — การคูณเองที่นี่จะเป็นสูตรก๊อปที่เพี้ยนวันที่ปรับค่า
 *
 * `hpAfter + damage` ของเป้าหมายคือเลือด "ก่อนโดน" ครั้งนั้น และเลือดมีแต่ลดลง
 * (ฮีลตันที่เลือดเต็ม) ค่าสูงสุดที่เคยเห็นจึงเป็นเลือดเต็มเสมอ ไม่มีทางเกิน
 */
export function maxHpFromLog(events: CombatEvent[], id: string, fallback: number): number {
  let best = 0;
  for (const ev of events) {
    for (const t of ev.targets) {
      if (t.id !== id) continue;
      best = Math.max(best, t.hpAfter + (t.damage ?? 0));
    }
  }
  // ไม่เคยถูกแตะเลยตลอดการดวล (ชนะขาดใน 1-2 เทิร์น) → ไม่มีอะไรให้อ่าน ใช้ค่าสำรอง
  return best > 0 ? best : fallback;
}

/** null = อ่าน log ไม่ออก (ไม่พบตัวละครทั้งสองฝั่ง) — หน้าเพจต้องบอกตรง ๆ แล้วข้ามการเล่นฉาก */
export function duelSides(duel: DuelBlock, selfName: string, selfMaxHpFallback: number): DuelSides | null {
  const selfId = idOfName(duel.events, selfName);
  const opponentId = idOfName(duel.events, duel.opponent.displayName);
  if (!selfId || !opponentId || selfId === opponentId) return null;
  return {
    selfId,
    selfMaxHp: maxHpFromLog(duel.events, selfId, selfMaxHpFallback),
    opponentId,
    opponentName: duel.opponent.displayName,
    opponentClassId: duel.opponent.classId,
    opponentMaxHp: maxHpFromLog(duel.events, opponentId, selfMaxHpFallback),
  };
}
