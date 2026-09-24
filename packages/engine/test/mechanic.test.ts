/**
 * รอบ 2M — กลไกหมายหัว (docs/design-round2m.md §2)
 *
 * เทสต์ชุดนี้คุม "สัญญากับผู้เล่น" ของกลไก ไม่ใช่ตัวเลขจูน:
 *   1. กลไกอยู่เฉพาะโซนที่ประกาศ และเฉพาะ archetype ที่ประกาศ (หอคอยไม่เปลี่ยน — golden fixture คุมอีกชั้น)
 *   2. ตั้งท่าแล้ว เทิร์นถัดไปของตัวเดียวกันทุบคนที่หมายไว้เสมอ (เว้นแต่มันตายก่อน)
 *   3. has_debuff("marked") เป็นจริงเฉพาะระหว่างตั้งท่ากับทุบ
 *   4. ผู้เล่นได้ลงมือหนึ่งครั้งพอดีระหว่างตั้งท่ากับทุบ ไม่ว่าใครเร็วกว่า (กติกาข้อ 7 ของรอบ 2S)
 */
import { describe, expect, it } from 'vitest';
import {
  buildDerivedStats, buildRegionWaves, buildWaves, enterRegion, gamedata, hashSeed, mulberry32,
  simulateWaves,
} from '../src/index';
import type { CombatEvent, Combatant, WaveSpec } from '../src/types';

const GOLEM = gamedata.monsterArchetypes.find((a) => a.id === 'golem')!;
const FROST = gamedata.regions.find((r) => r.id === 'frostland')!;

const windupOf = (c: Combatant) => (c as Combatant & { windupEvery?: number }).windupEvery;

function hero(level: number, src: string, speedOverride?: number): Combatant {
  const base = gamedata.classes.warrior.baseStats;
  const pts = (level - 1) * 5;
  const stats = { ...base, str: base.str + Math.ceil(pts * 0.6), vit: base.vit + Math.floor(pts * 0.4) };
  const derived = buildDerivedStats('warrior', level, stats, []);
  if (speedOverride !== undefined) derived.speed = speedOverride;
  return {
    id: 'p1', name: 'ทดสอบ', side: 'party', classId: 'warrior', level, stats, derived,
    skills: gamedata.skills.filter((s) => s.classId === 'warrior' && s.unlockLevel <= level).map((s) => s.id),
    rules: [], programSource: src,
  } as Combatant;
}

const READ_PHASE = 'def turn():\n    if has_debuff("marked"):\n        defend()\n    else:\n        attack(weakest(enemies))\n';
const ALWAYS_ATTACK = 'def turn():\n    attack(weakest(enemies))\n';

function frostBattle(level: number, src: string, seed: number, depth = 3) {
  const entry = enterRegion('frostland', depth, 1, seed);
  const rng = mulberry32(hashSeed(seed, entry.floor * 977, 1, 0xba771e));
  return simulateWaves([hero(level, src)], entry.waves, { floor: entry.floor, seed, rng });
}

/** เดินบันทึกการรบ: ทุก windup ต้องตามด้วยการกระทำถัดไปของตัวเดียวกัน = ทุบคนที่หมาย (หรือมันตายก่อน) */
function windupPairs(events: CombatEvent[]) {
  const pairs: { windup: CombatEvent; next?: CombatEvent; between: CombatEvent[] }[] = [];
  events.forEach((ev, i) => {
    if (ev.note !== 'windup') return;
    const between: CombatEvent[] = [];
    let next: CombatEvent | undefined;
    for (let j = i + 1; j < events.length; j++) {
      const e = events[j];
      if (e.note === 'wave_start' || e.note === 'wave_clear') break;
      if (e.actorId === ev.actorId) { next = e; break; }
      between.push(e);
    }
    pairs.push({ windup: ev, next, between });
  });
  return pairs;
}

