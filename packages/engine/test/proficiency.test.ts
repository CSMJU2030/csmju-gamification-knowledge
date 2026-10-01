/**
 * ค่าความชำนาญ (docs/design-round2p.md §3.2)
 *
 * เทสต์ชุดนี้ตอบสองคำถาม:
 *   1. allocatePoints แจกแต้มถูกไหม — รวมได้ N พอดีเสมอ แม้สัดส่วนจะปัดยาก
 *   2. proficiencyFromBattle อ่านการรบจริงแล้วสรุป "บิลด์" ได้ตรงกับสิ่งที่โปรแกรมทำจริงไหม
 *
 * ข้อ 2 ใช้การรบจริงจาก runBattle ทั้งหมด ไม่มีเหตุการณ์ปลอมที่เขียนมือ — เพราะสิ่งที่
 * ต้องพิสูจน์คือ "อ่านเหตุการณ์ที่ engine สร้างจริงได้ถูก" ไม่ใช่ "อ่านเหตุการณ์ที่เราแต่งเองได้ถูก"
 */
import { describe, expect, it } from 'vitest';
import {
  allocatePoints, buildDerivedStats, gamedata, proficiencyFromBattle, runBattle,
  CLASS_DEFAULT_WEIGHTS, FORMULAS, PASSIVE_POINTS_PER_LEVEL, PASSIVE_STATS,
  PROFICIENCY_STATS, PROFICIENCY_WEIGHTS, ZERO_PROFICIENCY,
} from '../src/index';
import type {
  BaseStats, BattleResult, ClassId, Combatant, Proficiency,
} from '../src/types';
import { mulberry32 } from '../src/rng';

// ------------------------------------------------------------------ helpers
const STATS = ['str', 'int', 'vit', 'agi', 'luk'] as const;
const sum = (s: BaseStats) => STATS.reduce((acc, k) => acc + s[k], 0);
const work = (over: Partial<Proficiency>): Proficiency => ({ ...ZERO_PROFICIENCY, ...over });
const topStat = (s: BaseStats) =>
  STATS.reduce((best, k) => (s[k] > s[best] ? k : best), 'str' as (typeof STATS)[number]);

const HERO_ID = 'hero';

/** ตัวละครทดสอบ: แจกแต้มตามสัดส่วนที่สั่ง แล้วขับด้วยโปรแกรม BloxCode */
function hero(classId: ClassId, level: number, source: string, alloc: Partial<BaseStats> = {}): Combatant {
  const stats: BaseStats = { ...gamedata.classes[classId].baseStats };
  const points = (level - 1) * FORMULAS.statPointsPerLevel;
  for (const [k, weight] of Object.entries(alloc)) {
    stats[k as keyof BaseStats] += Math.round(points * (weight as number));
  }
  const skills = gamedata.skills
    .filter((s) => s.classId === classId && s.unlockLevel <= level)
    .map((s) => s.id);
  return {
    id: HERO_ID,
    name: 'Hero',
    side: 'party',
    classId,
    level,
    stats,
    derived: buildDerivedStats(classId, level, stats, []),
    skills,
    rules: gamedata.defaultRules[classId],
    ...{ programSource: source },
  } as Combatant;
}

function fight(h: Combatant, floor: number, seed = 424242) {
  const result = runBattle([h], floor, seed);
  return { result, prof: proficiencyFromBattle(result, HERO_ID, h.derived.maxHp) };
}

const ATTACK_ONLY = 'def turn():\n    attack(weakest(enemies))\n';

