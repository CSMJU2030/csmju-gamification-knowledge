import { describe, expect, it } from 'vitest';
import type { CombatEvent, DuelBlock } from '@/lib/api/types';
import { BattleDirector } from './director';
import type { DirectorCtx } from './director';
import { duelSides } from './duel';

const ctx: DirectorCtx = { username: 'อัศวินน้อย', classId: 'warrior', maxHp: 100, maxMp: 20, skills: [] };

const events: CombatEvent[] = [
  {
    turn: 0,
    wave: 1,
    actorId: 'system',
    actorName: 'system',
    action: 'attack',
    note: 'wave_start',
    targets: [{ id: 'f1w1_m0_slime', name: 'สไลม์', hpAfter: 30 }],
  },
  {
    turn: 1,
    wave: 1,
    actorId: 'p1',
    actorName: 'อัศวินน้อย',
    action: 'attack',
    line: 3,
    targets: [{ id: 'f1w1_m0_slime', name: 'สไลม์', damage: 12, hpAfter: 18 }],
  },
  {
    turn: 1,
    wave: 1,
    actorId: 'f1w1_m0_slime',
    actorName: 'สไลม์',
    action: 'attack',
    targets: [{ id: 'p1', name: 'อัศวินน้อย', damage: 5, hpAfter: 95 }],
  },
  {
    turn: 2,
    wave: 1,
    actorId: 'p1',
    actorName: 'อัศวินน้อย',
    action: 'attack',
    line: 0,
    targets: [{ id: 'f1w1_m0_slime', name: 'สไลม์', damage: 18, killed: true, hpAfter: 0 }],
  },
  { turn: 2, wave: 1, actorId: 'system', actorName: 'system', action: 'attack', note: 'wave_clear', targets: [] },
];

const texts = (d: BattleDirector) => d.play.log.map((l) => l.text);

describe('BattleDirector — ทีละเทิร์น / ข้ามไปผลลัพธ์', () => {
  it('ปุ่ม → ลงผลทีละ event ทันที (ใช้ได้ตอนหยุดอยู่)', () => {
    const d = new BattleDirector(events, ctx, () => {});
    d.stepEvent();
    expect(texts(d)).toEqual(['เวฟ 1/10 เริ่มต้น']);
    d.stepEvent();
    expect(texts(d)).toEqual(['เวฟ 1/10 เริ่มต้น', 'อัศวินน้อย โจมตี สไลม์ — 12 ดาเมจ']);
    expect(d.play.code).toMatchObject({ line: 3, fallback: false, active: true, nonce: 1 });
    d.stepEvent();
    expect(d.play.combatants.p1.hp).toBe(95);
    // เทิร์นของมอน = ดับไฟแต่คงบรรทัดเดิมไว้
    expect(d.play.code).toMatchObject({ line: 3, active: false });
    d.stepEvent();
    expect(d.play.code).toMatchObject({ fallback: true, active: true, nonce: 2 });
    d.stepEvent();
    d.stepEvent();
    expect(d.done).toBe(true);
    expect(texts(d)).toHaveLength(6);
  });

  it('ปุ่ม → กลางแอนิเมชัน = จบท่าของ event นั้น ไม่ข้ามไป event ถัดไป', () => {
    const d = new BattleDirector(events, ctx, () => {});
    d.stepEvent(); // wave_start
    d.advance(1000); // พ้นช่วงค้างเวฟ → เริ่มท่า windup ของ event ที่ 2
    expect(texts(d)).toHaveLength(1);
    d.stepEvent();
    expect(texts(d)).toEqual(['เวฟ 1/10 เริ่มต้น', 'อัศวินน้อย โจมตี สไลม์ — 12 ดาเมจ']);
  });

  it('ข้ามไปผลลัพธ์หลัง event ลงผลแล้ว ไม่ลงซ้ำ (บันทึกไม่มีบรรทัดซ้ำ)', () => {
    const d = new BattleDirector(events, ctx, () => {});
    d.stepEvent();
    d.stepEvent();
    d.skip();
    expect(d.done).toBe(true);
    expect(texts(d)).toEqual([
      'เวฟ 1/10 เริ่มต้น',
      'อัศวินน้อย โจมตี สไลม์ — 12 ดาเมจ',
      'สไลม์ โจมตี อัศวินน้อย — 5 ดาเมจ',
      'อัศวินน้อย โจมตี สไลม์ — 18 ดาเมจ',
      'สไลม์ ล้มลง!',
      'เคลียร์เวฟ 1 แล้ว',
    ]);
    expect(d.play.combatants['f1w1_m0_slime'].alive).toBe(false);
  });

  it('โหมดลดการเคลื่อนไหว: ไม่มีเอฟเฟกต์กลางเทิร์น ลงผลทั้ง event แล้วค้างภาพนิ่ง', () => {
    const d = new BattleDirector(events, ctx, () => {});
    d.reduced = true;
    d.advance(1); // boot → wave_start
    d.advance(1000); // ค้างเวฟจบ → event ที่ 2 ลงผลทันที
    expect(d.fx).toHaveLength(0);
    expect(texts(d)).toHaveLength(2);
    expect(d.play.activeActor).toBe('p1');
  });
});

