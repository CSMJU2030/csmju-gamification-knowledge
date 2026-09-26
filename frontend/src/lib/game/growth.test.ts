import { describe, expect, it } from 'vitest';
import type { BattleOutcome, Character } from '@/lib/api/types';
import { growthNumber, growthSummary } from './growth';

const base = {
  level: 3,
  exp: 10,
  expToNext: 144,
  stats: { str: 12, int: 4, vit: 8, agi: 5, luk: 5 },
  derived: { maxHp: 176, maxMp: 46, atk: 29, matk: 15, def: 8, mdef: 6, speed: 17.5, critRate: 0.07, critDmg: 1.5, evasion: 0.01, dropBonus: 0.025 },
} as unknown as Character;

function outcome(after: Partial<Character>, extra: Partial<BattleOutcome> = {}): BattleOutcome {
  return {
    result: { victory: true, wavesCleared: 10 },
    character: { ...base, ...after },
    attempt: { attemptNo: 1, firstAttempt: true, previous: null },
    ...extra,
  } as unknown as BattleOutcome;
}

describe('growthSummary', () => {
  it('เลเวลอัพ: บอกก่อน → หลัง เฉพาะค่าที่เปลี่ยน ทั้งสเตตัสและค่าที่ใช้รบ', () => {
    const g = growthSummary(
      base,
      outcome({
        level: 5,
        stats: { str: 19, int: 4, vit: 9, agi: 6, luk: 6 },
        derived: { ...base.derived, maxHp: 208, atk: 43, def: 9, speed: 19 },
      }),
    );
    expect([g.levelFrom, g.levelTo]).toEqual([3, 5]);
    expect(g.stats.map((l) => [l.label, l.before, l.after])).toEqual([
      ['พลังกาย (STR)', 12, 19],
      ['ความอึด (VIT)', 8, 9],
      ['ความคล่อง (AGI)', 5, 6],
      ['โชค (LUK)', 5, 6],
    ]);
    expect(g.derived.map((l) => l.label)).toEqual(['เลือดสูงสุด', 'ATK', 'DEF', 'ความเร็ว']);
    expect(g.comparison).toEqual({ kind: 'first' });
  });

  it('ไม่เลเวลอัพ: บอก EXP ที่ยังขาด', () => {
    const g = growthSummary(base, outcome({ exp: 100 }));
    expect(g.stats).toEqual([]);
    expect(g.expToLevel).toBe(44);
  });

  it('เทียบกับครั้งก่อน: ชนะหลังแพ้ = ดีขึ้น · เวฟน้อยลง = แย่ลง · เท่ากัน = เท่าเดิม', () => {
    const prev = (victory: boolean, wavesCleared: number) => ({
      attempt: { attemptNo: 2, firstAttempt: false, previous: { victory, wavesCleared, createdAt: '2026-09-26T00:00:00.000Z' } },
    });
    expect(growthSummary(base, outcome({}, prev(false, 6))).comparison.kind).toBe('better');
    const lost = { result: { victory: false, wavesCleared: 4 } } as Partial<BattleOutcome>;
    expect(growthSummary(base, outcome({}, { ...lost, ...prev(false, 6) })).comparison.kind).toBe('worse');
    expect(growthSummary(base, outcome({}, { ...lost, ...prev(false, 4) })).comparison.kind).toBe('same');
    expect(growthSummary(base, outcome({}, { ...lost, ...prev(true, 10) })).comparison).toEqual({
      kind: 'worse',
      prevVictory: true,
      prevWaves: 10,
    });
  });

  it('เลขทศนิยม (ความเร็ว) แสดงหนึ่งตำแหน่ง', () => {
    expect(growthNumber(17.5)).toBe('17.5');
    expect(growthNumber(208)).toBe('208');
  });
});