// =========================================================== allocatePoints
describe('allocatePoints — แจกแต้มตามสัดส่วนงาน', () => {
  /**
   * ข้อบังคับเหล็ก: รวมได้ N พอดีเสมอ
   * ถ้าพลาดข้อนี้ "พลังรวมที่เลเวล N" จะไม่คงที่ ซึ่งทำให้เทสต์ balance เดิมทั้งชุดใช้ไม่ได้
   */
  it('รวมได้ N พอดีเสมอ รวมสัดส่วนที่ปัดยาก (1/3, 1/7) และงานเป็นศูนย์', () => {
    const cases: [string, Proficiency][] = [
      ['1/3', work({ str: 1, int: 1, vit: 1 })],             // 1/3 ลงตัวไม่ได้ในฐาน 10
      ['1/7', work({ str: 3, int: 2, vit: 2 })],             // ส่วนละ 1/7
      ['งานเป็นศูนย์', { ...ZERO_PROFICIENCY }],
      ['สเตตัสเดียว', work({ str: 10 })],
      ['งานอยู่ในช่องที่ไม่แจกแล้ว (agi/luk)', work({ agi: 5, luk: 5 })],
      ['เศษยาว', work({ str: 1 / 3, int: 1 / 7, vit: 1 / 11 })],
    ];
    for (const [name, w] of cases) {
      for (const classId of Object.keys(gamedata.classes) as ClassId[]) {
        for (const points of [0, 1, 2, 3, 4, 5, 7, 20, 25, 33, 100]) {
          for (const level of [2, 3]) {
            const got = allocatePoints(w, points, classId, level);
            expect(sum(got), `${name} / ${classId} / ${points} แต้ม / lv${level} → ${JSON.stringify(got)}`)
              .toBe(points);
            for (const k of STATS) expect(Number.isInteger(got[k])).toBe(true);
          }
        }
      }
    }
  });

  it('สัดส่วนสุ่ม 2000 ชุดก็ยังรวมได้ N พอดี', () => {
    const rng = mulberry32(20260919); // คงที่ เพื่อให้เทสต์ล้มซ้ำได้เสมอถ้ามันล้ม
    for (let i = 0; i < 2000; i++) {
      const w = work({
        str: rng() * 10, int: rng() * 10, vit: rng() * 10, agi: rng() * 10, luk: rng() * 10,
      });
      const points = Math.floor(rng() * 60);
      const level = 1 + Math.floor(rng() * 40);
      expect(sum(allocatePoints(w, points, 'warrior', level))).toBe(points);
    }
  });

  /**
   * AGI/LUK ไม่ใช่ความชำนาญอีกแล้ว (types.ts §PASSIVE_STATS) — โปรแกรมไล่ตามมันไม่ได้
   * มันต้องโตเองเลเวลละ PASSIVE_POINTS_PER_LEVEL แต้ม ไม่ว่าผู้เล่นจะทำอะไรมา
   * นี่คือข้อที่พังในรอบแรก: ผู้พิทักษ์สายตันได้ AGI 3 จาก 5 แต้มโดยไม่มีใครตั้งใจ
   */
  it('AGI/LUK ได้แต้มเฉื่อยคงที่เสมอ ไม่ว่างานจะเป็นอะไร', () => {
    const anyWork: Proficiency[] = [
      { ...ZERO_PROFICIENCY },
      work({ agi: 999, luk: 999 }),   // ต่อให้ "งาน" ของ agi/luk สูงลิ่วก็ต้องไม่ได้เพิ่ม
      work({ str: 5, int: 5, vit: 5 }),
    ];
    for (const w of anyWork) {
      for (const level of [2, 3, 4, 5]) {
        const got = allocatePoints(w, FORMULAS.statPointsPerLevel, 'guardian', level);
        const passive = PASSIVE_STATS.reduce((n, k) => n + got[k], 0);
        expect(passive, `lv${level} / ${JSON.stringify(w)}`).toBe(PASSIVE_POINTS_PER_LEVEL);
        const prof = PROFICIENCY_STATS.reduce((n, k) => n + got[k], 0);
        expect(prof).toBe(FORMULAS.statPointsPerLevel - PASSIVE_POINTS_PER_LEVEL);
      }
    }
  });

  it('แต้มเฉื่อยสลับ AGI/LUK ตามเลขคี่/คู่ของเลเวล — สองเลเวลติดกันได้ฝ่ายละหนึ่ง', () => {
    const w = work({ str: 1 });
    const odd = allocatePoints(w, 5, 'warrior', 3);
    const even = allocatePoints(w, 5, 'warrior', 4);
    expect(odd.agi).toBe(1);
    expect(odd.luk).toBe(0);
    expect(even.agi).toBe(0);
    expect(even.luk).toBe(1);
    // ก้อนใหญ่ (migrate แต้มค้างหลายเลเวล) ต้องแบ่งให้ใกล้เคียงกัน ไม่เทไปข้างเดียว
    const batch = allocatePoints(w, 5 * 8, 'warrior', 3);
    expect(batch.agi + batch.luk).toBe(8 * PASSIVE_POINTS_PER_LEVEL);
    expect(Math.abs(batch.agi - batch.luk)).toBeLessThanOrEqual(1);
  });

  it('แต้มความชำนาญไปอยู่ใน str/int/vit เท่านั้น', () => {
    const got = allocatePoints(work({ str: 1, int: 1, vit: 1 }), 25, 'warrior', 3);
    expect(got.agi + got.luk).toBe(5 * PASSIVE_POINTS_PER_LEVEL);
    expect(got.str + got.int + got.vit).toBe(20);
  });

  it('งานเป็นศูนย์ทั้งหมด → ใช้น้ำหนักมาตรฐานของคลาสนั้น (เฉพาะสามช่อง)', () => {
    for (const classId of Object.keys(gamedata.classes) as ClassId[]) {
      const got = allocatePoints({ ...ZERO_PROFICIENCY }, 100, classId, 3);
      const dflt = CLASS_DEFAULT_WEIGHTS[classId];
      const profPoints = PROFICIENCY_STATS.reduce((n, k) => n + got[k], 0);
      const dfltSum = PROFICIENCY_STATS.reduce((n, k) => n + dflt[k], 0);
      const wantTop = PROFICIENCY_STATS.reduce((best, k) => (dflt[k] > dflt[best] ? k : best));
      expect(topStat(got), `${classId} ควรเอียงไปทาง ${wantTop}`).toBe(wantTop);
      // สัดส่วนต้องตามน้ำหนักจริง ไม่ใช่แค่ตัวที่มากที่สุดบังเอิญตรง
      for (const k of PROFICIENCY_STATS) {
        const want = (profPoints * dflt[k]) / dfltSum;
        expect(got[k], `${classId}.${k}`).toBeGreaterThanOrEqual(Math.floor(want));
        expect(got[k], `${classId}.${k}`).toBeLessThanOrEqual(Math.ceil(want));
      }
    }
  });

  it('งานเป็นบวกในช่องไหน แต้มต้องไปช่องนั้น ไม่ใช่ไปตามคลาส', () => {
    // จอมเวทที่เอาแต่ตี (int ไม่มีงานเลย) ต้องได้ str ไม่ใช่ int
    const got = allocatePoints(work({ str: 30 }), 5, 'mage', 3);
    expect(topStat(got)).toBe('str');
    expect(got.int).toBe(0);
  });

  /**
   * PROFICIENCY_WEIGHTS มีไว้แปลงหน่วย: งาน VIT หนึ่งหน่วย (รับดาเมจเท่าหลอดตัวเอง)
   * ต้องมีค่ามากกว่างาน STR หนึ่งหน่วย (ล้มศัตรูหนึ่งตัว) เพราะรันหนึ่งรอบล้มศัตรูได้ ~26 ตัว
   * แต่รับดาเมจได้แค่ ~1 หลอด — ถ้าน้ำหนักไม่ถูกใช้ สายตันจะแพ้สายตีตลอดกาล
   */
  it('งาน VIT ถูกคูณด้วย PROFICIENCY_WEIGHTS ก่อนเทียบกับ STR', () => {
    const wv = PROFICIENCY_WEIGHTS.vit;
    // งาน str เท่ากับงาน vit ที่ถ่วงน้ำหนักแล้วพอดี → ต้องได้แต้มเท่ากัน
    const balanced = allocatePoints(work({ str: wv, vit: 1 }), 5, 'warrior', 3);
    expect(balanced.str).toBe(balanced.vit);
    // งาน vit น้อยกว่าครึ่งของจุดสมดุล → str ต้องนำ
    const strLeads = allocatePoints(work({ str: wv, vit: 0.2 }), 5, 'warrior', 3);
    expect(strLeads.str).toBeGreaterThan(strLeads.vit);
  });

  it('ผลลัพธ์ซ้ำได้เสมอ (deterministic) สำหรับ input เดียวกัน', () => {
    const w = work({ str: 1, int: 1, vit: 1, agi: 1, luk: 1 });
    expect(allocatePoints(w, 7, 'warrior', 3)).toEqual(allocatePoints(w, 7, 'warrior', 3));
  });
});