describe('BattleDirector — หลอด MP (playtest รอบ A ข้อ 4)', () => {
  const skillCtx: DirectorCtx = {
    ...ctx,
    skills: [{ id: 'w_power_strike', nameTh: 'ฟันสายฟ้าแลบ', mpCost: 8, kind: 'physical', aoe: false }],
  };
  const cast = (turn: number, hpAfter: number, mpAfter?: number): CombatEvent => ({
    turn,
    wave: 1,
    actorId: 'p1',
    actorName: 'อัศวินน้อย',
    action: 'skill',
    skillId: 'w_power_strike',
    targets: [{ id: 'f1w1_m0_slime', name: 'สไลม์', damage: 5, hpAfter }],
    ...(mpAfter !== undefined ? { mpAfter } : {}),
  });

  it('ใช้ MP จริงจาก engine (mpAfter) — ร่ายเกินหลอดได้เพราะฟื้นทุกเทิร์น หลอดไม่ติดศูนย์', () => {
    // MP 20 ร่ายครั้งละ 8 สามครั้ง: หักอย่างเดียวจะเหลือ 0 แต่ engine ฟื้น +1 ต่อเทิร์น จึงเหลือจริง 1 → 7 → ...
    const evs = [events[0], cast(1, 25, 13), cast(2, 20, 6), cast(3, 15, 1)];
    const d = new BattleDirector(evs, skillCtx, () => {});
    d.stepEvent(); // wave_start
    const seen: number[] = [];
    for (let i = 1; i < evs.length; i++) {
      d.stepEvent();
      seen.push(d.play.combatants.p1.mp);
    }
    // หักอย่างเดียวจะได้ 12 → 4 → 0 (ติดศูนย์ทั้งที่ engine ยังร่ายได้)
    expect(seen).toEqual([13, 6, 1]);
  });

  it('ตีธรรมดาก็อัปเดต MP (engine ให้ +3 ต่อครั้ง)', () => {
    const hit: CombatEvent = { ...events[1], mpAfter: 20 };
    const d = new BattleDirector([events[0], cast(1, 25, 13), hit], skillCtx, () => {});
    d.stepEvent();
    d.stepEvent();
    expect(d.play.combatants.p1.mp).toBe(13);
    d.stepEvent();
    expect(d.play.combatants.p1.mp).toBe(20);
  });

  it('บันทึกรุ่นเก่าที่ไม่มี mpAfter ถอยไปหักตาม mpCost แบบเดิม', () => {
    const d = new BattleDirector([events[0], cast(1, 25), cast(2, 20)], skillCtx, () => {});
    d.skip();
    expect(d.play.combatants.p1.mp).toBe(4);
  });
});

