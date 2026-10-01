/**
 * playtest รอบ B (26 ก.ย. 2026) — สัญญาที่ต้องไม่หลุด
 *   1. EXP ของมอนเลเวลต่ำถูกลดตามตาราง (earlyExpMult) และมอนตั้งแต่ earlyExpFullLevel จ่ายเต็มเหมือนเดิม
 *      ตัวคูณไม่แตะ rng: การรบเดียวกันได้เหตุการณ์เดิมทุกไบต์ ต่างแค่ EXP
 *   2. ป่าเริ่มต้น: หมาป่าง้างหมายหัวเฉพาะรอบ 3-4 · รอบ 1-2 เหมือนไม่มีกลไก · ท่าทุบใช้พลังของโซน
 *      และการ defend() ตอนถูกหมายหัวต้องคุ้มจริง
 */
import { describe, expect, it } from 'vitest';
import {
  buildDerivedStats, buildRegionWaves, enterRegion, gamedata, hashSeed, mulberry32, runBattle, simulateWaves,
} from '../src/index';
import type { Combatant } from '../src/types';

const FOREST = gamedata.regions.find((r) => r.id === 'greenwood')!;

function hero(level: number, src: string): Combatant {
  const base = gamedata.classes.warrior.baseStats;
  const pts = (level - 1) * 5;
  const stats = { ...base, str: base.str + Math.ceil(pts * 0.6), vit: base.vit + Math.floor(pts * 0.4) };
  return {
    id: 'p1', name: 'ทดสอบ', side: 'party', classId: 'warrior', level, stats,
    derived: buildDerivedStats('warrior', level, stats, []),
    skills: [], rules: [], programSource: src,
  } as Combatant;
}
const ATTACK = 'def turn():\n    attack(weakest(enemies))\n';
const READ = 'def turn():\n    if has_debuff("marked"):\n        defend()\n    else:\n        attack(weakest(enemies))\n';
const stripExp = (r: object) => JSON.stringify(r, (k, v) => (k === 'expGained' ? undefined : v));

/** รบซ้ำด้วย balance ที่ไม่ลด EXP แล้วคืนค่าเดิม */
function withoutEarlyExp<T>(fn: () => T): T {
  const b = gamedata.balance;
  const saved = [b.earlyExpMult, b.earlyExpFullLevel] as const;
  b.earlyExpMult = undefined;
  b.earlyExpFullLevel = undefined;
  try {
    return fn();
  } finally {
    [b.earlyExpMult, b.earlyExpFullLevel] = saved;
  }
}

describe('รอบ B — EXP ของเนื้อหาช่วงต้น', () => {
  it('ตั้งค่าไว้ใน gamedata: เริ่ม 0.25 ที่มอนเลเวล 2 เต็มที่มอนเลเวล 12', () => {
    expect(gamedata.balance.earlyExpMult).toBe(0.25);
    expect(gamedata.balance.earlyExpFullLevel).toBe(12);
  });

  it('ชั้น 1 ได้ EXP หนึ่งในสี่ของเดิม · เหตุการณ์ของการรบเหมือนเดิมทุกไบต์', () => {
    for (const seed of [1, 424242, 7]) {
      const now = runBattle([hero(3, ATTACK)], 1, seed);
      const before = withoutEarlyExp(() => runBattle([hero(3, ATTACK)], 1, seed));
      expect(stripExp(now)).toBe(stripExp(before));
      expect(before.expGained).toBeGreaterThan(0);
      expect(now.expGained).toBe(Math.round(before.expGained * 0.25));
    }
  });

  it('ชั้นกลางได้น้อยลงบ้าง · ตั้งแต่ชั้น 6 (มอนเลเวล 12) ได้เต็มเหมือนเดิม', () => {
    const ratio = (floor: number) => {
      const now = runBattle([hero(16, ATTACK)], floor, 11);
      const before = withoutEarlyExp(() => runBattle([hero(16, ATTACK)], floor, 11));
      return now.expGained / before.expGained;
    };
    const f3 = ratio(3);
    expect(f3).toBeGreaterThan(0.25);
    expect(f3).toBeLessThan(1);
    expect(ratio(6)).toBe(1);
    expect(ratio(9)).toBe(1);
  });
});

describe('รอบ B — ป่าเริ่มต้นให้ defend() มีที่ใช้', () => {
  const windupOf = (c: Combatant) => (c as Combatant & { windupEvery?: number; windupPower?: number });

  it('หมาป่าติดกลไกเฉพาะรอบ 3-4 พร้อมพลังทุบของโซน · รอบ 1-2 ไม่มีใครติด', () => {
    expect(FOREST.mechanic).toMatchObject({ kind: 'windup', archetypes: ['wolf'], minDepth: 3 });
    let wolves = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const depth of [1, 2, 3, 4]) {
        for (const w of buildRegionWaves('greenwood', depth, 1, seed)) {
          for (const m of w.monsters) {
            const c = windupOf(m);
            if (depth >= 3 && m.monsterId === 'wolf') {
              wolves++;
              expect(c.windupEvery).toBe(FOREST.mechanic!.every);
              expect(c.windupPower).toBe(FOREST.mechanic!.crushPower);
            } else {
              expect(c.windupEvery).toBeUndefined();
              expect(c.windupPower).toBeUndefined();
            }
          }
        }
      }
    }
    expect(wolves).toBeGreaterThan(20);
  });

  it('ดินแดนน้ำแข็งยังใช้พลังทุบของสกิลเดิม (ไม่มี windupPower)', () => {
    for (const w of buildRegionWaves('frostland', 3, 1, 5)) {
      for (const m of w.monsters) expect(windupOf(m).windupPower).toBeUndefined();
    }
  });

  it('รอบ 3: defend() ตอนถูกหมายหัวรอดดีกว่าตีอย่างเดียวชัดเจน', () => {
    let attackWins = 0, readWins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const [src, add] of [[ATTACK, () => attackWins++], [READ, () => readWins++]] as const) {
        const entry = enterRegion('greenwood', 3, 1, seed);
        const rng = mulberry32(hashSeed(seed, entry.floor * 977, 1, 0xba771e));
        if (simulateWaves([hero(5, src)], entry.waves, { floor: entry.floor, seed, rng }).victory) add();
      }
    }
    expect(readWins).toBeGreaterThan(attackWins + 10);
  });
});