// ==================================================== proficiencyFromBattle
describe('proficiencyFromBattle — อ่านการรบจริง', () => {
  /**
   * หลักฐานว่า "หารด้วย maxHp ของเป้า" ทำงานถูกจริง:
   * ถ้าตัวหารคือ maxHp จริงของเป้า การล้มศัตรูหนึ่งตัวด้วยดาเมจกายภาพล้วนต้องได้ STR
   * พอดี 1.0 เสมอ (ผลรวมดาเมจที่นับได้ = หลอดเลือดหนึ่งหลอดพอดี ไม่ว่าจะตีกี่ครั้ง)
   * → STR ทั้งการรบต้องเท่ากับ "จำนวนศัตรูที่ฆ่าได้" เป๊ะ ๆ เป็นจำนวนเต็ม
   */
  it('STR ของนักรบที่ตีอย่างเดียว = จำนวนศัตรูที่ฆ่าได้พอดี (ตัวหาร maxHp ถูกต้อง)', () => {
    for (const [level, floor] of [[10, 1], [10, 3], [20, 5], [30, 8]] as const) {
      const { result, prof } = fight(hero('warrior', level, ATTACK_ONLY, { str: 0.6, vit: 0.4 }), floor);
      const killed = new Set<string>();
      for (const e of result.events) for (const t of e.targets) if (t.killed) killed.add(t.id);
      expect(killed.size, `ชั้น ${floor} ต้องมีศัตรูตายจริง`).toBeGreaterThan(5);
      expect(prof.str, `lv${level} ชั้น ${floor}`).toBeCloseTo(killed.size, 6);
    }
  });

  it('นักรบที่ตีอย่างเดียว → STR เด่นชัด และไม่มีงานเวทเลย', () => {
    const h = hero('warrior', 8, ATTACK_ONLY, { str: 0.6, vit: 0.4 });
    const { prof } = fight(h, 3);
    expect(prof.int).toBe(0);
    expect(prof.str).toBeGreaterThan(prof.vit + prof.int + prof.agi + prof.luk);
    expect(topStat(allocatePoints(prof, 5, 'warrior', 3))).toBe('str');
  });

  it('จอมเวทที่ร่ายอย่างเดียว → INT เด่นชัด และไม่มีงานกายภาพเลย', () => {
    const h = hero('mage', 8, 'def turn():\n    cast("firebolt", weakest(enemies))\n', { int: 0.8, vit: 0.2 });
    const { prof } = fight(h, 3);
    expect(prof.str).toBe(0);
    expect(prof.int).toBeGreaterThan(prof.vit + prof.str + prof.agi + prof.luk);
    expect(topStat(allocatePoints(prof, 5, 'mage', 3))).toBe('int');
  });

  /**
   * "อึด" ต้องมาจากการรับของหนักแล้วรอด ไม่ใช่การกดปุ่มป้องกันบ่อย ๆ
   * คนที่ defend อย่างเดียวจึงต้องได้ VIT เด่น — และต้องไม่ได้ STR/INT เลยเพราะไม่ได้ทำอะไรใส่ใคร
   */
  it('คนที่กด defend อย่างเดียวแล้วโดนตี → VIT เด่นชัด', () => {
    const h = hero('guardian', 8, 'def turn():\n    defend()\n', { vit: 0.7, str: 0.3 });
    const { prof } = fight(h, 3);
    expect(prof.str).toBe(0);
    expect(prof.int).toBe(0);
    expect(prof.vit).toBeGreaterThan(0);
    expect(prof.vit).toBeGreaterThan(prof.agi + prof.luk);
    expect(topStat(allocatePoints(prof, 5, 'guardian', 3))).toBe('vit');
  });

  it('กด defend แล้วโดนตี ได้ VIT มากกว่าโดนตีเท่ากันแบบไม่ตั้งการ์ด (ดาเมจที่กันได้นับด้วย)', () => {
    const stats = { vit: 0.7, str: 0.3 };
    const guarded = fight(hero('guardian', 8, 'def turn():\n    defend()\n', stats), 3).prof;
    const idle = fight(hero('guardian', 8, 'def turn():\n    wait()\n', stats), 3).prof;
    // ทั้งสองแบบไม่ตอบโต้เหมือนกัน ต่างกันแค่ตั้งการ์ดหรือไม่
    expect(guarded.vit).toBeGreaterThan(idle.vit);
  });

  it('ฮีลเข้า INT (เวทสนับสนุน) ไม่ใช่ VIT', () => {
    const src = 'def turn():\n'
      + '    if me.hp_pct < 70:\n'
      + '        cast("heal", me)\n'
      + '    else:\n'
      + '        attack(weakest(enemies))\n';
    const h = hero('mage', 12, src, { int: 0.8, vit: 0.2 });
    const { result, prof } = fight(h, 3);
    const healed = result.events.some((e) => e.actorId === HERO_ID && e.targets.some((t) => (t.heal ?? 0) > 0));
    expect(healed, 'การรบนี้ต้องมีการฮีลจริง ไม่งั้นเทสต์ไม่ได้วัดอะไร').toBe(true);
    // โปรแกรมนี้ไม่มีดาเมจเวทเลย งาน int ทั้งก้อนจึงมาจากฮีลอย่างเดียว
    expect(prof.int).toBeGreaterThan(0);
  });

  /**
   * แก้รอบสอง (คำสั่ง PM 19 ก.ย. 2026): โล่และการยั่วยุเข้า VIT ไม่ใช่ INT
   * เพราะแบ่งช่องตาม "สไตล์การเล่น" ไม่ใช่ตามสเตตัสที่คูณค่าให้ —
   * คนกางโล่คือคนเล่นสายตัน ต่อให้สูตรจะคิดค่าโล่จาก matk ก็ตาม
   */
  it('กางโล่เข้า VIT ไม่ใช่ INT', () => {
    const src = 'def turn():\n'
      + '    if me.hp_pct < 80:\n'
      + '        cast("barrier", me)\n'
      + '    else:\n'
      + '        attack(weakest(enemies))\n';
    const h = hero('guardian', 8, src, { vit: 0.7, str: 0.3 });
    const { result, prof } = fight(h, 5);
    const shielded = result.events.some(
      (e) => e.actorId === HERO_ID && e.targets.some((t) => (t.shield ?? 0) > 0),
    );
    expect(shielded, 'การรบนี้ต้องมีการกางโล่จริง').toBe(true);
    expect(prof.int, 'โล่ต้องไม่เข้า INT อีกแล้ว').toBe(0);
    expect(prof.vit).toBeGreaterThan(0);
  });

  it('ยั่วยุเข้า VIT — ก่อนหน้านี้ไม่เข้าช่องไหนเลย', () => {
    const src = 'def turn():\n'
      + '    if count(enemies) >= 2:\n'
      + '        cast("taunt", deadliest(enemies))\n'
      + '    else:\n'
      + '        attack(weakest(enemies))\n';
    const taunter = hero('guardian', 15, src, { vit: 0.7, str: 0.3 });
    const plain = hero('guardian', 15, ATTACK_ONLY, { vit: 0.7, str: 0.3 });
    const a = fight(taunter, 3, 99001);
    const b = fight(plain, 3, 99001);
    const taunts = a.result.events.filter((e) => e.actorId === HERO_ID && e.skillId === 'g_taunt').length;
    expect(taunts, 'ต้องมีการยั่วยุจริง').toBeGreaterThan(5);
    expect(a.prof.vit).toBeGreaterThan(b.prof.vit * 2);
    expect(a.prof.int, 'ยั่วยุต้องไม่หลุดไปเข้า INT').toBe(0);
    // งาน VIT ต้องโตตาม "จำนวนเทิร์นที่เลือกยั่วยุ" ไม่ใช่แค่ดาเมจที่บังเอิญโดน
    // (ค่าจริงต่อครั้งคือ DEFENSIVE_TURN_WORK = 0.25 ตั้งขั้นต่ำไว้ 0.1 เผื่อการจูน)
    expect(a.prof.vit, `ยั่วยุ ${taunts} ครั้งต้องมีค่าในตัวมันเอง`)
      .toBeGreaterThan(taunts * 0.1);
  });

  /**
   * AGI/LUK ยังถูกวัดอยู่ (ใช้โชว์ว่าเกิดอะไรขึ้นในการรบ) แต่ไม่มีผลกับการแจกแต้มแล้ว
   * เทสต์นี้กันไม่ให้ใครเผลอเอามันกลับเข้าสูตร: วัดต่อได้ แต่ห้ามแปลงเป็นแต้ม
   */
  it('AGI ยังถูกวัด (หลบ/ลงมือก่อน) แต่ไม่กลายเป็นแต้ม', () => {
    /**
     * ใช้ชั้น 1 ไม่ใช่ชั้น 2 (แก้ 19 ก.ย. 2026)
     *
     * เดิมวัดที่ชั้น 2 แล้วเทสต์แดงตอน PM จูน balance เพราะตั้งแต่ชั้น 2 ขึ้นไป
     * ทุกเวฟมีมอนเลือดหนา+ตีแรง (เกณฑ์ B1) ตัวที่อัด AGI ล้วนจึงตายก่อน
     * ได้จำนวนเทิร์นน้อยกว่า แล้ว "ลงมือก่อนศัตรู" เลยน้อยกว่าทั้งที่เร็วกว่า
     *
     * บทเรียน: เทสต์ที่วัด "ใครได้งานมากกว่า" ห้ามวางไว้ในสภาพที่ผลขึ้นกับว่าใครรอดนานกว่า
     * ไม่งั้นมันจะกลายเป็นเทสต์ของ balance แทนที่จะเป็นเทสต์ของสูตรความชำนาญ
     */
    const fast = fight(hero('warrior', 12, ATTACK_ONLY, { agi: 1 }), 1).prof;
    const slow = fight(hero('warrior', 12, ATTACK_ONLY, { str: 1 }), 1).prof;
    expect(fast.agi).toBeGreaterThan(slow.agi);
    expect(allocatePoints(fast, 5, 'warrior', 3).agi)
      .toBe(allocatePoints(slow, 5, 'warrior', 3).agi);
  });
});

