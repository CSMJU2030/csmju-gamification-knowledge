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
