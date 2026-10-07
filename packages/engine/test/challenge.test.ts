/**
 * มอนของโจทย์ (docs/design-challenge-monsters.md) — สัญญาที่ต้องไม่หลุด
 *   1. ตรวจค่าที่อาจารย์ตั้งครบทุกช่อง และชี้ช่องด้วย path `monsters.<i>.<field>`
 *   2. สเตตัสคิดด้วยสูตรเดียวกับมอนในหอคอย · ตัวคูณคูณ HP / ดาเมจจริง
 *   3. โปรแกรมของอาจารย์ถูกใช้ตอนรบจริง · ไม่เขียน = พฤติกรรมตามบทบาทของต้นแบบ
 *   4. engine ไม่แจกรางวัลเอง (EXP · ทอง · ของ = 0) · ผลซ้ำได้ด้วย seed เดิม
 *   5. รางวัลชนะครั้งแรกคิดจากเลเวลผู้เล่นเท่านั้น
 */
import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_MONSTER_LIMITS, CHALLENGE_TRIAL_CLASSES, FORMULAS, buildChallengeWave, buildDerivedStats, challengeArchetypes,
  challengeMonsterIssues, challengeReward, challengeSkillInfo, checkMonsterProgram, checkProgramWithSkills, gamedata,
  runChallengeBattle, trialHeroStats, type ChallengeMonsterSpec,
} from '../src/index';
import type { Combatant } from '../src/types';
import { makeMonster } from '../src/waves';

function hero(level: number, src = 'def turn():\n    attack(weakest(enemies))\n'): Combatant {
  const base = gamedata.classes.warrior.baseStats;
  const pts = (level - 1) * 5;
  const stats = { ...base, str: base.str + Math.ceil(pts * 0.6), vit: base.vit + Math.floor(pts * 0.4) };
  return {
    id: 'p1', name: 'ทดสอบ', side: 'party', classId: 'warrior', level, stats,
    derived: buildDerivedStats('warrior', level, stats, []),
    skills: [], rules: [], programSource: src,
  } as Combatant;
}

const slime = (over: Partial<ChallengeMonsterSpec> = {}): ChallengeMonsterSpec => ({
  name: 'สไลม์ของอาจารย์', archetypeId: 'slime', level: 1, hpMult: 1, dmgMult: 1, skills: [], ...over,
});

