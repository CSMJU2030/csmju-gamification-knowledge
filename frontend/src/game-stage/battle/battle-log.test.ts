import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '@/lib/api/types';
import { buildBattleLog, describeEvent } from './battle-log';

const skillName = (id: string | undefined) => (id === 'fireball' ? 'ลูกไฟ' : (id ?? 'สกิล'));
const ctx = { skillName };

function ev(partial: Partial<CombatEvent>): CombatEvent {
  return { turn: 1, wave: 1, actorId: 'p1', actorName: 'อัศวินน้อย', action: 'attack', targets: [], ...partial };
}

describe('describeEvent — ข้อความไทยของบันทึกการรบ', () => {
  it('เริ่มเวฟ / เคลียร์เวฟ', () => {
    expect(describeEvent(ev({ note: 'wave_start', wave: 3, actorId: 'system' }), ctx)).toEqual([
      { text: 'เวฟ 3/10 เริ่มต้น', kind: 'wave' },
    ]);
    expect(describeEvent(ev({ note: 'wave_clear', wave: 3, actorId: 'system' }), ctx)).toEqual([
      { text: 'เคลียร์เวฟ 3 แล้ว', kind: 'wave' },
    ]);
  });

  it('ตัวอย่างอาชีพมีแค่ 3 เวฟ — บอกจำนวนเวฟตามจริง (playtest รอบ B)', () => {
    expect(describeEvent(ev({ note: 'wave_start', wave: 1, actorId: 'system' }), { ...ctx, waveTotal: 3 })).toEqual([
      { text: 'เวฟ 1/3 เริ่มต้น', kind: 'wave' },
    ]);
  });

  it('การดวลใช้คำว่าเริ่ม/จบการดวลแทนเวฟ', () => {
    const duelCtx = { skillName, duel: true };
    expect(describeEvent(ev({ note: 'wave_start' }), duelCtx)[0].text).toBe('เริ่มการดวล');
    expect(describeEvent(ev({ note: 'wave_clear' }), duelCtx)[0].text).toBe('จบการดวล');
  });

  it('โจมตีปกติ มีตัวเลขคั่นหลักพัน และติดคริ', () => {
    const lines = describeEvent(
      ev({ targets: [{ id: 'm1', name: 'สไลม์', damage: 1234, crit: true, hpAfter: 10 }] }),
      ctx,
    );
    expect(lines).toEqual([{ text: 'อัศวินน้อย โจมตี สไลม์ — 1,234 ดาเมจ ติดคริ!', kind: 'normal' }]);
  });

  it('ใช้สกิลด้วยชื่อไทย + ฆ่าได้ = สองบรรทัด', () => {
    const lines = describeEvent(
      ev({
        action: 'skill',
        skillId: 'fireball',
        targets: [{ id: 'm1', name: 'ก็อบลิน', damage: 40, killed: true, hpAfter: 0 }],
      }),
      ctx,
    );
    expect(lines.map((l) => l.text)).toEqual(['อัศวินน้อย ใช้ ลูกไฟ ใส่ ก็อบลิน — 40 ดาเมจ', 'ก็อบลิน ล้มลง!']);
    expect(lines[1].kind).toBe('kill');
  });

  it('หลบได้', () => {
    const [line] = describeEvent(ev({ targets: [{ id: 'm1', name: 'หมาป่า', evaded: true, hpAfter: 30 }] }), ctx);
    expect(line.text).toBe('อัศวินน้อย โจมตี หมาป่า — พลาด! หมาป่า หลบได้');
  });

  it('ฮีลและโล่', () => {
    const lines = describeEvent(
      ev({
        action: 'skill',
        skillId: 'barrier',
        targets: [{ id: 'p1', name: 'อัศวินน้อย', heal: 25, shield: 12, hpAfter: 80 }],
      }),
      ctx,
    );
    expect(lines).toEqual([
      { text: 'อัศวินน้อย ใช้ barrier — อัศวินน้อย ฟื้นฟู 25 HP', kind: 'heal' },
      { text: 'อัศวินน้อย ใช้ barrier — อัศวินน้อย ได้โล่ 12', kind: 'heal' },
    ]);
  });

  it('ตั้งท่าป้องกัน', () => {
    expect(describeEvent(ev({ action: 'defend', note: 'defend' }), ctx)).toEqual([
      { text: 'อัศวินน้อย ตั้งท่าป้องกัน', kind: 'normal' },
    ]);
  });

  it('หมายหัว (windup) บอกโค้ดที่อ่านสถานะนี้ได้', () => {
    const [line] = describeEvent(
      ev({ actorName: 'ออร์ค', note: 'windup', targets: [{ id: 'p1', name: 'อัศวินน้อย', hpAfter: 90 }] }),
      ctx,
    );
    expect(line.kind).toBe('system');
    expect(line.text).toBe(
      'ออร์ค ง้างรอ — หมายหัว อัศวินน้อย ไว้ เทิร์นหน้าของมันจะทุบแรง · has_debuff("marked") เป็นจริงตอนนี้',
    );
  });

  it('ไม่มี emoji ในข้อความใดเลย', () => {
    const all = buildBattleLog(
      [
        ev({ note: 'wave_start' }),
        ev({ targets: [{ id: 'm', name: 'ม', damage: 1, killed: true, hpAfter: 0 }] }),
        ev({ action: 'skill', skillId: 'fireball', targets: [{ id: 'p1', name: 'x', heal: 1, shield: 1, hpAfter: 1 }] }),
        ev({ note: 'wave_clear' }),
      ],
      ctx,
    );
    expect(all.length).toBe(6);
    for (const l of all) expect(l.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
