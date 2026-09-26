/**
 * ข้อความอธิบายสกิลต้องพูดตรงกับตัวรบ (playtest รอบ A ข้อ 5)
 * ไม่เทียบกับตัวอักษรทั้งประโยค — เทียบ "คำกล่าวอ้าง" แต่ละข้อกับผลการรบจริง
 */
import { describe, expect, it } from 'vitest';
import {
  buildDerivedStats, describeSkill, describeSkillById, gamedata, runBattle,
  BASIC_ATTACK_TEXT_TH, MP_RULES_TEXT_TH,
} from '../src/index';
import type { ClassId, Combatant, CombatEvent } from '../src/types';

const PLAYER_SKILLS = gamedata.skills.filter((s) => s.classId !== 'monster');

function hero(classId: ClassId, source: string): Combatant {
  const b = gamedata.classes[classId].baseStats;
  const stats = { str: b.str * 3, int: b.int * 3, vit: b.vit * 3, agi: b.agi, luk: b.luk };
  const level = 12;
  return {
    id: 'p1', name: 'ฮีโร่', side: 'party', classId, level, stats,
    derived: buildDerivedStats(classId, level, stats, []),
    skills: gamedata.skills.filter((s) => s.classId === classId).map((s) => s.id),
    rules: [],
    ...({ programSource: source } as object),
  } as Combatant;
}

/** รบหลายรอบแล้วเก็บ event ของผู้เล่นที่ใช้สกิลนี้ */
function castsOf(classId: ClassId, codeName: string, skillId: string, target: string): CombatEvent[] {
  const src = `def turn():\n    cast("${codeName}", ${target})\n`;
  const out: CombatEvent[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    for (const e of runBattle([hero(classId, src)], 3, seed).events) {
      if (e.actorId === 'p1' && e.skillId === skillId) out.push(e);
    }
  }
  return out;
}

describe('describeSkill', () => {
  it('สกิลของอาชีพทุกตัวมีคำอธิบาย และตัวเลขมาจาก power ของสกิลเอง', () => {
    for (const s of PLAYER_SKILLS) {
      expect(s.descTh, s.id).toBeTruthy();
      const t = describeSkill(s);
      expect(t.kindTh, s.id).not.toBe('');
      if (s.kind !== 'taunt') expect(t.effectTh, s.id).toContain(`${s.power}%`);
      expect(describeSkillById(s.id)).toEqual(t);
    }
  });

  it('ปิดฉากไม่อ้างว่าแรงขึ้นกับศัตรูเลือดน้อย (engine ไม่มีกติกานี้)', () => {
    const t = describeSkillById('w_execute')!;
    expect(`${t.effectTh} ${t.descTh}`).not.toMatch(/เลือด(เหลือ)?น้อย/);
  });

  it('"หลบไม่ได้" จริง: เวทและท่าวงกว้างไม่เคยมีผลหลบในการรบจริง', () => {
    const checks: [ClassId, string, string, string][] = [
      ['mage', 'firebolt', 'm_firebolt', 'weakest(enemies)'],
      ['mage', 'blizzard', 'm_blizzard', 'enemies'],
      ['warrior', 'whirlwind', 'w_whirlwind', 'enemies'],
    ];
    for (const [cls, code, id, target] of checks) {
      expect(describeSkillById(id)!.targetTh).toContain('หลบไม่ได้');
      const evs = castsOf(cls, code, id, target);
      expect(evs.length, id).toBeGreaterThan(20);
      expect(evs.flatMap((e) => e.targets).some((t) => t.evaded), id).toBe(false);
    }
  });

  it('ฮีลและโล่ได้ตัวเลขตามที่ข้อความบอก (% ของเลือดสูงสุด)', () => {
    const mage = hero('mage', '');
    const heal = gamedata.skills.find((s) => s.id === 'm_heal')!;
    const full = Math.round(mage.derived.maxHp * (heal.power / 100));
    const heals = castsOf('mage', 'heal', 'm_heal', 'me').flatMap((e) => e.targets);
    expect(heals.length).toBeGreaterThan(20);
    // ฮีลเต็มจำนวนเสมอ ยกเว้นตอนเลือดใกล้เต็ม (ฮีลเกินหลอดไม่ได้)
    for (const t of heals) {
      expect(t.heal!).toBeLessThanOrEqual(full);
      if (t.hpAfter < mage.derived.maxHp) expect(t.heal).toBe(full);
    }

    const guardian = hero('guardian', '');
    const barrier = gamedata.skills.find((s) => s.id === 'g_barrier')!;
    const shields = castsOf('guardian', 'barrier', 'g_barrier', 'me').flatMap((e) => e.targets);
    expect(shields.length).toBeGreaterThan(20);
    for (const t of shields) expect(t.shield).toBe(Math.round(guardian.derived.maxHp * (barrier.power / 100)));
  });

  it('ข้อความกติกา MP และตีธรรมดาใช้ตัวเลขของตัวรบ', () => {
    expect(MP_RULES_TEXT_TH).toBe('MP ฟื้นเอง 5% ของหลอดทุกเทิร์น · +3 เมื่อตีธรรมดา · +15% ตอนเคลียร์เวฟ');
    expect(BASIC_ATTACK_TEXT_TH).toContain('100% ของ ATK');
  });
});