// ================================================= เกณฑ์รับงานของ PM (รอบสอง)
/**
 * สี่ข้อนี้คือเกณฑ์ที่ PM สั่งให้วัดด้วย `npm run profprobe -w engine`
 * ที่นี่ตรึงไว้เป็นเทสต์ด้วย ใช้จุดวัดเดียวกับ profprobe (ชั้น 3 เลเวล 15 seed 99001)
 * เพื่อให้ทุกครั้งที่แตะสูตร เรารู้ทันทีว่าคำสัญญา "โปรแกรมคือบิลด์" ยังจริงอยู่ไหม
 *
 * หมายเหตุ: เทสต์นี้ใช้ค่า PROFICIENCY_WEIGHTS ที่ตั้งอยู่จริงใน types.ts
 * ส่วนการตรวจว่าค่านั้นทนต่อ "ทุกชั้น/ทุกเลเวล" หรือไม่ อยู่ในตารางกวาดค่าของ profprobe
 * (วัดแล้ว: ผ่านครบทุกเคสเมื่อ vit อยู่ในช่วง 1-3 · ที่ 9 นักรบตก 73 จาก 154 เคส)
 */
describe('เกณฑ์รับงาน: โปรแกรมแบบไหน ได้บิลด์แบบนั้น', () => {
  const LEVEL = 15;
  const FLOOR = 3;
  const SEED = 99001;
  const PROF_POINTS = FORMULAS.statPointsPerLevel - PASSIVE_POINTS_PER_LEVEL;

  const CASES: {
    name: string; classId: ClassId; alloc: Partial<BaseStats>; src: string;
    want: (typeof PROFICIENCY_STATS)[number]; least: number;
  }[] = [
    {
      name: 'นักรบตีอย่างเดียว', classId: 'warrior', alloc: { str: 1 },
      src: ATTACK_ONLY, want: 'str', least: 3,
    },
    {
      name: 'จอมเวทร่ายอย่างเดียว', classId: 'mage', alloc: { int: 1 },
      src: 'def turn():\n    cast("firebolt", weakest(enemies))\n', want: 'int', least: 3,
    },
    {
      name: 'ผู้พิทักษ์ตันล้วน', classId: 'guardian', alloc: { vit: 1 },
      src: 'def turn():\n'
        + '    if me.hp_pct < 60:\n        cast("barrier", me)\n'
        + '    elif count(enemies) >= 2:\n        cast("taunt", deadliest(enemies))\n'
        + '    else:\n        defend()\n',
      want: 'vit', least: 3,
    },
    {
      // ข้อที่สำคัญที่สุด: สายตันที่ไม่ตีเลยไม่ได้ EXP จึงเล่นจริงไม่ได้
      name: 'ผู้พิทักษ์ตันแล้วตีบ้าง', classId: 'guardian', alloc: { vit: 0.7, str: 0.3 },
      src: 'def turn():\n'
        + '    if me.hp_pct < 50:\n        cast("barrier", me)\n'
        + '    elif count(enemies) >= 2:\n        cast("taunt", deadliest(enemies))\n'
        + '    else:\n        attack(weakest(enemies))\n',
      want: 'vit', least: 2,
    },
  ];

  for (const c of CASES) {
    it(`${c.name} → ${c.want} อย่างน้อย ${c.least} จาก ${PROF_POINTS} แต้มความชำนาญ`, () => {
      const { prof } = fight(hero(c.classId, LEVEL, c.src, c.alloc), FLOOR, SEED);
      const got = allocatePoints(prof, FORMULAS.statPointsPerLevel, c.classId, LEVEL);
      expect(got[c.want], `${c.name} ได้ ${JSON.stringify(got)} จากงาน ${JSON.stringify(prof)}`)
        .toBeGreaterThanOrEqual(c.least);
    });
  }
});

