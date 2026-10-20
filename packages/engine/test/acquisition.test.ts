/**
 * วิธีได้สกิลระยะ S2–S4 (docs/design-skill-acquisition.md ข้อ 8)
 *
 * คุม "สัญญากับผู้เล่น" ไม่ใช่ตัวเลขจูน:
 *   S2  ใช้ถูกจังหวะถึงเกณฑ์ → ขั้น 2 แรงขึ้นตามที่ข้อความบอก · สแปมไม่นับ
 *   ช่อง ตัวตรวจโปรแกรมนับชนิดสกิลใน cast() · โปรแกรมเก่าที่เกินถูกตัดเหมือนตัวตรวจ
 *   S3  แต้มที่ความชำนาญแจกให้สายถึงเกณฑ์ → ได้สกิลสายนั้นของอาชีพ
 *   S4  กลไกห้าแบบทำตามข้อความ · ตำราดรอปจากต้นทางเท่านั้น · เพดานดวงได้แน่นอน · ไม่แตะผลการรบเดิม
 */
import { describe, expect, it } from 'vitest';
import {
  STUN_IMMUNE_TURNS, addMastery, bookSkillFor, bookSourceOf, buildDerivedStats, describeRank2, describeSkill,
  gamedata, hashSeed, lineProgress, lineSkillFor, loadoutSkills, masteryFromBattle, masteryRequirement,
  MASTERY_SKILLS, mulberry32, nextSlotLevel, parse, proficiencyFromBattle, programSkillIds, rollSkillBooks,
  runBattle, simulateWaves, skillRank, skillRanksOf, skillSlotsFor, skillsFor, unlockedFeatures, validate,
} from '../src/index';
import { getSkill } from '../src/data';
import type { BaseStats, ClassId, CombatEvent, Combatant, WaveSpec } from '../src/types';

const HERO = 'p1';

function hero(classId: ClassId, level: number, skills: string[], src: string, extra: object = {}): Combatant {
  const base = gamedata.classes[classId].baseStats;
  const pts = (level - 1) * 4;
  const stats: BaseStats = { ...base, str: base.str + Math.round(pts * 0.5), int: base.int + Math.round(pts * 0.3), vit: base.vit + Math.round(pts * 0.2) };
  const derived = buildDerivedStats(classId, level, stats, []);
  return {
    id: HERO, name: 'ทดสอบ', side: 'party', classId, level, stats, derived, skills, rules: [], programSource: src, ...extra,
  } as Combatant;
}

/** มอนทดสอบ — เลือด/พลังกำหนดเอง ใช้โปรแกรมมอนตาม archetype */
function mon(id: string, hp: number, opts: { atk?: number; speed?: number; isBoss?: boolean; archetype?: string } = {}): Combatant {
  return {
    id, name: id, side: 'enemy', classId: 'monster', level: 5,
    stats: { str: 1, int: 1, vit: 1, agi: 1, luk: 1 },
    derived: {
      maxHp: hp, maxMp: 0, atk: opts.atk ?? 1, matk: 1, def: 0, mdef: 0, speed: opts.speed ?? 1,
      critRate: 0, critDmg: 1.5, evasion: 0, dropBonus: 0,
    },
    skills: [], rules: [], monsterId: opts.archetype ?? 'slime', ...(opts.isBoss ? { isBoss: true } : {}),
  } as Combatant;
}

function fight(party: Combatant[], waves: WaveSpec[], seed = 7) {
  return simulateWaves(party, waves, { floor: 1, seed, rng: mulberry32(hashSeed(seed, 1)), rewardMult: 0 });
}

const heroEvents = (events: CombatEvent[]) => events.filter((e) => e.actorId === HERO);