describe('BattleDirector — เทิร์นที่สั่ง wait() (ผู้ใช้แจ้ง 8 ต.ค. 2569: MP ที่ฟื้นไม่แสดง)', () => {
  const skillCtx: DirectorCtx = {
    ...ctx,
    skills: [{ id: 'w_power_strike', nameTh: 'ฟันสายฟ้าแลบ', mpCost: 16, kind: 'physical', aoe: false }],
  };
  const cast: CombatEvent = {
    turn: 1,
    wave: 1,
    actorId: 'p1',
    actorName: 'อัศวินน้อย',
    action: 'skill',
    skillId: 'w_power_strike',
    line: 2,
    targets: [{ id: 'f1w1_m0_slime', name: 'สไลม์', damage: 5, hpAfter: 25 }],
    mpAfter: 5,
  };
  const wait = (turn: number, mpAfter: number): CombatEvent => ({
    turn,
    wave: 1,
    actorId: 'p1',
    actorName: 'อัศวินน้อย',
    action: 'wait',
    line: 3,
    targets: [],
    mpAfter,
  });

  it('หลอด MP ขยับทุกเทิร์นที่รอ พร้อมตัวเลข +MP ลอยขึ้น และบันทึกมีบรรทัดรอ', () => {
    const d = new BattleDirector([events[0], cast, wait(2, 6), wait(3, 7)], skillCtx, () => {});
    d.stepEvent(); // wave_start
    d.stepEvent(); // ร่ายสกิล 20 → 5
    expect(d.play.combatants.p1.mp).toBe(5);
    d.advance(451); // ค้างภาพจบ → เริ่มเทิร์นรอ
    expect(d.play.combatants.p1.mp).toBe(6);
    expect(d.play.floats.filter((f) => f.kind === 'mp').map((f) => f.text)).toEqual(['+1 MP']);
    expect(texts(d).at(-1)).toBe('อัศวินน้อย รอ 1 เทิร์น · MP เป็น 6');
    // บรรทัดในโปรแกรมที่สั่ง wait() สว่างขึ้นเหมือนเทิร์นอื่น
    expect(d.play.code).toMatchObject({ line: 3, active: true });
    d.stepEvent();
    expect(d.play.combatants.p1.mp).toBe(7);
    // กดเทิร์นถัดไปตอนหยุดอยู่ = เห็นแค่ตัวเลขของเทิร์นนี้ ไม่ค้างของเทิร์นก่อน
    expect(d.play.floats.map((f) => `${f.kind} ${f.text}`)).toEqual(['mp +1 MP']);
    d.stepEvent();
    expect(d.done).toBe(true);
  });

  it('เทิร์นรอไม่มีท่าโจมตี ไม่มีเอฟเฟกต์ และไม่มีตัวเลขดาเมจ', () => {
    const d = new BattleDirector([events[0], cast, wait(2, 6)], skillCtx, () => {});
    d.stepEvent();
    d.stepEvent();
    const seen = new Set(d.play.floats.map((f) => f.id)); // ตัวเลขดาเมจของเทิร์นร่ายยังลอยค้างอยู่
    d.advance(451);
    const me = d.ents.get('p1'); // ตัวกำกับเปลี่ยนคีย์ผู้เล่นเป็น id จริงของ engine
    expect(me).toBeDefined();
    expect(me?.anim).not.toBe('act');
    expect(me?.lunge).toBe(0);
    expect(d.fx).toHaveLength(0);
    expect(d.play.floats.filter((f) => !seen.has(f.id)).map((f) => f.kind)).toEqual(['mp']);
  });

  it('MP เต็มอยู่แล้วตอนรอ = ไม่มีตัวเลข +0 MP · ข้ามไปผลลัพธ์ไม่ลงบรรทัดรอซ้ำ', () => {
    const d = new BattleDirector([events[0], wait(1, 20), wait(2, 20)], skillCtx, () => {});
    d.stepEvent();
    d.stepEvent();
    expect(d.play.floats.some((f) => f.kind === 'mp')).toBe(false);
    d.skip();
    expect(texts(d).filter((t) => t.includes('รอ 1 เทิร์น'))).toHaveLength(2);
  });
});