// ============================================================ ฟาร์มไม่ได้
/**
 * §3.2 สั่งไว้ว่า "ตีมอนชั้น 1 หลายครั้ง ต้องได้ STR น้อยกว่าตีบอสชั้นสูงไม่กี่ครั้ง"
 *
 * วัดจริงแล้วข้อนี้เป็นไปไม่ได้ด้วยสูตร "ดาเมจ ÷ maxHp ของเป้า" ที่ §3.2 กำหนดเอง —
 * เพราะสูตรนี้ทำให้ "หนึ่งเป้าหมาย = หนึ่งหลอด" เสมอ ไม่ว่าเป้านั้นจะเป็นสไลม์ชั้น 1
 * หรือบอสชั้น 8: ผู้ฝึกหัด lv1 ทุบสไลม์ชั้น 1 ตาย 3 หมัด = 1.00 · นักรบ lv30 ทุบบอส
 * ชั้น 8 ตาย 5 หมัด = 1.00 เป๊ะเท่ากัน (ตัวเลขจากการวัด 19 ก.ย. 2026)
 * ถ้าอยากให้บอสมีค่ามากกว่าจริง ๆ ต้องถ่วงน้ำหนักด้วย "เลเวลของเป้า" ซึ่งตอนนี้
 * CombatEvent ไม่มีข้อมูลนั้น — รายงานให้ PM ตัดสินใจแล้ว
 *
 * สิ่งที่สูตรนี้รับประกันได้จริง (และเป็นสิ่งที่กันการฟาร์มจริง ๆ) มีสามข้อ ทดสอบไว้ด้านล่าง:
 *   1. จำนวนครั้งที่ตีไม่ใช่ตัวคูณ — ตีเป้าเดิมกี่หมัดก็ได้อย่างมาก 1 หลอด
 *   2. ตัวเลขดาเมจไม่ใช่ตัวคูณ — ตีล้นเกินไม่ได้เครดิตเพิ่ม
 *   3. งานมากขึ้นไม่ได้แต้มมากขึ้น — แต้มต่อเลเวลคงที่ ฟาร์มจึงเปลี่ยนได้แค่ "สัดส่วน"
 */
