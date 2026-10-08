/**
 * สกิลประจำภูมิภาค (8 ต.ค. 2569 · docs/design-skill-acquisition.md ระยะ S1)
 *
 * คุมสองชั้น:
 *   1. ตัวตรวจอ่านบันทึกการรบถูก — บันทึกที่ประกอบเอง ครอบทุกกรณีขอบ
 *   2. กับการรบจริงของ engine: โปรแกรมตามบทเรียนผ่าน · โปรแกรมตีอย่างเดียวไม่ผ่านแม้ชนะ
 *      (ตัวเลขเกณฑ์ทั้งชุดวัดด้วย tools/proofprobe.cjs)
 */
import { describe, expect, it } from 'vitest';
import {
  FORMULAS, PROOF_REGIONS, allocatePoints, archetypeOfId, buildDerivedStats, enterRegion, gamedata, getRegion,
  hashSeed, mulberry32, parse, proofRequirements, regionProof, regionSkillFor, resolveSkillName, simulateWaves,
  skillsFor, validate, unlockedFeatures,
} from '../src/index';
import { PLAYABLE_CLASSES, type ClassId, type CombatEvent, type Combatant } from '../src/types';

const HERO = 'p1';
const ev = (e: Partial<CombatEvent>): CombatEvent =>
  ({ turn: 1, wave: 1, actorId: HERO, actorName: 'ฮีโร่', action: 'attack', targets: [], ...e }) as CombatEvent;
const waveStart = (wave: number, ids: string[]) =>
  ev({ wave, actorId: 'system', note: 'wave_start', targets: ids.map((id) => ({ id, name: id, hpAfter: 30 })) });
const waveClear = (wave: number) => ev({ wave, actorId: 'system', note: 'wave_clear' });
const windup = (by: string) => ev({ actorId: by, note: 'windup', action: 'skill', skillId: 'mon_windup', targets: [{ id: HERO, name: 'ฮีโร่', hpAfter: 90 }] });
const attack = (target = 'x', killed = false) => ev({ targets: [{ id: target, name: target, damage: 5, hpAfter: killed ? 0 : 10, ...(killed ? { killed } : {}) }] });
const defend = () => ev({ action: 'defend', note: 'defend' });
const hitHero = (hpAfter: number, by = 'f7w1_m0_harpy') => ev({ actorId: by, targets: [{ id: HERO, name: 'ฮีโร่', damage: 5, hpAfter }] });
const checkOf = (p: ReturnType<typeof regionProof>, code: string) => p!.checks.find((c) => c.code === code)!;

describe('archetypeOfId — อ่าน archetype จาก id ที่ waves.ts สร้าง', () => {
  it('มอนปกติ · มอน EX · บอส (แปลงผ่าน gamedata.bosses)', () => {
    expect(archetypeOfId('f4w2_m1_dark_mage')).toBe('dark_mage');
    expect(archetypeOfId('f9w3_ex_golem')).toBe('golem');
    expect(archetypeOfId('f1w10_boss_boss_king_slime')).toBe('slime');
    expect(archetypeOfId(HERO)).toBeUndefined();
  });
});

describe('regionProof — กติกาทั่วไป', () => {
  it('หอคอยกับเมืองไม่มีสกิลให้พิสูจน์ · ภูมิภาคที่มีครบ 5 แห่ง', () => {
    expect(regionProof('tower', 1, { victory: true, events: [] }, HERO, 100)).toBeNull();
    expect(regionProof('haven', 0, { victory: true, events: [] }, HERO, 100)).toBeNull();
    expect([...PROOF_REGIONS].sort()).toEqual(['frostland', 'greenwood', 'isles', 'ruins', 'volcano']);
    for (const r of PROOF_REGIONS) expect(proofRequirements(r)![0]).toBe('ชนะรอบลึกสุดของภูมิภาค');
  });

  it('ไม่ใช่รอบลึกสุด = ตรวจให้ดูได้แต่ไม่นับ · แพ้รอบลึกสุดก็ไม่ผ่าน', () => {
    const deepest = getRegion('volcano')!.depths;
    const events = [waveStart(1, ['a_m0_brute', 'a_m1_orc']), attack('a_m0_brute', true), attack('a_m1_orc', true)];
    const practice = regionProof('volcano', deepest - 1, { victory: true, events }, HERO, 100)!;
    expect(practice).toMatchObject({ eligible: false, passed: false });
    expect(checkOf(practice, 'deepest_win').textTh).toContain('ยังไม่ใช่รอบลึกสุด');
    const lost = regionProof('volcano', deepest, { victory: false, events }, HERO, 100)!;
    expect(lost).toMatchObject({ eligible: true, passed: false });
  });
});