describe('duelSides', () => {
  it('หา id ทั้งสองฝั่งจากชื่อ และอ่านเลือดเต็มจาก log', () => {
    const duel: DuelBlock = {
      opponent: { displayName: 'คู่แข่ง', classId: 'mage', level: 7, live: false },
      won: true,
      byTimeout: false,
      rounds: 3,
      opponentProgram: '',
      events: [
        {
          turn: 1,
          wave: 1,
          actorId: 'u2',
          actorName: 'อัศวินน้อย',
          action: 'attack',
          targets: [{ id: 's9', name: 'คู่แข่ง', damage: 30, hpAfter: 120 }],
        },
      ],
    };
    expect(duelSides(duel, 'อัศวินน้อย', 100)).toEqual({
      selfId: 'u2',
      selfMaxHp: 100,
      opponentId: 's9',
      opponentName: 'คู่แข่ง',
      opponentClassId: 'mage',
      opponentMaxHp: 150,
    });
    expect(duelSides(duel, 'ไม่มีชื่อนี้', 100)).toBeNull();
  });
});

describe('BattleDirector — สถานะจากสกิลตำรา (ระยะ S4)', () => {
  const ME = 'อัศวินน้อย';
  const SLIME = 'f1w1_m0_slime';
  const skills = [
    { id: 'w_venom_edge', nameTh: 'คมพิษ', mpCost: 10, kind: 'physical' as const, aoe: false },
    { id: 'w_skull_crack', nameTh: 'ทุบกะโหลก', mpCost: 16, kind: 'physical' as const, aoe: false },
    { id: 'w_war_cry', nameTh: 'เสียงคำรามศึก', mpCost: 12, kind: 'buff' as const, aoe: false, buff: { turns: 3 } },
    { id: 'w_blood_strike', nameTh: 'ฟันกระหายเลือด', mpCost: 12, kind: 'physical' as const, aoe: false },
  ];
  const start: CombatEvent = {
    turn: 0, wave: 1, actorId: 'system', actorName: 'system', action: 'attack', note: 'wave_start',
    targets: [{ id: SLIME, name: 'สไลม์', hpAfter: 100 }],
  };
  const mine = (turn: number, extra: Partial<CombatEvent>): CombatEvent =>
    ({ turn, wave: 1, actorId: 'p1', actorName: ME, action: 'skill', targets: [], ...extra }) as CombatEvent;
  const run = (evs: CombatEvent[]) => {
    const d = new BattleDirector([start, ...evs], { ...ctx, skills }, () => {});
    d.reduced = true;
    for (let i = 0; i <= evs.length; i++) d.stepEvent();
    return d;
  };

  it('พิษ: ติดแล้วนับเทิร์นถอยหลังตามพิษกัด · ตัวเลขพิษลอย · พิษฆ่าได้ · บันทึกบอกที่มาของพิษ', () => {
    const d = run([
      mine(1, { skillId: 'w_venom_edge', targets: [{ id: SLIME, name: 'สไลม์', damage: 10, hpAfter: 90, poison: 3 }] }),
      { turn: 1, wave: 1, actorId: SLIME, actorName: 'สไลม์', action: 'wait', skillId: 'w_venom_edge', note: 'poison',
        targets: [{ id: SLIME, name: 'สไลม์', damage: 8, hpAfter: 82 }] },
    ]);
    expect(d.play.combatants[SLIME]).toMatchObject({ hp: 82, poisonTurns: 2, alive: true });
    expect(texts(d)).toContain('อัศวินน้อย ใช้ คมพิษ ใส่ สไลม์ — 10 ดาเมจ · ติดพิษ 3 เทิร์น');
    expect(texts(d)).toContain('สไลม์ โดนพิษจาก คมพิษ — 8 ดาเมจ');
    expect(d.play.floats.map((f) => f.text)).toContain('-8 พิษ');

    const dead = run([
      { turn: 1, wave: 1, actorId: SLIME, actorName: 'สไลม์', action: 'wait', skillId: 'w_venom_edge', note: 'poison',
        targets: [{ id: SLIME, name: 'สไลม์', damage: 100, killed: true, hpAfter: 0 }] },
    ]);
    expect(dead.play.combatants[SLIME].alive).toBe(false);
    expect(dead.ents.get(SLIME)!.anim).toBe('down');
    expect(texts(dead)).toContain('สไลม์ ล้มลง!');
  });

  it('มึน: ป้ายขึ้นตอนโดน · หายเมื่อเทิร์นของมันถูกข้าม · บันทึกบอกว่าข้ามเทิร์น', () => {
    const hit = mine(1, { skillId: 'w_skull_crack', targets: [{ id: SLIME, name: 'สไลม์', damage: 12, hpAfter: 88, stun: true }] });
    expect(run([hit]).play.combatants[SLIME].stunned).toBe(true);
    const d = run([hit, { turn: 1, wave: 1, actorId: SLIME, actorName: 'สไลม์', action: 'wait', note: 'stunned', targets: [] }]);
    expect(d.play.combatants[SLIME].stunned).toBe(false);
    expect(texts(d)).toContain('สไลม์ มึน — ข้ามเทิร์นนี้');
  });

  it('บัฟ: นับสามเทิร์นถัดไปของผู้ร่าย (ไม่นับเทิร์นที่ร่าย) แล้วหายเอง', () => {
    const cast = mine(1, { skillId: 'w_war_cry', targets: [{ id: 'p1', name: ME, buff: 'power', hpAfter: 100 }] });
    const swing = (turn: number) => mine(turn, { action: 'attack', targets: [{ id: SLIME, name: 'สไลม์', damage: 5, hpAfter: 100 - turn * 5 }] });
    expect(run([cast]).play.combatants.p1.buffTurns).toBe(3);
    expect(run([cast, swing(2)]).play.combatants.p1.buffTurns).toBe(2);
    expect(run([cast, swing(2), swing(3), swing(4)]).play.combatants.p1.buffTurns).toBe(0);
    expect(texts(run([cast]))).toContain('อัศวินน้อย ใช้ เสียงคำรามศึก — พลังโจมตีเพิ่มขึ้น · has_buff("power") เป็นจริง');
  });

  it('ดูดเลือด: เลือดผู้ร่ายขึ้นตามแถว drain · ตัวเลขบอกว่าดูด · หลายฮิตลอยหลายตัวเลข', () => {
    const d = run([
      { turn: 1, wave: 1, actorId: SLIME, actorName: 'สไลม์', action: 'attack', targets: [{ id: 'p1', name: ME, damage: 30, hpAfter: 70 }] },
      mine(2, {
        skillId: 'w_blood_strike',
        targets: [
          { id: SLIME, name: 'สไลม์', damage: 20, hpAfter: 80 },
          { id: SLIME, name: 'สไลม์', damage: 20, hpAfter: 60 },
          { id: 'p1', name: ME, heal: 20, hpAfter: 90, drain: true },
        ],
      }),
    ]);
    expect(d.play.combatants.p1.hp).toBe(90);
    expect(d.play.combatants[SLIME].hp).toBe(60);
    expect(d.play.floats.map((f) => f.text)).toEqual(expect.arrayContaining(['-20', '+20 ดูด']));
    expect(texts(d)).toContain('อัศวินน้อย ดูดเลือดคืน 20 HP');
  });
});
