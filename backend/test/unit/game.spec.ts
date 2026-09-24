/**
 * ตรรกะเกมที่ย้ายมาจากเซิร์ฟเวอร์เดิม — ส่วนที่เป็นฟังก์ชันบริสุทธิ์ (ไม่ต้องใช้ฐานข้อมูล)
 * ความเท่ากันกับเซิร์ฟเวอร์เดิมทั้งเส้นทางตรวจด้วย parity test แยกอีกชั้น (ดู REPORT.md)
 */
import { FORMULAS, ZERO_PROFICIENCY, gamedata, getRegion, type RegionDef } from '@tower/engine';
import type { Character, Item } from '../../src/generated/prisma/client';
import { characterView, enrichInstance, proficiencyView } from '../../src/game/character.view';
import { TRIVIAL_PROGRAM } from '../../src/game/game-rules';
import { HERO_ID, buildHero, progress } from '../../src/game/progression';
import { levelBandFor, regionProgress } from '../../src/game/world';
import { checkProgram, formatLangError, langOptions } from '../../src/programs/programs.service';
import { runSeed, textSeed } from '../../src/world/run-seed';

function character(overrides: Partial<Character> = {}): Character {
  const base = gamedata.classes.novice.baseStats;
  return {
    id: '00000000-0000-4000-8000-000000000001', seq: 1, coreUserId: 'user-002', displayName: 'tester',
    classId: 'novice', level: 1, exp: 0,
    statStr: base.str, statInt: base.int, statVit: base.vit, statAgi: base.agi, statLuk: base.luk,
    gold: 100, materials: 0, highestFloor: 0, programSource: TRIVIAL_PROGRAM,
    profStr: 0, profInt: 0, profVit: 0, profAgi: 0, profLuk: 0,
    createdAt: new Date(0), updatedAt: new Date(0),
    ...overrides,
  };
}

describe('progress — แจกแต้มตามงานที่ทำ (รอบ 2P §3.2)', () => {
  it('exp ไม่ถึง → ไม่เลเวลอัพ และงานสะสมถูกเก็บต่อ', () => {
    const work = { ...ZERO_PROFICIENCY, str: 2 };
    const p = progress(character(), work, 1);
    expect(p).toMatchObject({ level: 1, exp: 1, leveledUp: false, carry: work });
  });
  it('ขึ้นหลายเลเวลในการรบเดียว → แต้มครบทุกเลเวล และรีเซ็ตงานสะสม', () => {
    const exp = FORMULAS.expToNext(1) + FORMULAS.expToNext(2) + 3;
    const row = character();
    const p = progress(row, { ...ZERO_PROFICIENCY, str: 5, vit: 1 }, exp);
    expect(p.level).toBe(3);
    expect(p.exp).toBe(3);
    expect(p.carry).toEqual(ZERO_PROFICIENCY);
    const gained = (p.stats.str - row.statStr) + (p.stats.int - row.statInt) + (p.stats.vit - row.statVit)
      + (p.stats.agi - row.statAgi) + (p.stats.luk - row.statLuk);
    expect(gained).toBe(2 * FORMULAS.statPointsPerLevel);
    expect(p.stats.str - row.statStr).toBeGreaterThan(p.stats.int - row.statInt);
  });
});

describe('buildHero', () => {
  it('ใช้ id p1 · ชื่อที่ผู้เล่นตั้ง · โปรแกรมของผู้เล่น', () => {
    const { combatant } = buildHero(character({ displayName: 'นักสู้' }), []);
    expect(combatant).toMatchObject({ id: HERO_ID, name: 'นักสู้', side: 'party', programSource: TRIVIAL_PROGRAM });
  });
  it('อุปกรณ์ที่สวมเพิ่มค่าที่คำนวณแล้ว', () => {
    const base = gamedata.baseItems.find((b) => b.stat === 'atk')!;
    const item = {
      id: 'i1', seq: 1, characterId: 'c', baseId: base.baseId, slot: base.slot, rarity: 'common',
      upgradeLevel: 0, droppedFloor: 3, affixes: [], isEquipped: true, createdAt: new Date(0), updatedAt: new Date(0),
    } as unknown as Item;
    expect(buildHero(character(), [item]).derived.atk).toBeGreaterThan(buildHero(character(), []).derived.atk);
  });
});