describe('หมายหัว (ป่าเริ่มต้น · ดินแดนน้ำแข็ง)', () => {
  const wolf = 'f4w1_m0_wolf';
  const deepest = getRegion('greenwood')!.depths;
  const run = (events: CombatEvent[]) => regionProof('greenwood', deepest, { victory: true, events }, HERO, 100)!;

  it('ถูกหมายหัว 3 ครั้ง ตั้งรับทันทุกครั้ง = ผ่าน', () => {
    const events = [waveStart(1, [wolf, 'f4w1_m1_slime'])];
    for (let i = 0; i < 3; i++) events.push(attack(), windup(wolf), defend(), attack());
    const p = run(events);
    expect(p.passed).toBe(true);
    expect(checkOf(p, 'handled').textTh).toBe('รับทัน 3/3 ครั้ง (ต้องทันทุกครั้ง)');
  });

  it('พลาดครั้งเดียวก็ไม่ผ่าน — ล้มตัวที่หมายได้ก่อนก็ไม่นับว่าอ่านท่า', () => {
    const events = [waveStart(1, [wolf, 'f4w1_m1_slime'])];
    for (let i = 0; i < 3; i++) events.push(windup(wolf), defend());
    events.push(windup(wolf), attack(wolf, true));
    const p = run(events);
    expect(checkOf(p, 'windups').ok).toBe(true);
    expect(checkOf(p, 'handled')).toMatchObject({ ok: false, textTh: 'รับทัน 3/4 ครั้ง (ต้องทันทุกครั้ง)' });
  });

  it('ตั้งรับตลอดไม่ผ่าน (ตั้งรับตอนไม่ถูกหมายหัวเกิน 25%)', () => {
    const events = [waveStart(1, [wolf])];
    for (let i = 0; i < 3; i++) events.push(windup(wolf), defend(), defend(), attack());
    const p = run(events);
    expect(checkOf(p, 'guard_share')).toMatchObject({ ok: false });
    expect(checkOf(p, 'guard_share').textTh).toContain('3/6');
  });

  it('เวฟจบก่อนได้ลงมือ = ไม่นับครั้งนั้น · มอนอื่นที่ไม่ใช่ตัวมีกลไกไม่นับ', () => {
    const events = [waveStart(1, [wolf]), windup(wolf), waveClear(1), waveStart(2, ['f4w2_m0_slime']), windup('f4w2_m0_slime'), attack()];
    expect(checkOf(run(events), 'windups').textTh).toBe('ถูกหมายหัว 0 ครั้ง (ต้องอย่างน้อย 3)');
  });

  it('ดินแดนน้ำแข็งนับเฉพาะโกเลม', () => {
    const golem = 'f9w1_m0_golem';
    const events = [waveStart(1, [golem, 'f9w1_m1_orc'])];
    for (let i = 0; i < 3; i++) events.push(windup(golem), defend(), attack());
    expect(regionProof('frostland', getRegion('frostland')!.depths, { victory: true, events }, HERO, 100)!.passed).toBe(true);
  });
});

describe('เผื่อเลือด (หมู่เกาะ)', () => {
  const deepest = getRegion('isles')!.depths;
  const run = (events: CombatEvent[]) => regionProof('isles', deepest, { victory: true, events }, HERO, 100)!;

  it('ดูแลเลือดสองครั้ง เลือดไม่ต่ำกว่าครึ่ง ตั้งรับไม่เกิน 40% = ผ่าน', () => {
    const p = run([waveStart(1, ['a_m0_harpy']), hitHero(70), defend(), hitHero(62), defend(), attack(), attack(), attack()]);
    expect(p.passed).toBe(true);
    expect(checkOf(p, 'hp_floor').textTh).toBe('เลือดต่ำสุด 62% (ต้องไม่ต่ำกว่า 50%)');
  });

  it('เงื่อนไขเลือดต่ำเกินไป (ดูแลตอนเลือดเหลือน้อย) ไม่ผ่าน', () => {
    const p = run([waveStart(1, ['a_m0_harpy']), hitHero(40), defend(), hitHero(30), defend(), attack(), attack(), attack()]);
    expect(checkOf(p, 'hp_floor').ok).toBe(false);
  });

  it('เลือดที่ฟื้นตอนเคลียร์เวฟคิดตามสูตรเดียวกับตัวรบ (15%)', () => {
    // เลือด 55 → เคลียร์เวฟ +15 = 70 · ไม่มีเหตุการณ์บอก แต่ตัวตรวจต้องรู้
    const p = run([waveStart(1, ['a_m0_harpy']), hitHero(55), defend(), waveClear(1), waveStart(2, ['b_m0_harpy']), defend(), attack(), attack(), attack()]);
    expect(checkOf(p, 'care').textTh).toBe('ดูแลเลือด 2 ครั้ง (ต้องอย่างน้อย 2)');
    expect(p.passed).toBe(true);
  });

  it('ไม่ดูแลเลือดเลยไม่ผ่าน แม้เลือดเต็มตลอด (ของแรงแทนโค้ดไม่ได้)', () => {
    expect(checkOf(run([waveStart(1, ['a_m0_harpy']), attack(), attack()]), 'care').ok).toBe(false);
  });
});

