/**
 * ชื่อสกิลใน BloxCode ⟷ skill id ใน gamedata
 *
 * ผู้เล่นเขียน `cast("heal", me)` ไม่ใช่ `cast("m_heal", me)` — ชื่อสั้นอ่านง่ายกว่า
 * และไม่ผูกกับ prefix ของอาชีพ (ซึ่งเป็นรายละเอียดภายใน)
 *
 * นามแฝงที่ยอมรับของสกิลหนึ่งตัว:
 *   1. id เต็ม            m_heal
 *   2. id ตัดคำนำหน้า      heal          (w_ / m_ / g_ / mon_)
 *   3. ชื่ออังกฤษ           power_strike  (จาก field name แปลงเป็นตัวพิมพ์เล็ก + _)
 */
import { gamedata } from '../data';
import type { SkillDef } from '../types';

export interface SkillInfo {
  id: string;
  aoe: boolean;
  mpCost: number;
  kind: SkillDef['kind'];
  /**
   * สกิลนี้เป็นของอาชีพไหน และปลดที่เลเวลเท่าไร (เพิ่มรอบ 2F §3.4)
   * มีไว้ให้ข้อความผิดพลาดพูดความจริงได้ — ของเดิมบอกทุกคนว่า "อัพเลเวลแล้วจะได้"
   * ซึ่งเป็นเท็จกับสกิลของอาชีพอื่น (นักรบอัพเลเวลไปเท่าไรก็ไม่มีวันได้ heal)
   */
  classId: SkillDef['classId'];
  unlockLevel: number;
}

function aliasesOf(s: SkillDef): string[] {
  const out = [s.id];
  const underscore = s.id.indexOf('_');
  if (underscore > 0) out.push(s.id.slice(underscore + 1));
  const fromName = s.name.trim().toLowerCase().replace(/\s+/g, '_');
  if (fromName) out.push(fromName);
  return out;
}

const aliasMap = new Map<string, SkillInfo>();
const ambiguous = new Set<string>();

for (const s of gamedata.skills) {
  const info: SkillInfo = {
    id: s.id, aoe: s.aoe, mpCost: s.mpCost, kind: s.kind,
    classId: s.classId, unlockLevel: s.unlockLevel,
  };
  for (const a of aliasesOf(s)) {
    const prev = aliasMap.get(a);
    if (prev && prev.id !== s.id) {
      // ชนกัน → ยอมรับเฉพาะรูป id เต็มเท่านั้น
      ambiguous.add(a);
      continue;
    }
    aliasMap.set(a, info);
  }
}
for (const a of ambiguous) if (!gamedata.skills.some((s) => s.id === a)) aliasMap.delete(a);

/** ชื่อทั้งหมดที่เขียนใน cast() ได้ — ใช้เดาคำที่พิมพ์ผิดด้วย */
export const KNOWN_SKILL_NAMES: string[] = [...aliasMap.keys()].sort();

export function resolveSkillName(name: string): SkillInfo | undefined {
  return aliasMap.get(name);
}

/** ชื่อสั้นที่ควรใช้เขียนในโค้ด (สำหรับ printer / fromRules) */
export function preferredSkillName(skillId: string): string {
  const underscore = skillId.indexOf('_');
  const short = underscore > 0 ? skillId.slice(underscore + 1) : skillId;
  const back = aliasMap.get(short);
  return back && back.id === skillId ? short : skillId;
}