// =====================================================================================
describe('S2 สกิลขั้น 2', () => {
  it('สกิลอาชีพ 9 ตัวมีขั้น 2 ครบ และมีเงื่อนไข "ใช้ถูกจังหวะ" ทุกตัว (ไม่มีตัวไหนลืม)', () => {
    const ranked = gamedata.skills.filter((s) => s.rank2).map((s) => s.id).sort();
    expect(ranked).toHaveLength(9);
    expect([...MASTERY_SKILLS].sort()).toEqual(ranked);
    for (const id of ranked) expect(masteryRequirement(id)).toBeTruthy();
    // สกิลภูมิภาค/สาย/ตำราไม่มีขั้น 2
    expect(gamedata.skills.filter((s) => s.rank2 && (s.region || s.line || s.book))).toEqual([]);
  });

  it('ขั้นตามจำนวนสะสม — ครบ masteryNeed เป็นขั้น 2 · สกิลที่ไม่มีขั้น 2 เป็นขั้น 1 เสมอ', () => {
    const need = gamedata.acquisition.masteryNeed;
    expect(skillRank('w_execute', need - 1)).toBe(1);
    expect(skillRank('w_execute', need)).toBe(2);
    expect(skillRank('w_pierce', 999)).toBe(1);
    expect(skillRanksOf({ w_execute: need, w_power_strike: 3, w_pierce: 999 })).toEqual({ w_execute: 2 });
  });

  it('ปิดฉาก: ใช้กับเป้าเลือดต่ำกว่า 30% นับ · ใช้กับเป้าเลือดเต็มไม่นับ และพาให้ทั้งการรบไม่ถึงเกณฑ์', () => {
    const exec = 'def turn():\n    if weakest(enemies).hp_pct < 30:\n        cast("execute", weakest(enemies))\n    else:\n        attack(weakest(enemies))\n';
    const spam = 'def turn():\n    cast("execute", weakest(enemies))\n';
    const waves: WaveSpec[] = [0, 1, 2].map((w) => ({ monsters: [mon(`f1w${w}_m0_slime`, 200), mon(`f1w${w}_m1_slime`, 200)] }));
    const h = hero('warrior', 12, ['w_power_strike', 'w_whirlwind', 'w_execute'], exec);
    const good = masteryFromBattle(fight([h], waves).events, HERO, h.derived.maxHp).w_execute;
    expect(good.casts).toBeGreaterThan(0);
    expect(good.correct).toBe(good.casts);
    expect(good.credited).toBe(Math.min(good.correct, gamedata.acquisition.masteryPerBattleCap));

    const s = hero('warrior', 12, ['w_power_strike', 'w_whirlwind', 'w_execute'], spam);
    const bad = masteryFromBattle(fight([s], waves).events, HERO, s.derived.maxHp).w_execute;
    expect(bad.casts).toBeGreaterThan(bad.correct);
    expect(bad.correct / bad.casts).toBeLessThan(gamedata.acquisition.masteryMinShare);
    expect(bad.credited).toBe(0);
  });

  it('พายุน้ำแข็ง/ลูกไฟ: เลือกท่าตามจำนวนศัตรู = ถูกทุกครั้ง', () => {
    const src = 'def turn():\n    if len(enemies) >= 3:\n        cast("blizzard", enemies)\n    else:\n        cast("firebolt", weakest(enemies))\n';
    const waves: WaveSpec[] = [{ monsters: [0, 1, 2, 3].map((i) => mon(`f1w1_m${i}_slime`, 120 + i * 40)) }];
    const h = hero('mage', 12, ['m_firebolt', 'm_blizzard', 'm_heal'], src);
    const r = fight([h], waves);
    const t = masteryFromBattle(r.events, HERO, h.derived.maxHp);
    expect(t.m_blizzard.casts).toBeGreaterThan(0);
    expect(t.m_blizzard.correct).toBe(t.m_blizzard.casts);
    expect(t.m_firebolt.correct).toBe(t.m_firebolt.casts);
  });

  it('ฮีลตอนเลือดเต็มไม่นับ — เลือดก่อนฮีลคิดจากแถวของเหตุการณ์เอง', () => {
    const fake = (hpAfter: number, heal: number): CombatEvent[] => [
      { turn: 1, wave: 1, actorId: 'system', actorName: 'system', action: 'attack', note: 'wave_start', targets: [{ id: 'm', name: 'm', hpAfter: 50 }] },
      { turn: 1, wave: 1, actorId: HERO, actorName: 'h', action: 'skill', skillId: 'm_heal', targets: [{ id: HERO, name: 'h', heal, hpAfter }] },
    ];
    expect(masteryFromBattle(fake(70, 30), HERO, 100).m_heal).toMatchObject({ casts: 1, correct: 1 });
    expect(masteryFromBattle(fake(100, 5), HERO, 100).m_heal).toMatchObject({ casts: 1, correct: 0 });
  });

  it('ต้องสม่ำเสมอหลายการรบ: ถูกจังหวะกี่ครั้งก็นับได้ไม่เกินเพดานต่อการรบ', () => {
    const cap = gamedata.acquisition.masteryPerBattleCap;
    const events: CombatEvent[] = [
      { turn: 1, wave: 1, actorId: 'system', actorName: 'system', action: 'attack', note: 'wave_start', targets: [{ id: 'm', name: 'm', hpAfter: 50 }] },
      ...Array.from({ length: cap + 5 }, (_, i): CombatEvent => ({
        turn: i + 2, wave: 1, actorId: HERO, actorName: 'h', action: 'skill', skillId: 'm_heal', targets: [{ id: HERO, name: 'h', heal: 10, hpAfter: 30 }],
      })),
    ];
    expect(masteryFromBattle(events, HERO, 100).m_heal).toEqual({ casts: cap + 5, correct: cap + 5, credited: cap });
  });

  it('สะสม: นับเฉพาะ credited · หยุดที่ masteryNeed · บอกว่าขึ้นขั้นในการรบไหน · สกิลที่ไม่มีในมือไม่นับ', () => {
    const need = gamedata.acquisition.masteryNeed;
    const tally = { w_execute: { casts: 10, correct: 10, credited: 10 }, w_whirlwind: { casts: 9, correct: 5, credited: 0 } };
    const a = addMastery({ w_execute: need - 4 }, tally, ['w_execute', 'w_whirlwind']);
    expect(a.mastery).toEqual({ w_execute: need });
    expect(a.changes).toEqual([{ skillId: 'w_execute', gained: 4, total: need, rankedUp: true }]);
    expect(addMastery({ w_execute: need }, tally, ['w_execute']).changes).toEqual([]);
    expect(addMastery({}, tally, []).changes).toEqual([]);
  });

  it('ขั้น 2 แรงขึ้นจริงตามที่ข้อความบอก (ตัวรบใช้ค่าเดียวกับ describeRank2)', () => {
    const src = 'def turn():\n    cast("power_strike", weakest(enemies))\n';
    const waves: WaveSpec[] = [{ monsters: [mon('f1w1_m0_slime', 100000)] }];
    const base = fight([hero('warrior', 10, ['w_power_strike'], src)], waves, 3);
    const ranked = fight([hero('warrior', 10, ['w_power_strike'], src, { skillRanks: { w_power_strike: 2 } })], waves, 3);
    const first = (r: typeof base) => heroEvents(r.events).find((e) => e.skillId === 'w_power_strike')!.targets[0].damage!;
    const ratio = first(ranked) / first(base);
    const skill = getSkill('w_power_strike')!;
    expect(ratio).toBeCloseTo(skill.rank2!.power! / skill.power, 1);
    expect(describeRank2(skill)).toContain(`${skill.rank2!.power}%`);
  });

  it('ยั่วยุขั้น 2 ลดดาเมจที่รับมากกว่าขั้น 1', () => {
    const src = 'def turn():\n    if not has_buff("taunt"):\n        cast("taunt", me)\n    else:\n        defend()\n';
    const waves: WaveSpec[] = [{ monsters: [mon('f1w1_m0_slime', 1e6, { atk: 90, speed: 99 })] }];
    const taken = (extra: object) => {
      const r = fight([hero('guardian', 10, ['g_taunt'], src, extra)], waves, 5);
      return r.events.flatMap((e) => e.targets).filter((t) => t.id === HERO && (t.damage ?? 0) > 0).slice(0, 6)
        .reduce((s, t) => s + t.damage!, 0);
    };
    expect(taken({ skillRanks: { g_taunt: 2 } })).toBeLessThan(taken({}));
  });
});

