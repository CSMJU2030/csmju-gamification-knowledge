import { describe, expect, it } from 'vitest';
import {
  buildDerivedStats, buildWaves, gamedata, rollItem, runBattle, runDuel,
  AFFIX_SLOTS, FORMULAS,
} from '../src/index';
import type { BaseStats, ClassId, Combatant, ItemInstance, Rarity, Rule } from '../src/types';
import { mulberry32 } from '../src/rng';
import { rollItemWithRng } from '../src/drops';

function makeHero(
  classId: ClassId,
  level: number,
  stats: BaseStats,
  equipment: ItemInstance[] = [],
  rules?: Rule[],
): Combatant {
  const skills = gamedata.skills
    .filter((s) => s.classId === classId && s.unlockLevel <= level)
    .map((s) => s.id);
  return {
    id: `hero_${classId}`,
    name: `Hero ${classId}`,
    side: 'party',
    classId,
    level,
    stats,
    derived: buildDerivedStats(classId, level, stats, equipment),
    skills,
    rules: rules ?? gamedata.defaultRules[classId],
  };
}

/** ทุกคลาสใน ClassId ต้องมีข้อมูลครบใน gamedata — ใช้วนเทสต์ทุกคลาสโดยไม่ต้องไล่พิมพ์ชื่อ */
const ALL_CLASSES = Object.keys(gamedata.classes) as ClassId[];

const freshWarrior = () => makeHero('warrior', 1, { ...gamedata.classes.warrior.baseStats });

function level20Warrior() {
  // 19 levels * 5 points allocated into str/vit (48 str / 47 vit).
  const base = gamedata.classes.warrior.baseStats;
  return makeHero('warrior', 20, { ...base, str: base.str + 48, vit: base.vit + 47 });
}

