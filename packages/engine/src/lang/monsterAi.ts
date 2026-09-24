/**
 * AI ของมอนสเตอร์ = โปรแกรม BloxCode ใน gamedata.json (`monsterPrograms`)
 * ปรับพฤติกรรมมอนได้โดยไม่แตะโค้ด และผู้เล่นเปิดดูได้ในรอบ 2B-3
 *
 * เลือกโปรแกรมจาก role ของ archetype (fodder / dps / bruiser / caster / tank)
 * ถ้าไม่เจอ role ใช้ 'default'
 */
import { gamedata } from '../data';
import type { Program } from './spec';
import { parse } from './parser';

export const DEFAULT_MONSTER_PROGRAM_KEY = 'default';

const cache = new Map<string, Program | null>();

function compile(key: string): Program | null {
  if (cache.has(key)) return cache.get(key)!;
  const source = gamedata.monsterPrograms?.[key];
  let program: Program | null = null;
  if (source) {
    const res = parse(source);
    if (!res.program) {
      // ข้อมูลผิดเป็นบั๊กของ gamedata ไม่ใช่ของผู้เล่น — ดังให้รู้ตอนเทส
      throw new Error(
        `monsterPrograms.${key} แปลไม่ผ่าน: ${res.errors[0]?.name} ${res.errors[0]?.messageTh}`,
      );
    }
    program = res.program;
  }
  cache.set(key, program);
  return program;
}

const roleByMonsterId = new Map<string, string>(
  gamedata.monsterArchetypes.map((a) => [a.id, a.role]),
);

/** โปรแกรมของมอนตัวนี้ (undefined = ไม่มีข้อมูลเลย ให้ battle ถอยไปใช้ rules) */
export function monsterProgramFor(monsterId?: string): Program | undefined {
  const role = monsterId ? roleByMonsterId.get(monsterId) : undefined;
  return (role ? compile(role) : null) ?? compile(DEFAULT_MONSTER_PROGRAM_KEY) ?? undefined;
}

/** ล้างแคช — ใช้ในเทสเวลาสลับ gamedata */
export function clearMonsterProgramCache(): void {
  cache.clear();
}