describe('รอบ 2M — กลไกหมายหัว', () => {
  it('ติดเฉพาะโกเลมในดินแดนน้ำแข็ง (รวมบอส/EX ที่เป็นโกเลม) · โซนอื่นกับหอคอยไม่มี', () => {
    expect(FROST.mechanic).toEqual({ kind: 'windup', archetypes: ['golem'], every: expect.any(Number), guardMult: expect.any(Number) });
    let golems = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const w of buildRegionWaves('frostland', 5, 1, seed)) {
        for (const m of w.monsters) {
          if (m.monsterId === 'golem') { golems++; expect(windupOf(m)).toBe(FROST.mechanic!.every); }
          else expect(windupOf(m)).toBeUndefined();
        }
      }
    }
    expect(golems).toBeGreaterThan(0);
    for (const r of gamedata.regions.filter((x) => x.depths > 0 && x.id !== 'frostland')) {
      for (const w of buildRegionWaves(r.id, 1, 1, 7)) for (const m of w.monsters) expect(windupOf(m)).toBeUndefined();
    }
    // หอคอยมีโกเลมตั้งแต่ชั้น 7 — ต้องไม่ติดกลไก
    for (const w of buildWaves(8, 1, 3)) for (const m of w.monsters) expect(windupOf(m)).toBeUndefined();
  });

  it('EX ที่เป็นโกเลมก็ตั้งท่า', () => {
    let found = 0;
    for (let seed = 1; seed <= 400 && found < 3; seed++) {
      const e = enterRegion('frostland', 4, 1, seed);
      if (e.elite?.archetypeId !== 'golem') continue;
      const ex = e.waves[e.elite.wave - 1].monsters.find((m) => m.id.includes('_ex_'))!;
      expect(windupOf(ex)).toBe(FROST.mechanic!.every);
      found++;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('ตั้งท่าแล้ว เทิร์นถัดไปของตัวเดียวกันทุบคนที่หมายเสมอ', () => {
    let windups = 0, crushes = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = frostBattle(14, ALWAYS_ATTACK, seed);
      for (const { windup, next } of windupPairs(r.events)) {
        windups++;
        if (!next) continue; // มันตายก่อนได้ทุบ หรือเวฟ/การรบจบ
        expect(next.skillId, `หลังตั้งท่า ${windup.actorName} ต้องทุบ`).toBe('mon_crush');
        expect(next.targets[0].id).toBe(windup.targets[0].id);
        crushes++;
      }
      // ไม่มีการทุบที่ไม่ได้ตั้งท่าก่อน
      const crushCount = r.events.filter((e) => e.skillId === 'mon_crush').length;
      expect(crushCount).toBeLessThanOrEqual(r.events.filter((e) => e.note === 'windup').length);
    }
    expect(windups).toBeGreaterThan(10);
    expect(crushes).toBeGreaterThan(5);
  });

  it('has_debuff("marked") จริงเฉพาะระหว่างตั้งท่ากับทุบ — โปรแกรมที่อ่านจังหวะตั้งการ์ดก่อนโดนทุบทุกครั้ง', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = frostBattle(14, READ_PHASE, seed);
      for (const { next, between } of windupPairs(r.events)) {
        const mine = between.filter((e) => e.actorId === 'p1');
        if (!next || next.skillId !== 'mon_crush' || mine.length === 0) continue;
        expect(mine.every((e) => e.action === 'defend'), 'ถูกหมายหัวอยู่แต่ไม่ได้ตั้งการ์ด').toBe(true);
        checked++;
      }
      // นอกช่วงหมายหัว โปรแกรมนี้ต้องไม่ตั้งการ์ดเลย (debuff ไม่ค้าง)
      const defends = r.events.filter((e) => e.actorId === 'p1' && e.action === 'defend').length;
      const windups = r.events.filter((e) => e.note === 'windup').length;
      expect(defends).toBeLessThanOrEqual(windups);
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('ผู้เล่นได้ลงมือหนึ่งครั้งพอดีระหว่างตั้งท่ากับทุบ ไม่ว่าเราเร็วหรือช้ากว่าโกเลม', () => {
    const makeGolem = (): Combatant => {
      const lvl = 10;
      const stats = { ...GOLEM.stats };
      const derived = buildDerivedStats('warrior', lvl, stats, []);
      derived.maxHp *= 20; derived.speed = 50; derived.atk = 5; derived.evasion = 0;
      return {
        id: 'g1', name: 'โกเลม', side: 'enemy', classId: 'monster', level: lvl, stats, derived,
        skills: ['mon_bite'], rules: [], monsterId: 'golem', windupEvery: 2,
      } as Combatant;
    };
    for (const speed of [10, 90]) {
      const waves: WaveSpec[] = [{ monsters: [makeGolem()] }];
      const seed = 99;
      const r = simulateWaves([hero(10, READ_PHASE, speed)], waves,
        { floor: 5, seed, rng: mulberry32(seed), maxRounds: 30 });
      const pairs = windupPairs(r.events).filter((p) => p.next?.skillId === 'mon_crush');
      expect(pairs.length, `speed ${speed}`).toBeGreaterThan(3);
      for (const p of pairs) {
        expect(p.between.filter((e) => e.actorId === 'p1').length, `speed ${speed}`).toBe(1);
      }
    }
  });

  /**
   * สองบทเรียนจากเกณฑ์ M4 (docs/playtest/m4-adversarial.md) ที่ต้องไม่ถอยกลับ:
   *  - ฉบับแรกทุกเวฟเริ่มจังหวะเดียวกัน → โปรแกรมที่นับ turn_no ได้ผลเท่า has_debuff โดยไม่ต้องอ่านสถานะเลย
   *  - ฉบับที่สองสุ่มแยกทีละตัว → โกเลมผลัดกันตั้งท่าจนถูกหมายหัวเกือบตลอด คนอ่านจังหวะโดนหนักขึ้น 2-4 เลเวล
   * ที่ถูกคือ "สุ่มครั้งเดียวต่อเวฟ": ในเวฟเดียวกันตั้งท่าพร้อมกัน · ต่างเวฟเริ่มคนละจังหวะ
   */
  it('โกเลมในเวฟเดียวกันตั้งท่าครั้งแรกพร้อมกัน แต่แต่ละเวฟเริ่มคนละจังหวะ', () => {
    const offsets = new Set<number>();
    let multiGolemWaves = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const r = frostBattle(30, READ_PHASE, seed, 5);
      let waveStart = 0;
      let firstByActor = new Map<string, number>();
      const closeWave = () => {
        const rounds = [...firstByActor.values()];
        if (rounds.length > 1) {
          multiGolemWaves++;
          expect(new Set(rounds).size, `seed ${seed}: โกเลมในเวฟเดียวกันตั้งท่าครั้งแรกคนละรอบ`).toBe(1);
        }
        if (rounds.length > 0) offsets.add(rounds[0] - waveStart);
        firstByActor = new Map();
      };
      for (const e of r.events) {
        if (e.note === 'wave_start') { closeWave(); waveStart = e.turn; continue; }
        if (e.note === 'windup' && !firstByActor.has(e.actorId)) firstByActor.set(e.actorId, e.turn);
      }
      closeWave();
    }
    expect(multiGolemWaves, 'ไม่มีเวฟที่มีโกเลมหลายตัวให้ตรวจเลย').toBeGreaterThan(3);
    expect(offsets.size, 'ทุกเวฟเริ่มจังหวะเดียวกัน = เดาจาก turn_no ได้').toBeGreaterThan(1);
  });

  it('ตั้งการ์ดตอนถูกหมายหัว = โดนทุบเบากว่าคนที่ไม่ตั้ง', () => {
    const avgCrush = (src: string) => {
      const hits: number[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        for (const e of frostBattle(14, src, seed).events) {
          if (e.skillId === 'mon_crush' && !e.targets[0].evaded) hits.push(e.targets[0].damage ?? 0);
        }
      }
      return hits.reduce((a, b) => a + b, 0) / Math.max(1, hits.length);
    };
    expect(avgCrush(READ_PHASE)).toBeLessThan(avgCrush(ALWAYS_ATTACK) * 0.65);
  });
});