describe('มุมมองตัวละครและไอเทม', () => {
  it('characterView มีทุกช่องที่ UI เดิมใช้ + displayName', () => {
    const view = characterView(character(), []);
    expect(Object.keys(view)).toEqual([
      'id', 'displayName', 'classId', 'level', 'exp', 'expToNext', 'proficiency', 'stats', 'derived',
      'gold', 'materials', 'equipment', 'skills', 'highestFloorCleared',
    ]);
    expect(view.equipment).toEqual({ weapon: null, armor: null, helmet: null, accessory: null });
  });
  it('แถบความชำนาญไม่มี agi/luk (ผู้เล่นควบคุมไม่ได้)', () => {
    const v = proficiencyView(character({ profStr: 3, profAgi: 9, profLuk: 9 }));
    expect(Object.keys(v.share)).toEqual(['str', 'int', 'vit']);
    expect(v.usingClassDefault).toBe(false);
  });
  it('main stat ของไอเทมโตตามชั้นที่ดรอปและขั้นตีบวก', () => {
    const base = gamedata.baseItems[0];
    const inst = { id: 'x', baseId: base.baseId, slot: base.slot, rarity: 'common' as const, droppedFloor: 1, affixes: [] };
    const plain = enrichInstance({ ...inst, upgradeLevel: 0 }, false).mainStat.value;
    const upgraded = enrichInstance({ ...inst, upgradeLevel: 5 }, false).mainStat.value;
    expect(upgraded).toBeGreaterThan(plain);
  });
});

describe('ภูมิภาค', () => {
  const tower = getRegion('tower') as RegionDef;
  const frost = getRegion('frostland') as RegionDef;
  it('ปลดล็อกจาก highest_floor · เคลียร์จากใบคะแนนของโซนเอง', () => {
    expect(regionProgress(frost, 3, 0)).toMatchObject({ unlocked: false, maxDepthAllowed: 0 });
    expect(regionProgress(frost, 4, 0)).toMatchObject({ unlocked: true, maxDepthAllowed: 1, depthCleared: 0 });
    expect(regionProgress(frost, 9, 2)).toMatchObject({ maxDepthAllowed: 3, completed: false });
    expect(regionProgress(tower, 0, tower.depths)).toMatchObject({ completed: true, maxDepthAllowed: tower.depths });
  });
  it('ช่วงเลเวลของการดวลสมมาตร (1-5 · 6-10)', () => {
    expect(levelBandFor(1)).toMatchObject({ min: 1, max: 5 });
    expect(levelBandFor(5)).toEqual(levelBandFor(1));
    expect(levelBandFor(6)).toMatchObject({ min: 6, max: 10 });
  });
  it('seed ของรอบคิดจากแถวล้วน ๆ — ค่าเดิมได้ seed เดิม', () => {
    const key = { characterSeq: 3, regionId: 'frostland', depth: 2, enteredAt: new Date(1_790_000_000_123) };
    expect(runSeed(key)).toBe(runSeed({ ...key }));
    expect(runSeed(key)).not.toBe(runSeed({ ...key, characterSeq: 4 }));
    expect(textSeed('tower')).not.toBe(textSeed('towel'));
  });
});

describe('ตรวจโปรแกรม BloxCode', () => {
  const novice = langOptions(character());
  it('โปรแกรมพื้นฐานผ่านตั้งแต่ชั้น 0', () => {
    expect(checkProgram(TRIVIAL_PROGRAM, novice)).toEqual([]);
  });
  it('สะกดผิด → NameError พร้อมเลขบรรทัด ในรูป "บรรทัด:คอลัมน์:ชื่อ:ข้อความ"', () => {
    const errors = checkProgram('def turn():\n    atack(weakest(enemies))\n', novice);
    expect(errors[0].name).toBe('NameError');
    expect(formatLangError(errors[0])).toMatch(/^2:\d+:NameError:/);
  });
  it('ไวยากรณ์ที่ยังไม่ปลดล็อก (string ก่อนผ่านชั้น 2) → ถูกปฏิเสธ', () => {
    const errors = checkProgram('def turn():\n    cast("fireball", weakest(enemies))\n', novice);
    expect(errors.length).toBeGreaterThan(0);
  });
  it('ยาวเกิน 20000 ตัวอักษร → ปฏิเสธก่อนเข้า parser', () => {
    expect(checkProgram(`#${'x'.repeat(20001)}`, novice)[0].line).toBe(1);
  });
});