describe('ตัวอันตรายตายก่อน (ซากปรักหักพัง · ภูเขาไฟ)', () => {
  const deepest = getRegion('ruins')!.depths;
  const wave = (n: number, firstKill: 'dark_mage' | 'skeleton') => [
    waveStart(n, [`f8w${n}_m0_dark_mage`, `f8w${n}_m1_skeleton`]),
    attack(`f8w${n}_m0_${firstKill}`.replace('m0_skeleton', 'm1_skeleton'), true),
    attack('rest', true),
    waveClear(n),
  ];

  it('เมจมืดตายก่อนอย่างน้อย 4 เวฟ และ 80% ของเวฟที่มีมันปน = ผ่าน', () => {
    const events = [1, 2, 3, 4, 5].flatMap((n) => wave(n, n === 5 ? 'skeleton' : 'dark_mage'));
    const p = regionProof('ruins', deepest, { victory: true, events }, HERO, 100)!;
    expect(checkOf(p, 'first_share').textTh).toBe('4/5 เวฟที่มีเมจมืดปน (80% · ต้องอย่างน้อย 80%)');
    expect(p.passed).toBe(true);
  });

  it('เวฟที่มีเมจมืดตัวเดียวไม่นับ · ตายพร้อมกันในท่าเดียว (AoE) นับว่าตายก่อน', () => {
    const solo = [waveStart(1, ['f8w1_m0_dark_mage']), attack('f8w1_m0_dark_mage', true), waveClear(1)];
    const aoe = ev({ targets: [
      { id: 'f8w2_m0_dark_mage', name: 'm', damage: 9, hpAfter: 0, killed: true },
      { id: 'f8w2_m1_skeleton', name: 's', damage: 9, hpAfter: 0, killed: true },
    ] });
    const events = [...solo, waveStart(2, ['f8w2_m0_dark_mage', 'f8w2_m1_skeleton']), aoe, waveClear(2)];
    const p = regionProof('ruins', deepest, { victory: true, events }, HERO, 100)!;
    expect(checkOf(p, 'first_kills').textTh).toBe('เมจมืดตายก่อน 1 เวฟ (ต้องอย่างน้อย 4)');
    expect(checkOf(p, 'first_share').textTh).toContain('1/1');
  });
});

// ---------------------------------------------------------------- กับการรบจริง

function hero(classId: ClassId, level: number, src: string, proved: string[] = []): Combatant {
  const stats = { ...gamedata.classes[classId].baseStats };
  const zero = { str: 0, int: 0, vit: 0, agi: 0, luk: 0 };
  for (let l = 2; l <= level; l++) {
    const g = allocatePoints(zero, FORMULAS.statPointsPerLevel, classId, l);
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] += g[k];
  }
  return {
    id: HERO, name: 'ฮีโร่', side: 'party', classId, level, stats,
    derived: buildDerivedStats(classId, level, stats, []),
    skills: skillsFor(classId, level, proved).map((s) => s.id), rules: [],
    ...({ programSource: src } as object),
  } as Combatant;
}

function deepestRun(regionId: string, h: Combatant, seed: number) {
  const depth = getRegion(regionId)!.depths;
  const entry = enterRegion(regionId, depth, 1, seed);
  const rng = mulberry32(hashSeed(seed, entry.floor * 977, 1, 0xba771e));
  const result = simulateWaves([h], entry.waves, { floor: entry.floor, seed, rng });
  return { result, proof: regionProof(regionId, depth, result, HERO, h.derived.maxHp)! };
}