describe('ตรวจค่าที่อาจารย์ตั้ง', () => {
  it('ค่าในขอบเขตผ่าน · โปรแกรมที่ใช้สกิลของมอนเองผ่าน', () => {
    expect(challengeMonsterIssues([slime()])).toEqual([]);
    expect(challengeMonsterIssues([
      slime({ skills: ['mon_bite', 'mon_roar'], programSource: 'def turn():\n    if me.hp_pct < 50:\n        cast("roar", random_of(enemies))\n    else:\n        cast("bite", weakest(enemies))\n' }),
    ])).toEqual([]);
  });

  it('ทุกช่องที่ผิดถูกชี้ด้วย path ของช่องนั้น', () => {
    const L = CHALLENGE_MONSTER_LIMITS;
    const issues = challengeMonsterIssues([
      slime(),
      slime({
        name: ' ', archetypeId: 'dragon', level: L.levelMax + 1, hpMult: L.hpMultMax + 1,
        dmgMult: L.dmgMultMin / 2, skills: ['m_firebolt'],
      }),
    ]);
    expect(issues.map((i) => i.field).sort()).toEqual([
      'monsters.1.archetypeId', 'monsters.1.dmgMult', 'monsters.1.hpMult', 'monsters.1.level', 'monsters.1.name', 'monsters.1.skills',
    ]);
  });

  it('เกิน 4 ตัว · เลเวลไม่ใช่จำนวนเต็ม · สกิลซ้ำ · สกิลเกิน 3', () => {
    expect(challengeMonsterIssues(Array.from({ length: 5 }, () => slime())).map((i) => i.field)).toContain('monsters');
    expect(challengeMonsterIssues([slime({ level: 2.5 })]).map((i) => i.field)).toEqual(['monsters.0.level']);
    expect(challengeMonsterIssues([slime({ skills: ['mon_bite', 'mon_bite'] })]).map((i) => i.field)).toEqual(['monsters.0.skills']);
    expect(challengeMonsterIssues([slime({ skills: ['mon_bite', 'mon_roar', 'mon_dark_bolt', 'mon_crush'] })]).map((i) => i.field))
      .toEqual(['monsters.0.skills']);
  });

  it('โปรแกรมของมอน: ไวยากรณ์ผิด · ใช้สกิลที่มอนตัวนี้ไม่มี → ชี้ที่ programSource พร้อมบรรทัด', () => {
    const bad = challengeMonsterIssues([slime({ programSource: 'attack()' })]);
    expect(bad).toHaveLength(1);
    expect(bad[0].field).toBe('monsters.0.programSource');
    expect(bad[0].messageTh).toMatch(/^1:1:SyntaxError:/);
    // สไลม์มีแค่ "กัด" — ร่ายศรมืดไม่ได้
    const noSkill = challengeMonsterIssues([slime({ programSource: 'def turn():\n    cast("dark_bolt", weakest(enemies))\n' })]);
    expect(noSkill.map((i) => i.field)).toEqual(['monsters.0.programSource']);
    // ข้อความพูดกับผู้สอนเรื่องมอน — ไม่ใช่ข้อความของผู้เล่น ("ปลดที่เลเวล" · "สกิลของmonster" · "ที่คุณใช้ได้")
    expect(noSkill[0].messageTh).toBe(
      "2:10:ValueError:มอนตัวนี้ไม่มีสกิล 'dark_bolt' — เลือกสกิลนี้ในช่องสกิลของมอน หรือใช้สกิลที่มอนมี: bite",
    );
    const picked = challengeMonsterIssues([slime({ skills: ['mon_roar'], programSource: 'def turn():\n    cast("bite", weakest(enemies))\n' })]);
    expect(picked[0].messageTh).toMatch(/มอนตัวนี้ไม่มีสกิล 'bite' — .*สกิลที่มอนมี: roar$/);
  });
});

describe('สร้างมอนของโจทย์', () => {
  it('สูตรเดียวกับมอนหอคอย · ตัวคูณ HP/ดาเมจมีผลจริง · id มีต้นแบบต่อท้าย', () => {
    const arch = gamedata.monsterArchetypes.find((a) => a.id === 'orc')!;
    const tower = makeMonster(arch, 12, 'x', { coopMult: 1 });
    const [plain, buffed] = buildChallengeWave([
      slime({ archetypeId: 'orc', level: 12 }),
      slime({ archetypeId: 'orc', level: 12, hpMult: 2, dmgMult: 1.5 }),
    ]).monsters;
    expect(plain.derived.maxHp).toBe(tower.derived.maxHp);
    expect(plain.derived.atk).toBe(tower.derived.atk);
    expect(buffed.derived.maxHp).toBeGreaterThan(plain.derived.maxHp * 1.95);
    expect(buffed.derived.atk).toBeGreaterThan(plain.derived.atk * 1.45);
    expect(plain.id).toBe('ch_m1_orc');
    expect(buffed.id).toBe('ch_m2_orc');
    expect(plain.monsterId).toBe('orc');
    expect(plain.skills).toEqual(arch.skills);
    expect(plain.name).toBe('สไลม์ของอาจารย์');
    expect('programSource' in plain).toBe(false);
  });
});