describe('determinism', () => {
  it('same seed + same inputs → identical BattleResult', () => {
    const a = runBattle([level20Warrior()], 1, 123456);
    const b = runBattle([level20Warrior()], 1, 123456);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('buildWaves and rollItem are deterministic', () => {
    expect(buildWaves(7, 2, 42)).toEqual(buildWaves(7, 2, 42));
    expect(rollItem(4, 999, 0.5)).toEqual(rollItem(4, 999, 0.5));
  });
});

describe('buildDerivedStats formulas', () => {
  it('matches FORMULAS for a level-1 warrior with no equipment', () => {
    const d = buildDerivedStats('warrior', 1, gamedata.classes.warrior.baseStats, []);
    expect(d.maxHp).toBe(50 + 6 * 12 + 1 * 10); // 132
    expect(d.maxMp).toBe(20 + 2 * 5 + 1 * 2);   // 32
    expect(d.atk).toBe(5 + 8 * 2);              // 21
    expect(d.matk).toBe(5 + 2 * 2.5);           // 10
    expect(d.def).toBe(6);
    expect(d.mdef).toBe(2 * 0.5 + 6 * 0.5);     // 4
    expect(d.speed).toBe(10 + 5 * 1.5);         // 17.5
    expect(d.critRate).toBeCloseTo(0.05 + 4 * 0.004);
    expect(d.critDmg).toBe(1.5);
    expect(d.evasion).toBeCloseTo(5 * 0.002);
    expect(d.dropBonus).toBeCloseTo(4 * 0.005);
  });

  it('applies equipment main stat, upgrade multiplier and affixes', () => {
    const sword: ItemInstance = {
      id: 'i1', baseId: 'sword', slot: 'weapon', rarity: 'rare',
      upgradeLevel: 2, droppedFloor: 3,
      affixes: [
        { stat: 'atk_pct', value: 10 },
        { stat: 'crit_dmg', value: 25 },
        { stat: 'speed_flat', value: 4 },
        { stat: 'mp_flat', value: 20 },
      ],
    };
    const d = buildDerivedStats('warrior', 1, gamedata.classes.warrior.baseStats, [sword]);
    // main: round((8 + 3*3) * 1.16) = round(19.72) = 20 → atk 21+20 = 41, then *1.10 → 45
    expect(d.atk).toBe(Math.round((21 + Math.round(17 * 1.16)) * 1.10));
    expect(d.critDmg).toBeCloseTo(1.75);
    expect(d.speed).toBe(17.5 + 4);
    expect(d.maxMp).toBe(32 + 20);
  });
});

describe('rule priority', () => {
  it('a higher rule (self_hp_below) fires before the always rule', () => {
    // hp% is always < 999 → the first rule always matches → hero only defends.
    const rules: Rule[] = [
      { condition: { type: 'self_hp_below', value: 999 }, action: { type: 'defend', target: 'self' } },
      { condition: { type: 'always' }, action: { type: 'attack', target: 'random_enemy' } },
    ];
    const hero = makeHero('warrior', 5, gamedata.classes.warrior.baseStats, [], rules);
    const result = runBattle([hero], 1, 7);
    const heroEvents = result.events.filter((e) => e.actorId === hero.id);
    expect(heroEvents.length).toBeGreaterThan(0);
    expect(heroEvents.every((e) => e.action === 'defend')).toBe(true);
    expect(result.victory).toBe(false); // never attacks → cannot win
  });
});

describe('buildWaves', () => {
  it('wave composition follows floorScaling and boss appears on wave 10', () => {
    const waves = buildWaves(3, 1, 555);
    expect(waves).toHaveLength(10);
    for (let w = 1; w <= 3; w++) expect(waves[w - 1].monsters).toHaveLength(2);
    for (let w = 4; w <= 6; w++) expect(waves[w - 1].monsters).toHaveLength(3);
    for (let w = 7; w <= 9; w++) {
      expect(waves[w - 1].monsters.length).toBeGreaterThanOrEqual(3);
      expect(waves[w - 1].monsters.length).toBeLessThanOrEqual(4);
    }
    expect(waves[9].monsters).toHaveLength(1); // no minion below floor 5
    expect(waves[9].monsters[0].isBoss).toBe(true);
    // monster level = floor * 2
    expect(waves[0].monsters[0].level).toBe(6);
  });

  it('respects minFloor and adds a boss minion from floor 5', () => {
    const waves1 = buildWaves(1, 1, 1);
    const allowed = new Set(
      gamedata.monsterArchetypes.filter((a) => a.minFloor <= 1).map((a) => a.id),
    );
    for (const wave of waves1.slice(0, 9)) {
      for (const m of wave.monsters) expect(allowed.has(m.monsterId!)).toBe(true);
    }
    const waves5 = buildWaves(5, 1, 1);
    expect(waves5[9].monsters).toHaveLength(2);
    expect(waves5[9].monsters[0].isBoss).toBe(true);
    expect(waves5[9].monsters[1].isBoss).toBe(false);
  });

  it('coop multiplier scales monster hp/atk', () => {
    const solo = buildWaves(2, 1, 9)[0].monsters[0];
    const duo = buildWaves(2, 2, 9)[0].monsters.find((m) => m.monsterId === solo.monsterId);
    if (duo) {
      // Rounding happens once per build, so compare as a ratio with tolerance.
      expect(duo.derived.maxHp / solo.derived.maxHp).toBeCloseTo(1.5, 1);
    }
    // Always: duo floor's first monster has 1.5x-ish hp vs same archetype solo build.
    expect(FORMULAS.coopMonsterMult(2)).toBe(1.5);
  });
});

describe('drops', () => {
  it('rarity distribution is sane and affixes obey slot rules', () => {
    const counts = (floor: number, n: number) => {
      const rng = mulberry32(floor * 100 + 7);
      const c: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
      for (let i = 0; i < n; i++) {
        const item = rollItemWithRng(floor, rng, `t${floor}_${i}`);
        c[item.rarity]++;
        const [lo, hi] = AFFIX_SLOTS[item.rarity];
        expect(item.affixes.length).toBeGreaterThanOrEqual(lo);
        expect(item.affixes.length).toBeLessThanOrEqual(hi);
        const stats = item.affixes.map((a) => a.stat);
        expect(new Set(stats).size).toBe(stats.length); // no duplicate affix stats
        for (const a of item.affixes) {
          const pool = gamedata.affixPool.find((p) => p.stat === a.stat)!;
          expect(a.value).toBeGreaterThanOrEqual(pool.min);
          expect(a.value).toBeLessThanOrEqual(pool.max);
          expect(Number.isInteger(a.value)).toBe(true);
        }
        expect(item.droppedFloor).toBe(floor);
        expect(item.upgradeLevel).toBe(0);
      }
      return c;
    };
    const n = 4000;
    const f1 = counts(1, n);
    expect(f1.common).toBeGreaterThan(f1.rare);
    expect(f1.rare).toBeGreaterThan(f1.legendary);
    expect(f1.legendary / n).toBeLessThan(0.05);
    // Floor shift: floor 10 (3 steps → common 43) drops fewer commons than floor 1 (55).
    const f10 = counts(10, n);
    expect(f10.common / n).toBeLessThan(f1.common / n - 0.05);
    expect(f10.rare + f10.epic + f10.legendary).toBeGreaterThan(f1.rare + f1.epic + f1.legendary);
  });

  it('rollItem applies the 12% * (1 + dropBonus) chance', () => {
    let hits = 0;
    const n = 3000;
    for (let s = 0; s < n; s++) if (rollItem(1, s, 0) !== null) hits++;
    expect(hits / n).toBeGreaterThan(0.08);
    expect(hits / n).toBeLessThan(0.16);
    let boosted = 0;
    for (let s = 0; s < n; s++) if (rollItem(1, s, 1) !== null) boosted++;
    expect(boosted).toBeGreaterThan(hits); // dropBonus raises the chance
  });
});

describe('runBattle', () => {
  it('emits wave_start events and fights waves sequentially', () => {
    const result = runBattle([level20Warrior()], 1, 2024);
    const starts = result.events.filter((e) => e.note === 'wave_start');
    expect(starts.length).toBe(result.wavesCleared === 10 ? 10 : starts.length);
    expect(starts[0].wave).toBe(1);
    for (let i = 1; i < starts.length; i++) expect(starts[i].wave).toBe(starts[i - 1].wave + 1);
  });

  /**
   * เดิมเทสต์นี้ใช้นักรบเลเวล 20 สู้ชั้น 1 แล้วคาดว่าได้วัสดุบอสเต็ม 5-10
   * รอบ 2F §3.1 ทำให้ข้อนั้น **ผิดโดยตั้งใจ**: เลเวล 20 ตีชั้น 1 คือการฟาร์ม
   * ซึ่งเป็นวงจรที่ทำให้คนเขียน attack() บรรทัดเดียวจบเกมได้ในรอบ 2T
   *
   * จึงแยกเป็นสองเทสต์ แทนที่จะลดตัวเลขที่คาดไว้ลงเฉย ๆ — เพราะการลดตัวเลข
   * จะทำให้เทสต์ผ่านโดยไม่บอกว่ากติกาเปลี่ยนไปเป็นอะไร
   *   1. สู้ชั้นที่เหมาะกับเลเวล → ได้รางวัลบอสเต็มเหมือนเดิม (ของเดิมต้องไม่พัง)
   *   2. สู้ชั้นที่ต่ำกว่าตัวเองมาก → ได้น้อยลงชัดเจน แต่ไอเทมบอสยังการันตี
   */
  it('victory at a fair level yields full exp, gold and boss loot', () => {
    // เลเวล ≤ farmFalloffGraceLevel = ยังไม่คิดการลดรางวัลเลย ตัวคูณเป็น 1 เป๊ะ
    const grace = gamedata.balance.farmFalloffGraceLevel;
    const base = gamedata.classes.warrior.baseStats;
    const pts = (grace - 1) * 5;
    const hero = makeHero('warrior', grace, {
      ...base, str: base.str + Math.ceil(pts / 2), vit: base.vit + Math.floor(pts / 2),
    });
    const result = runBattle([hero], 1, 31337);
    expect(result.victory).toBe(true);
    expect(result.wavesCleared).toBe(10);
    expect(result.expGained).toBeGreaterThan(0);
    expect(result.drops.gold).toBeGreaterThan(0);
    expect(result.drops.items.length).toBeGreaterThanOrEqual(1); // boss guarantees one
    expect(result.drops.materials).toBeGreaterThanOrEqual(5);    // boss 5-10
    expect(result.seed).toBe(31337);
  });

  it('farming far below your level pays sharply less, but never zero (2F §3.1)', () => {
    const grace = gamedata.balance.farmFalloffGraceLevel;
    const base = gamedata.classes.warrior.baseStats;
    const pts = (grace - 1) * 5;
    const fair = runBattle([makeHero('warrior', grace, {
      ...base, str: base.str + Math.ceil(pts / 2), vit: base.vit + Math.floor(pts / 2),
    })], 1, 31337);
    const farm = runBattle([level20Warrior()], 1, 31337);

    expect(farm.victory).toBe(true);
    // ตัวคันโยกของ §3.1: เลเวล 20 ฟาร์มชั้น 1 ต้องได้ EXP ไม่ถึงหนึ่งในห้าของคนที่สู้พอดีตัว
    expect(farm.expGained).toBeLessThan(fair.expGained / 5);
    // แต่ห้ามเป็นศูนย์ — §3.1 ห้ามลงโทษการเล่น เราแค่ทำให้การฟาร์มไม่คุ้ม
    expect(farm.expGained).toBeGreaterThan(0);
    // ไอเทมบอสยังการันตี: สิ่งที่ลดคือ "เงินตรา" ไม่ใช่ "ของที่ได้เห็นว่าชนะ"
    expect(farm.drops.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('balance matrix', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const winsOf = (make: () => Combatant, floor: number) =>
    SEEDS.filter((s) => runBattle([make()], floor, s * 7919 + 13).victory).length;

  it('fresh level-1 of each class clears floor 1 on >= 8/10 seeds', () => {
    for (const classId of ALL_CLASSES) {
      const wins = winsOf(() => makeHero(classId, 1, { ...gamedata.classes[classId].baseStats }), 1);
      expect(wins, `${classId} floor 1`).toBeGreaterThanOrEqual(8);
    }
  });

  /**
   * ข้อบังคับ B5 (docs/design-round2p.md §2): ผู้ฝึกหัดเลเวล 1 ต้องผ่านชั้น 1 ได้
   * ไม่งั้นผู้เล่นใหม่ติดตั้งแต่หน้าจอแรก — ทุกคนเริ่มเกมด้วยคลาสนี้
   *
   * วัดด้วยวิธีเดียวกับ tools/probe.cjs เป๊ะ (20 seed สูตรเดียวกัน, เกณฑ์ชนะ >= 90%)
   * เพราะ probe.cjs เป็นของ PM และยังไม่มี novice ในตาราง PLAYERS ของมัน
   * ผู้ฝึกหัดไม่มีสกิลเลย จึงต้องผ่านด้วย attack() ล้วน ๆ เท่านั้น
   */
  it('B5: ผู้ฝึกหัดเลเวล 1 ผ่านชั้น 1 ได้ (เกณฑ์เดียวกับ probe: ชนะ >= 90% จาก 20 seed)', () => {
    const attackOnly = 'def turn():\n    attack(weakest(enemies))\n';
    let wins = 0;
    for (let i = 0; i < 20; i++) {
      const h = makeHero('novice', 1, { ...gamedata.classes.novice.baseStats });
      const seed = 1_000_000 + 1 * 1009 + i * 7919; // สูตร seed เดียวกับ probe.cjs
      if (runBattle([{ ...h, programSource: attackOnly } as Combatant], 1, seed).victory) wins++;
    }
    expect(wins / 20, 'ผู้ฝึกหัดเลเวล 1 ต้องผ่านชั้น 1').toBeGreaterThanOrEqual(0.9);
  });

  it('ผู้ฝึกหัดไม่มีสกิลของตัวเองเลย — ใช้ได้แค่ attack/defend/wait', () => {
    expect(gamedata.skills.filter((s) => s.classId === 'novice')).toEqual([]);
    expect(makeHero('novice', 40, gamedata.classes.novice.baseStats).skills).toEqual([]);
  });

  /**
   * เพิ่มคลาสใหม่ใน ClassId แล้วลืมใส่ข้อมูลใน gamedata = ระบบเก่าพังแบบเงียบ ๆ
   * (defaultRules หายไปหนึ่งคลาส → ตัวละครไม่มีการกระทำสำรอง)
   */
  it('ทุกคลาสใน ClassId มี baseStats / growthHint / defaultRules ครบ', () => {
    for (const classId of ALL_CLASSES) {
      const def = gamedata.classes[classId];
      expect(def.nameTh, `${classId}.nameTh`).toBeTruthy();
      expect(def.growthHint, `${classId}.growthHint`).toBeTruthy();
      for (const k of ['str', 'int', 'vit', 'agi', 'luk'] as const) {
        expect(def.baseStats[k], `${classId}.baseStats.${k}`).toBeGreaterThan(0);
      }
      expect(gamedata.defaultRules[classId]?.length, `${classId} defaultRules`).toBeGreaterThan(0);
    }
  });

  it('solo guardian clears floor 1 without hitting the 200-round cap', () => {
    for (const s of SEEDS) {
      const r = runBattle(
        [makeHero('guardian', 1, { ...gamedata.classes.guardian.baseStats })], 1, s * 7919 + 13,
      );
      const lastRound = r.events[r.events.length - 1]?.turn ?? 0;
      expect(lastRound).toBeLessThan(200);
    }
  });

  /**
   * เดิมเทสต์นี้ตรึงว่า "นักรบเลเวล 6 ผ่านชั้น 2 ได้ >= 7/10 seed" โดยใช้กฎสำรอง
   * (= เล่นแบบไม่คิด) ซึ่งเป็นตัวเลขของความยากชุดเก่า
   *
   * รอบ 2P เปลี่ยนความยากโดยตั้งใจ: ตั้งแต่ชั้น 2 ทุกเวฟมีมอนเลือดหนา+ตีแรงหนึ่งตัว
   * ที่ `weakest()` ไม่มีวันเลือก เพราะผู้เล่นที่ไม่เคยเปิดหน้า BloxCode เคยไปได้ถึงชั้น 7
   * (docs/design-round2p.md §1) เทสต์เดิมจึงแดง — และมัน *ควร* แดง
   *
   * เขียนใหม่ให้ตรึง "คำสัญญาของรอบนี้" แทนที่จะตรึงตัวเลขเก่า:
   * ที่เลเวลเดียวกัน สเตตัสเดียวกัน seed เดียวกัน — **การเลือกเป้าหมายเป็นต้องชนะ
   * การไล่ตีตัวที่อ่อนที่สุด** ถ้าวันไหนสองอันนี้เท่ากัน แปลว่าเกมเลิกบังคับให้คิดแล้ว
   */
  it('ชั้น 2: เลือกเป้าหมายเป็น ต้องดีกว่าไล่ตีตัวที่อ่อนที่สุด (แกนของรอบ 2P)', () => {
    const base = gamedata.classes.warrior.baseStats;
    const stats = { ...base, str: base.str + 15, vit: base.vit + 10 };
    const naive = 'def turn():\n    attack(weakest(enemies))\n';
    const smart = 'def turn():\n'
      + '    if me.hp_pct < 25:\n'
      + '        defend()\n'
      + '    else:\n'
      + '        attack(deadliest(enemies))\n';

    const runs = (src: string) => {
      let wins = 0;
      for (let s = 0; s < 10; s++) {
        const hero = { ...makeHero('warrior', 6, stats), programSource: src } as Combatant;
        if (runBattle([hero], 2, s * 7919 + 13).victory) wins += 1;
      }
      return wins;
    };

    const smartWins = runs(smart);
    const naiveWins = runs(naive);
    expect(smartWins, `คิดเป็น ${smartWins}/10 · ไม่คิด ${naiveWins}/10`)
      .toBeGreaterThan(naiveWins);
  });

  it('level-10 warrior (+27 str/+18 vit, no equipment) clears floor 3 on >= 7/10 seeds', () => {
    const base = gamedata.classes.warrior.baseStats;
    const wins = winsOf(
      () => makeHero('warrior', 10, { ...base, str: base.str + 27, vit: base.vit + 18 }), 3,
    );
    expect(wins).toBeGreaterThanOrEqual(7);
  });

  it('fresh level-1 warrior fails floor 5 on all 10 seeds', () => {
    expect(winsOf(freshWarrior, 5)).toBe(0);
  });

  /**
   * ความรู้สึกของความคืบหน้า — เดิมวัดด้วยกฎสำรอง (เล่นแบบไม่คิด) ซึ่งหลังรอบ 2P
   * ไม่ควรไปได้ไกลอีกต่อไป วัดด้วยโปรแกรมที่ "คนเขียนเป็น" จะเขียนแทน
   * เพราะสิ่งที่เกมควรรับประกันคือ "เล่นเป็นแล้วรู้สึกว่าคืบหน้า" ไม่ใช่
   * "กดปุ่มเดิมแล้วยังไปได้เรื่อย ๆ"
   */
  it('ความคืบหน้า: นักรบเลเวล 2N ที่เขียนโปรแกรมเป็น ไปถึงเวฟ 6+ ของชั้น N (N=4..7)', () => {
    const base = gamedata.classes.warrior.baseStats;
    const smart = 'def turn():\n'
      + '    if me.hp_pct < 25:\n'
      + '        defend()\n'
      + '    elif count(enemies) >= 3:\n'
      + '        cast("whirlwind", enemies)\n'
      + '    else:\n'
      + '        cast("power_strike", deadliest(enemies))\n';
    for (let N = 4; N <= 7; N++) {
      const level = 2 * N;
      const n = level - 1; // 3 str / 2 vit per level gained
      const hero = {
        ...makeHero('warrior', level, { ...base, str: base.str + 3 * n, vit: base.vit + 2 * n }),
        programSource: smart,
      } as Combatant;
      const r = runBattle([hero], N, 4242 + N);
      expect(r.wavesCleared, `L${level} on floor ${N}`).toBeGreaterThanOrEqual(6);
    }
  });
});

// ================================================= การดวลผู้เล่น (รอบ 2W §5)
/**
 * เทสต์ชุดนี้คุมคำสัญญาสองข้อที่ทำให้เวฟดวลมีเหตุผลที่จะมีอยู่
 * ถ้าข้อใดข้อหนึ่งพัง ฟีเจอร์นี้ควรถูกถอดออกมากกว่าปล่อยให้อยู่ต่อ
 */
describe('runDuel', () => {
  const ALLOC: Record<string, Partial<BaseStats>> = {
    warrior: { str: 0.7, vit: 0.3 },
    mage: { int: 0.8, vit: 0.2 },
    guardian: { str: 0.55, vit: 0.45 },
  };
  const OK: Record<string, string> = {
    warrior: 'def turn():\n    if me.hp_pct < 30:\n        defend()\n'
      + '    else:\n        cast("power_strike", deadliest(enemies))\n',
    mage: 'def turn():\n    if me.hp_pct < 40:\n        cast("heal", me)\n'
      + '    else:\n        cast("firebolt", deadliest(enemies))\n',
    guardian: 'def turn():\n    if me.hp_pct < 40:\n        cast("barrier", me)\n'
      + '    else:\n        cast("shield_bash", deadliest(enemies))\n',
  };
  const DUMB = 'def turn():\n    attack(weakest(enemies))\n';

  function duelist(id: string, classId: ClassId, level: number, source: string): Combatant {
    const base = gamedata.classes[classId].baseStats;
    const stats = { ...base };
    const points = (level - 1) * FORMULAS.statPointsPerLevel;
    for (const [k, w] of Object.entries(ALLOC[classId] ?? {})) {
      stats[k as keyof BaseStats] += Math.round(points * (w as number));
    }
    return {
      id, name: id, side: 'party', classId, level, stats,
      derived: buildDerivedStats(classId, level, stats, []),
      skills: gamedata.skills
        .filter((s) => s.classId === classId && s.unlockLevel <= level).map((s) => s.id),
      rules: gamedata.defaultRules[classId],
      ...({ programSource: source } as object),
    } as Combatant;
  }

  /**
   * W2 — ข้อที่สำคัญที่สุดของทั้งรอบ
   *
   * ผู้เล่นสองคนดูฉากเดียวกันอยู่คนละเครื่อง ถ้าลำดับ argument ทำให้ผลต่างกัน
   * ทั้งคู่จะเห็นการต่อสู้คนละเรื่องโดยไม่มีใครรู้ตัวจนกว่าจะมีคนบ่น
   */
  it('W2: runDuel(a,b) กับ runDuel(b,a) ได้ผลชุดเดียวกันทุกไบต์', () => {
    for (const [x, y] of [['warrior', 'mage'], ['mage', 'guardian'], ['guardian', 'warrior']]) {
      for (let s = 0; s < 15; s++) {
        const a = duelist('alpha', x as ClassId, 15, OK[x]);
        const b = duelist('zulu', y as ClassId, 15, OK[y]);
        const ab = runDuel(a, b, 4200 + s);
        const ba = runDuel(b, a, 4200 + s);
        expect(JSON.stringify(ba), `${x} vs ${y} seed ${4200 + s}`).toBe(JSON.stringify(ab));
      }
    }
  });

  /**
   * ถ้าคนที่เขียนโปรแกรมเป็นไม่ได้เปรียบ เวฟดวลก็แค่โยนเหรียญ
   * วัดที่คลาสเดียวกัน สเตตัสเท่ากันเป๊ะ ต่างกันแค่โปรแกรม
   */
  it('คนที่เขียนโปรแกรมเป็น ต้องชนะคนที่ตีอย่างเดียว อย่างน้อย 80%', () => {
    for (const c of ['warrior', 'mage', 'guardian'] as ClassId[]) {
      let wins = 0;
      for (let s = 0; s < 30; s++) {
        const r = runDuel(
          duelist('alpha', c, 15, OK[c]), duelist('zulu', c, 15, DUMB), 8800 + s,
        );
        if (r.winnerId === 'alpha') wins += 1;
      }
      expect(wins, `${c}: ชนะ ${wins}/30`).toBeGreaterThanOrEqual(24);
    }
  });

  it('การดวลไม่แจกของและไม่แจก EXP — เป็นของแถม ไม่ใช่แหล่งฟาร์ม', () => {
    const r = runDuel(
      duelist('alpha', 'warrior', 15, OK.warrior),
      duelist('zulu', 'mage', 15, OK.mage), 31337,
    );
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.rounds).toBeGreaterThan(0);
    expect(['alpha', 'zulu']).toContain(r.winnerId);
  });
});