// =====================================================================================
describe('ช่องสกิล', () => {
  it('3 ช่องตอนเริ่ม แล้วเพิ่มตามเลเวลจนถึง 6', () => {
    expect(skillSlotsFor(1)).toBe(3);
    expect(skillSlotsFor(7)).toBe(3);
    expect(nextSlotLevel(7)).toBe(8);
    expect(skillSlotsFor(8)).toBe(4);
    expect(skillSlotsFor(99)).toBe(6);
    expect(nextSlotLevel(99)).toBeNull();
  });

  const four = 'def turn():\n    if me.hp_pct < 30:\n        cast("guard_up", me)\n    elif len(enemies) >= 3:\n        cast("whirlwind", enemies)\n'
    + '    elif weakest(enemies).hp_pct < 30:\n        cast("execute", weakest(enemies))\n    else:\n        cast("power_strike", weakest(enemies))\n';
  const owned = ['w_power_strike', 'w_whirlwind', 'w_execute', 'w_guard_up'];
  const features = unlockedFeatures(10);

  it('ตัวตรวจโปรแกรม: เกินช่อง = ValueError ที่ cast แรกของชนิดที่เกิน บอกเลเวลที่ได้ช่องเพิ่ม · ไม่ส่งช่อง = ไม่จำกัด', () => {
    const prog = parse(four).program!;
    const errs = validate(prog, { features, availableSkills: owned, skillSlots: 3, skillSlotNextLevel: 8 }).errors;
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ name: 'ValueError', line: 9 });
    expect(errs[0].messageTh).toContain('3 ชนิด');
    expect(errs[0].messageTh).toContain('เลเวล 8');
    expect(validate(prog, { features, availableSkills: owned, skillSlots: 4 }).errors).toEqual([]);
    expect(validate(prog, { features, availableSkills: owned }).errors).toEqual([]);
    // cast ตัวเดิมซ้ำนับชนิดเดียว · can_cast ไม่นับ
    const repeat = 'def turn():\n    if can_cast("execute"):\n        cast("power_strike", weakest(enemies))\n    else:\n        cast("power_strike", strongest(enemies))\n';
    expect(validate(parse(repeat).program!, { features, availableSkills: owned, skillSlots: 1 }).errors).toEqual([]);
  });

  it('โปรแกรมเก่าที่เกินช่อง: ตอนรบพกแค่ N ชนิดแรกตามลำดับในโค้ด (ลำดับเดียวกับตัวตรวจ)', () => {
    const prog = parse(four).program!;
    expect(programSkillIds(prog)).toEqual(['w_guard_up', 'w_whirlwind', 'w_execute', 'w_power_strike']);
    expect(loadoutSkills(owned, prog, 3)).toEqual(['w_guard_up', 'w_whirlwind', 'w_execute']);
    expect(loadoutSkills(['w_execute'], prog, 6)).toEqual(['w_execute']);
  });
});