describe('กับการรบจริง — โปรแกรมตามบทเรียนผ่าน · ตีอย่างเดียวไม่ผ่านแม้ชนะ', () => {
  const NAIVE = 'def turn():\n    attack(weakest(enemies))\n';
  const MARKED = 'def turn():\n    if has_debuff("marked"):\n        defend()\n    else:\n        attack(weakest(enemies))\n';

  it('ป่าเริ่มต้น รอบลึกสุด: ผู้พิทักษ์ Lv10 อ่านท่าผ่านทุกครั้งที่ชนะ · ตีอย่างเดียวชนะได้แต่ไม่ผ่าน', () => {
    let lessonWins = 0;
    let naiveWins = 0;
    for (let s = 1; s <= 8; s++) {
      const lesson = deepestRun('greenwood', hero('guardian', 10, MARKED), s * 7919);
      if (lesson.result.victory) {
        lessonWins++;
        expect(lesson.proof.passed, `seed ${s}`).toBe(true);
      }
      const naive = deepestRun('greenwood', hero('guardian', 10, NAIVE), s * 7919);
      if (naive.result.victory) naiveWins++;
      expect(naive.proof.passed, `seed ${s}`).toBe(false);
    }
    expect(lessonWins).toBeGreaterThanOrEqual(6);
    expect(naiveWins).toBeGreaterThan(0);
  });

  it('หมู่เกาะ รอบลึกสุด: เงื่อนไขเลือด 90% ผ่าน · 30% มาช้าเกินไม่ผ่าน (ผู้พิทักษ์ที่มีการ์ดเหล็กจากป่าแล้ว)', () => {
    const care = (th: number) => 'def turn():\n'
      + `    if me.hp_pct < ${th} and not has_buff("shield"):\n        cast("iron_guard", me)\n        attack(weakest(enemies))\n`
      + '    else:\n        attack(weakest(enemies))\n';
    for (let s = 1; s <= 6; s++) {
      const early = deepestRun('isles', hero('guardian', 9, care(90), ['greenwood']), s * 7919);
      expect(early.result.victory && early.proof.passed, `seed ${s}`).toBe(true);
      const late = deepestRun('isles', hero('guardian', 9, care(30), ['greenwood']), s * 7919);
      expect(late.proof.passed, `seed ${s}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------- สกิลที่ได้

describe('สกิลประจำภูมิภาค', () => {
  it('ทุกภูมิภาคมีสกิลครบทุกอาชีพ ใช้ชนิดและแอนิเมชันที่ตัวรบรู้จัก · ผู้ฝึกหัดไม่มี', () => {
    const anims = new Set(gamedata.skills.filter((s) => !s.region).map((s) => s.animation));
    for (const r of PROOF_REGIONS) {
      for (const c of PLAYABLE_CLASSES) {
        const s = regionSkillFor(c, r)!;
        expect(s, `${r}/${c}`).toBeDefined();
        expect(['physical', 'magic', 'heal', 'shield', 'taunt']).toContain(s.kind);
        expect(anims.has(s.animation)).toBe(true);
        // ชื่อสั้นที่ผู้เล่นเขียนใน cast() ต้องไม่ชนกับสกิลอื่น
        const short = s.id.slice(s.id.indexOf('_') + 1);
        expect(resolveSkillName(short)?.id).toBe(s.id);
      }
      expect(regionSkillFor('novice', r)).toBeUndefined();
    }
    expect(gamedata.skills.filter((s) => s.region)).toHaveLength(PROOF_REGIONS.length * PLAYABLE_CLASSES.length);
  });

  it('skillsFor: สกิลอาชีพตามเลเวล + สกิลของภูมิภาคที่พิสูจน์แล้วเท่านั้น', () => {
    expect(skillsFor('warrior', 1).map((s) => s.id)).toEqual(['w_power_strike']);
    expect(skillsFor('warrior', 1, ['greenwood', 'volcano']).map((s) => s.id)).toEqual(['w_power_strike', 'w_guard_up', 'w_sunder']);
    // เลเวลสูงไม่ได้สกิลภูมิภาคเอง
    expect(skillsFor('mage', 99).some((s) => s.region)).toBe(false);
    // ผู้ฝึกหัดพิสูจน์ไว้ก่อน ยังไม่มีสกิลจนกว่าจะเลือกอาชีพ
    expect(skillsFor('novice', 5, ['greenwood'])).toEqual([]);
  });

  it('ตัวตรวจโปรแกรมบอกที่มาของสกิลภูมิภาคตามจริง (ไม่บอกว่า "ปลดที่เลเวล")', () => {
    const p = parse('def turn():\n    cast("guard_up", me)\n').program!;
    const r = validate(p, { features: unlockedFeatures(10), availableSkills: skillsFor('warrior', 10).map((s) => s.id) });
    const msg = r.errors.map((e) => e.messageTh).join(' ');
    expect(msg).toContain('ได้จากการพิสูจน์บทเรียนของป่าเริ่มต้น');
    expect(msg).not.toContain('ปลดที่เลเวล');
    const ok = validate(p, { features: unlockedFeatures(10), availableSkills: skillsFor('warrior', 10, ['greenwood']).map((s) => s.id) });
    expect(ok.errors).toEqual([]);
  });
});