describe('ฟาร์มชั้นต่ำไม่ได้เปรียบ', () => {
  /** งาน STR ที่ได้จากหมัดที่ลงเป้าหมายตัวนี้ N หมัดแรก (คำนวณด้วยฟังก์ชันจริง) */
  function strAgainst(result: BattleResult, heroMaxHp: number, targetId: string, maxHits: number): number {
    const events: BattleResult['events'] = [];
    let hits = 0;
    for (const e of result.events) {
      if (e.note === 'wave_start') { events.push(e); continue; } // roster = ที่มาของ maxHp
      if (e.actorId !== HERO_ID) continue;
      const mine = e.targets.filter((t) => t.id === targetId && (t.damage ?? 0) > 0);
      if (!mine.length || hits >= maxHits) continue;
      hits += mine.length;
      events.push({ ...e, targets: mine });
    }
    const trimmed: BattleResult = { ...result, events, drops: { gold: 0, materials: 0, items: [] } };
    return proficiencyFromBattle(trimmed, HERO_ID, heroMaxHp).str;
  }

  it('ตีเป้าเดิมกี่หมัดก็ได้อย่างมาก 1 หลอด — ทั้งมอนชั้น 1 และบอสชั้น 8', () => {
    // ผู้ฝึกหัดเลเวล 1 ทุบมอนชั้น 1: หลายหมัดกว่าจะล้ม แต่รวมแล้วได้ 1 หลอดพอดี
    const novice = hero('novice', 1, ATTACK_ONLY);
    const lowRun = runBattle([novice], 1, 424242);
    const firstMob = lowRun.events.find((e) => e.note === 'wave_start')!.targets[0].id;
    const hitsOnMob = lowRun.events
      .filter((e) => e.actorId === HERO_ID)
      .reduce((n, e) => n + e.targets.filter((t) => t.id === firstMob && (t.damage ?? 0) > 0).length, 0);
    const lowWork = strAgainst(lowRun, novice.derived.maxHp, firstMob, 100);

    expect(hitsOnMob, 'ต้องตีหลายหมัดจริงถึงจะวัดอะไรได้').toBeGreaterThan(2);
    expect(lowWork).toBeCloseTo(1, 6); // ล้มได้ = 1 หลอดพอดี ไม่ว่าจะใช้กี่หมัด

    // นักรบเลเวล 30 ทุบบอสชั้น 8: หมัดหนึ่งกินไปราวหนึ่งในสี่ของหลอด
    const warrior = hero('warrior', 30, ATTACK_ONLY, { str: 0.6, vit: 0.4 });
    const highRun = runBattle([warrior], 8, 424242);
    const boss = highRun.events
      .flatMap((e) => (e.note === 'wave_start' ? e.targets.map((t) => t.id) : []))
      .find((id) => id.includes('boss'))!;

    expect(strAgainst(highRun, warrior.derived.maxHp, boss, 1)).toBeLessThan(0.5);
    expect(strAgainst(highRun, warrior.derived.maxHp, boss, 3)).toBeGreaterThan(0.5);
    // ตีต่อจนตายแล้วตีต่อไม่ได้อีก — เพดานของเป้าหนึ่งตัวคือ 1 หลอดเสมอ
    expect(strAgainst(highRun, warrior.derived.maxHp, boss, 999)).toBeCloseTo(1, 6);
  });

  /**
   * ข้อนี้คือเหตุผลจริงที่ฟาร์มชั้น 1 ไม่ได้เปรียบ (§3.2 "ทำไมฟาร์มไม่ได้"):
   * ไม่ว่าจะสะสมงานมากแค่ไหน แต้มต่อเลเวลก็เท่าเดิม — ฟาร์มเปลี่ยนได้แค่สัดส่วน
   */
  it('ทำงานมากขึ้นไม่ได้แต้มมากขึ้น — ได้แค่สัดส่วนที่ต่างไป', () => {
    const oneRun = fight(hero('warrior', 10, ATTACK_ONLY, { str: 0.6, vit: 0.4 }), 1).prof;
    const hundredRuns = work({
      str: oneRun.str * 100, int: oneRun.int * 100, vit: oneRun.vit * 100,
      agi: oneRun.agi * 100, luk: oneRun.luk * 100,
    });
    expect(sum(allocatePoints(oneRun, 5, 'warrior', 3))).toBe(5);
    expect(sum(allocatePoints(hundredRuns, 5, 'warrior', 3))).toBe(5);
    // สัดส่วนเท่ากัน (งานคูณด้วยค่าคงที่ = บิลด์เดิม) แต่ไม่มีแต้มเพิ่มแม้แต่แต้มเดียว
    expect(allocatePoints(hundredRuns, 5, 'warrior', 3)).toEqual(allocatePoints(oneRun, 5, 'warrior', 3));
  });

  /**
   * ตัวละครเลเวลสูงย้อนไปถล่มชั้น 1 ตีทีเดียวล้น 2-10 เท่าของหลอด
   * ถ้าเรานับ "ดาเมจดิบ" มันจะปั๊ม STR ได้ไม่จำกัด — ต้องได้เท่าจำนวนหลอดที่ล้มจริงเท่านั้น
   */
  it('ดาเมจล้นเกินไม่ถูกนับ — ตัวเลขดาเมจใหญ่ขึ้นไม่ทำให้งานเพิ่ม', () => {
    const weak = hero('warrior', 10, ATTACK_ONLY, { str: 0.6, vit: 0.4 });
    const strong = hero('warrior', 30, ATTACK_ONLY, { str: 0.6, vit: 0.4 });
    const a = fight(weak, 1);
    const b = fight(strong, 1);

    const rawOf = (r: BattleResult) => r.events
      .filter((e) => e.actorId === HERO_ID)
      .reduce((n, e) => n + e.targets.reduce((m, t) => m + (t.damage ?? 0), 0), 0);
    expect(rawOf(b.result), 'ตัวแรงต้องตีแรงกว่าจริง').toBeGreaterThan(rawOf(a.result) * 1.5);
    expect(a.result.victory && b.result.victory).toBe(true);
    // ดาเมจดิบต่างกันเกินเท่าตัว แต่ "งาน" ต้องเท่ากันเพราะล้มหลอดเท่ากัน
    expect(b.prof.str).toBeCloseTo(a.prof.str, 6);
  });
});