// =====================================================================================
describe('S3 สกิลจากความชำนาญ', () => {
  const start = gamedata.classes.novice.baseStats;
  const T = gamedata.acquisition.lineThreshold;

  it('อาชีพละ 3 สาย (STR · INT · VIT) ครบ ผู้ฝึกหัดไม่มี', () => {
    for (const c of ['warrior', 'mage', 'guardian']) {
      for (const line of ['str', 'int', 'vit'] as const) expect(lineSkillFor(c, line), `${c} ${line}`).toBeDefined();
    }
    expect(lineSkillFor('novice', 'str')).toBeUndefined();
  });

  it('นับแต้มเทียบกับสเตตัสเริ่มของผู้ฝึกหัด · ถึงเกณฑ์ได้สกิลสายนั้น ขาดหนึ่งแต้มไม่ได้', () => {
    const stats = { ...start, str: start.str + T, int: start.int + T - 1 };
    expect(lineProgress(stats)).toEqual({ str: T, int: T - 1, vit: 0 });
    const ids = skillsFor('warrior', 1, { stats }).map((s) => s.id);
    expect(ids).toContain(lineSkillFor('warrior', 'str')!.id);
    expect(ids).not.toContain(lineSkillFor('warrior', 'int')!.id);
    // รูปเดิม (อาร์เรย์ภูมิภาค) ยังใช้ได้ และไม่มีสกิลสาย/ตำราติดมา
    expect(skillsFor('warrior', 1, ['greenwood']).map((s) => s.id)).toEqual(['w_power_strike', 'w_guard_up']);
  });
});