describe('สู้กับมอนของโจทย์', () => {
  it('engine ไม่แจกรางวัลเอง · seed เดิมได้ผลเดิมทุกไบต์', () => {
    const specs = [slime({ level: 3 }), slime({ archetypeId: 'goblin', level: 3 })];
    const a = runChallengeBattle(hero(5), specs, 42);
    const b = runChallengeBattle(hero(5), specs, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.expGained).toBe(0);
    expect(a.drops.gold).toBe(0);
    expect(a.drops.materials).toBe(0);
    expect(a.drops.items).toEqual([]);
  });

  it('มอนอ่อนแพ้ผู้เล่นเลเวลสูง · มอนที่อาจารย์ตั้งให้แรงชนะผู้เล่นเลเวล 1', () => {
    expect(runChallengeBattle(hero(10), [slime()], 7).victory).toBe(true);
    const wall = slime({ archetypeId: 'golem', level: 40, hpMult: 5, dmgMult: 3 });
    expect(runChallengeBattle(hero(1), [wall], 7).victory).toBe(false);
  });

  it('โปรแกรมของอาจารย์ถูกใช้จริง: มอนที่ตั้งให้ defend() ไม่ตีใครเลย', () => {
    const guard = slime({ level: 5, hpMult: 3, programSource: 'def turn():\n    defend()\n' });
    const r = runChallengeBattle(hero(3), [guard], 11);
    const monsterTurns = r.events.filter((e) => e.actorId === 'ch_m1_slime');
    expect(monsterTurns.length).toBeGreaterThan(0);
    expect(monsterTurns.every((e) => e.action === 'defend')).toBe(true);
    // ไม่เขียนโปรแกรม = ตีตามบทบาทของต้นแบบ
    const plain = runChallengeBattle(hero(3), [slime({ level: 5, hpMult: 3 })], 11);
    expect(plain.events.some((e) => e.actorId === 'ch_m1_slime' && e.action !== 'defend')).toBe(true);
  });
});

describe('รางวัลชนะครั้งแรก', () => {
  it('คิดจากเลเวลผู้เล่น: EXP 10% ของเลเวลถัดไป · ทอง 15 + 9 × เลเวล', () => {
    for (const level of [1, 5, 10, 30]) {
      expect(challengeReward(level)).toEqual({
        exp: Math.max(1, Math.round(FORMULAS.expToNext(level) * 0.1)),
        gold: 15 + 9 * level,
      });
    }
    expect(challengeReward(0)).toEqual(challengeReward(1));
  });
});

describe('ข้อมูลให้ฟอร์มของผู้สอน', () => {
  it('ต้นแบบครบทุกตัวพร้อมโปรแกรมตามบทบาทที่ตรวจผ่าน · สกิลที่เลือกได้มีชื่อสำหรับ cast()', () => {
    const archs = challengeArchetypes();
    expect(archs.map((a) => a.id)).toEqual(gamedata.monsterArchetypes.map((a) => a.id));
    for (const a of archs) {
      expect(a.defaultProgram, a.id).toMatch(/def turn\(\):/);
      expect(checkMonsterProgram(a.defaultProgram, a.skills), a.id).toEqual([]);
    }
    expect(challengeSkillInfo().map((s) => [s.id, s.castName])).toEqual([
      ['mon_bite', 'bite'], ['mon_dark_bolt', 'dark_bolt'], ['mon_roar', 'roar'],
    ]);
  });
});

describe('ตัวละครตัวอย่างตอนทดลองสู้ (ข้อ M7)', () => {
  const sum = (s: { str: number; int: number; vit: number; agi: number; luk: number }) => s.str + s.int + s.vit + s.agi + s.luk;

  it('เลเวล 1 = ค่าตั้งต้นของอาชีพ · ทุกเลเวลที่เพิ่มได้แต้มครบเท่าการเลเวลอัพจริง', () => {
    for (const c of CHALLENGE_TRIAL_CLASSES) {
      const base = gamedata.classes[c].baseStats;
      expect(trialHeroStats(c, 1)).toEqual(base);
      expect(sum(trialHeroStats(c, 20))).toBe(sum(base) + FORMULAS.statPointsPerLevel * 19);
    }
  });

  it('แต้มไปตามน้ำหนักมาตรฐานของอาชีพ: นักรบ STR นำ · จอมเวท INT นำ', () => {
    const w = trialHeroStats('warrior', 20);
    const m = trialHeroStats('mage', 20);
    expect(w.str).toBeGreaterThan(w.int);
    expect(m.int).toBeGreaterThan(m.str);
  });

  it('ตรวจโปรแกรมของตัวละครตัวอย่างได้ข้อความของผู้เล่น (ไม่ใช่ข้อความของมอน)', () => {
    const errs = checkProgramWithSkills('def turn():\n    cast("firebolt", weakest(enemies))\n', []);
    expect(errs).toHaveLength(1);
    expect(errs[0].messageTh).toMatch(/^ยังใช้สกิล 'firebolt' ไม่ได้/);
    expect(checkProgramWithSkills('def turn():\n    attack(weakest(enemies))\n', [])).toEqual([]);
  });
});