// =====================================================================================
describe('S4 กลไกของสกิลตำรา', () => {
  it('พิษ: กัดตอนต้นทุกเทิร์นของเป้าตามจำนวนเทิร์น · ไม่ซ้อน · ฆ่าได้และนับเป็นการตาย · poison_turns มองเห็น', () => {
    const src = 'def turn():\n    if weakest(enemies).poison_turns == 0:\n        cast("venom_edge", weakest(enemies))\n    else:\n        defend()\n';
    const r = fight([hero('warrior', 10, ['w_venom_edge'], src)], [{ monsters: [mon('f1w1_m0_slime', 400)] }]);
    const hit = heroEvents(r.events).find((e) => e.skillId === 'w_venom_edge')!;
    expect(hit.targets[0].poison).toBe(3);
    const ticks = r.events.filter((e) => e.note === 'poison');
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const t of ticks) {
      expect(t.actorId).toBe('f1w1_m0_slime');
      expect(t.skillId).toBe('w_venom_edge');
      expect(t.targets[0].damage).toBeGreaterThan(0);
    }
    // โปรแกรมดูพิษเป็น → ไม่ร่ายซ้ำระหว่างที่ยังติด: ทุกการร่ายห่างกันอย่างน้อย 3 เทิร์นพิษ
    const casts = heroEvents(r.events).filter((e) => e.skillId === 'w_venom_edge').length;
    expect(ticks.length).toBeGreaterThanOrEqual(casts * 3 - 3);
    expect(r.victory).toBe(true);
    const lastTick = ticks[ticks.length - 1];
    if (lastTick.targets[0].killed) expect(lastTick.targets[0].hpAfter).toBe(0);
  });

  it('มึน: เป้าข้ามเทิร์นถัดไป · ต้านต่อ STUN_IMMUNE_TURNS เทิร์น · บอสไม่มึน', () => {
    const src = 'def turn():\n    cast("skull_crack", weakest(enemies))\n';
    const r = fight([hero('warrior', 10, ['w_skull_crack'], src)], [{ monsters: [mon('f1w1_m0_slime', 1e6, { atk: 5 })] }]);
    const seq = r.events.filter((e) => e.actorId === 'f1w1_m0_slime').slice(0, 8).map((e) => e.note ?? e.action);
    expect(seq[0]).toBe('stunned');
    // หลังมึน ต้านอีก STUN_IMMUNE_TURNS เทิร์น แล้วจึงมึนได้อีก
    const firstStuns = seq.map((x, i) => (x === 'stunned' ? i : -1)).filter((i) => i >= 0);
    expect(firstStuns[1] - firstStuns[0]).toBe(STUN_IMMUNE_TURNS + 1);

    const boss = fight([hero('warrior', 10, ['w_skull_crack'], src)], [{ monsters: [mon('f1w10_boss_boss_king_slime', 1e6, { isBoss: true })] }]);
    expect(boss.events.some((e) => e.note === 'stunned')).toBe(false);
    expect(heroEvents(boss.events).every((e) => !e.targets[0]?.stun)).toBe(true);
  });

  it('หลายฮิต: แถวเป้าซ้ำตามจำนวนฮิต · หยุดเมื่อเป้าตาย', () => {
    const src = 'def turn():\n    cast("flurry", weakest(enemies))\n';
    const big = fight([hero('warrior', 10, ['w_flurry'], src)], [{ monsters: [mon('f1w1_m0_slime', 1e6)] }]);
    expect(heroEvents(big.events)[0].targets.map((t) => t.id)).toEqual(['f1w1_m0_slime', 'f1w1_m0_slime', 'f1w1_m0_slime']);
    const tiny = fight([hero('warrior', 10, ['w_flurry'], src)], [{ monsters: [mon('f1w1_m0_slime', 1)] }]);
    expect(heroEvents(tiny.events)[0].targets).toHaveLength(1);
  });

  it('ดูดเลือด: เพิ่มแถวผู้ร่ายที่มี heal + drain · ความชำนาญไม่นับเป็นงาน INT', () => {
    const src = 'def turn():\n    cast("blood_strike", weakest(enemies))\n';
    const h = hero('warrior', 10, ['w_blood_strike'], src);
    const r = fight([h], [{ monsters: [mon('f1w1_m0_slime', 1e6, { atk: 300, speed: 99 })] }]);
    const drains = heroEvents(r.events).flatMap((e) => e.targets).filter((t) => t.drain);
    expect(drains.length).toBeGreaterThan(0);
    for (const d of drains) expect(d).toMatchObject({ id: HERO, drain: true });
    expect(proficiencyFromBattle(r, HERO, h.derived.maxHp).int).toBe(0);
  });

  it('บัฟ: has_buff("power") จริงสามเทิร์นถัดไป ดาเมจแรงขึ้นตาม pct แล้วหมดเอง', () => {
    const src = 'def turn():\n    if turn_no == 1:\n        cast("war_cry", me)\n    else:\n        attack(weakest(enemies))\n';
    const h = hero('warrior', 10, ['w_war_cry'], src);
    const r = fight([h], [{ monsters: [mon('f1w1_m0_slime', 1e6)] }], 11);
    const ev = heroEvents(r.events);
    expect(ev[0].targets[0]).toMatchObject({ id: HERO, buff: 'power' });
    const plain = fight([hero('warrior', 10, [], 'def turn():\n    attack(weakest(enemies))\n')], [{ monsters: [mon('f1w1_m0_slime', 1e6)] }], 11);
    const dmgs = (evs: CombatEvent[]) => heroEvents(evs).filter((e) => e.action === 'attack').map((e) => e.targets[0].damage!);
    const buffed = dmgs(r.events).slice(0, 3);
    const after = dmgs(r.events).slice(3, 6);
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(avg(buffed) / avg(after)).toBeGreaterThan(1.15);
    expect(avg(after) / avg(dmgs(plain.events).slice(0, 6))).toBeLessThan(1.15);
  });

  it('ไม่มีใครใช้สกิลตำรา = ผลการรบเหมือนเดิมทุกไบต์ (หอคอยทั้ง 10 ชั้น ตัวเดียวกับ golden fixture)', () => {
    // golden fixture คุมอยู่แล้ว — ตรงนี้เช็กว่าเหตุการณ์ไม่มีช่องใหม่โผล่มาเลยเมื่อไม่มีสถานะ
    for (let floor = 1; floor <= 10; floor++) {
      const r = runBattle([hero('warrior', floor * 2, ['w_power_strike'], 'def turn():\n    cast("power_strike", weakest(enemies))\n')], floor, floor * 31);
      for (const e of r.events) {
        expect(e.note === 'poison' || e.note === 'stunned').toBe(false);
        for (const t of e.targets) expect(t.poison ?? t.stun ?? t.buff ?? t.drain).toBeUndefined();
      }
    }
  });

  it('ข้อความสกิลพูดตัวเลขเดียวกับข้อมูล', () => {
    const venom = getSkill('w_venom_edge')!;
    expect(describeSkill(venom).effectTh).toContain(`${venom.poison!.power}%`);
    expect(describeSkill(getSkill('w_flurry')!).effectTh).toContain('3 ครั้ง');
    expect(describeSkill(getSkill('m_drain_life')!).effectTh).toContain('60%');
    expect(describeSkill(getSkill('w_skull_crack')!).effectTh).toContain(`${STUN_IMMUNE_TURNS} เทิร์น`);
    expect(describeSkill(getSkill('w_war_cry')!).effectTh).toContain('ATK +30%');
  });
});

// =====================================================================================
describe('S4 ตำราสกิล', () => {
  const kill = (id: string): CombatEvent => ({
    turn: 1, wave: 1, actorId: HERO, actorName: 'h', action: 'attack', targets: [{ id, name: id, damage: 9, killed: true, hpAfter: 0 }],
  });

  it('ทุกเล่มมีสกิลครบสามอาชีพ และต้นทางมีอยู่จริงในเกม', () => {
    for (const b of gamedata.skillBooks) {
      for (const c of ['warrior', 'mage', 'guardian']) expect(bookSkillFor(c, b.id), `${b.id} ${c}`).toBeDefined();
      for (const boss of b.bosses) expect(gamedata.bosses.some((x) => x.id === boss), boss).toBe(true);
      for (const a of b.elites) expect(gamedata.monsterArchetypes.some((x) => x.id === a), a).toBe(true);
    }
    // EX ที่เป็นต้นทางต้องโผล่ได้จริง (อยู่ในสระมอนของภูมิภาคใดภูมิภาคหนึ่ง) — ไม่งั้นหน้าเว็บบอกต้นทางที่ไม่มีวันเจอ
    const pools = new Set(gamedata.regions.flatMap((r) => r.pool ?? []));
    for (const a of gamedata.skillBooks.flatMap((b) => b.elites)) expect(pools.has(a), `EX ${a}`).toBe(true);
    // บอสหอคอยทั้ง 10 ตัวเป็นต้นทางของตำราเล่มใดเล่มหนึ่ง
    for (const boss of gamedata.bosses) expect(bookSourceOf(`f1w10_boss_${boss.id}`), boss.id).toBeDefined();
  });

  it('ต้นทางอ่านจาก id: บอส · EX ดรอป · มอนธรรมดาไม่ดรอป', () => {
    expect(bookSourceOf('f1w10_boss_boss_king_slime')).toBe('venom');
    expect(bookSourceOf('f3w5_ex_wolf')).toBe('flurry');
    expect(bookSourceOf('f3w5_m1_wolf')).toBeUndefined();
  });

  it('เพดานดวง: ล้มต้นทางครบ bookPity ครั้งได้แน่นอน ไม่ว่าดวงไหน', () => {
    const pity = gamedata.acquisition.bookPity;
    for (let seed = 1; seed <= 50; seed++) {
      let counter: Record<string, number> = {};
      let got = false;
      for (let i = 0; i < pity && !got; i++) {
        const r = rollSkillBooks({ events: [kill('f1w10_boss_boss_king_slime')], heroId: HERO, seed: seed * 100 + i, owned: [], pity: counter });
        got = r.dropped.includes('venom');
        counter = r.pity;
      }
      expect(got, `seed ${seed}`).toBe(true);
    }
  });

  it('เล่มที่มีแล้วไม่สุ่มไม่นับ · ได้ในการรบนี้แล้วตัวถัดไปไม่นับซ้ำ · ผลเดิมเมื่อ seed เดิม', () => {
    const events = [kill('f1w10_boss_boss_king_slime'), kill('f1w5_ex_slime'), kill('f1w3_m0_slime')];
    expect(rollSkillBooks({ events, heroId: HERO, seed: 1, owned: ['venom'], pity: { venom: 3 } })).toEqual({ dropped: [], pity: { venom: 3 }, kills: {} });
    const sure = rollSkillBooks({ events, heroId: HERO, seed: 1, owned: [], pity: { venom: gamedata.acquisition.bookPity - 1 } });
    expect(sure.dropped).toEqual(['venom']);
    expect(sure.kills).toEqual({ venom: 1 });
    expect(sure.pity).toEqual({});
    const a = rollSkillBooks({ events, heroId: HERO, seed: 99, owned: [], pity: {} });
    expect(rollSkillBooks({ events, heroId: HERO, seed: 99, owned: [], pity: {} })).toEqual(a);
  });

  it('ได้ตำราแล้วสกิลขึ้นตามอาชีพ · ผู้ฝึกหัดเก็บไว้ก่อนได้ สกิลมาเมื่อเลือกอาชีพ', () => {
    expect(skillsFor('novice', 5, { books: ['venom'] })).toEqual([]);
    expect(skillsFor('mage', 1, { books: ['venom'] }).map((s) => s.id)).toContain('m_toxic_cloud');
  });
});
