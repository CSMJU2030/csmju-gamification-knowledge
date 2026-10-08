/**
 * mpAfter ใน CombatEvent (playtest รอบ A ข้อ 4 · 26 ก.ย. 2026)
 *
 * ผู้เล่นรายงานว่า "MP หมดแล้วยังใช้สกิลได้" — ตัวรบถูกต้อง แต่ฉากเดา MP ด้วยการหักอย่างเดียว
 * เทสต์นี้คุมสัญญาใหม่: ทุก event ของผู้ลงมือบอก MP จริงหลังจบเทิร์น และค่าที่บอก
 * สร้างกลับเป็นลำดับ MP ที่สอดคล้องกับกติกาเป๊ะ (ร่ายได้ทุกครั้งเพราะมี MP พอจริง)
 */
import { describe, expect, it } from 'vitest';
import { buildDerivedStats, gamedata, runBattle } from '../src/index';
import { BASIC_ATTACK_MP, MP_REGEN_PCT, WAVE_CLEAR_RESTORE } from '../src/combat-rules';
import type { ClassId, CombatEvent, Combatant } from '../src/types';

function hero(classId: ClassId, level: number, source: string): Combatant {
  const stats = { ...gamedata.classes[classId].baseStats };
  const skills = gamedata.skills.filter((s) => s.classId === classId && s.unlockLevel <= level).map((s) => s.id);
  return {
    id: 'p1', name: 'ฮีโร่', side: 'party', classId, level, stats,
    derived: buildDerivedStats(classId, level, stats, []),
    skills, rules: [],
    ...({ programSource: source } as object),
  } as Combatant;
}

const isSystem = (e: CombatEvent) => e.note === 'wave_start' || e.note === 'wave_clear';
const mpCost = (id?: string) => gamedata.skills.find((s) => s.id === id)?.mpCost ?? 0;

/** จอมเวท lv1 ร่ายลูกไฟทุกเทิร์น — สถานการณ์เดียวกับที่ผู้เล่นเจอ */
const FIREBOLT_SPAM = 'def turn():\n    cast("firebolt", weakest(enemies))\n';
const MIXED = [
  'def turn():',
  '    if me.hp_pct < 40:',
  '        defend()',
  '    elif me.mp >= 7:',
  '        cast("firebolt", weakest(enemies))',
  '    else:',
  '        attack(weakest(enemies))',
  '',
].join('\n');

describe('mpAfter', () => {
  it('อยู่ในทุก event ของผู้ลงมือ และไม่อยู่ใน event ของระบบ', () => {
    const r = runBattle([hero('mage', 1, MIXED)], 1, 777);
    expect(r.events.length).toBeGreaterThan(20);
    for (const e of r.events) {
      if (isSystem(e)) expect(e.mpAfter).toBeUndefined();
      else expect(typeof e.mpAfter).toBe('number');
    }
  });

  it('สร้างลำดับ MP ของผู้เล่นกลับได้ตรงกติกาทุกเทิร์น และทุกการร่ายมี MP พอจริง', () => {
    for (const [source, seed] of [[FIREBOLT_SPAM, 777], [MIXED, 42], [FIREBOLT_SPAM, 9001]] as const) {
      const h = hero('mage', 1, source);
      const max = h.derived.maxMp;
      const regen = Math.round(max * MP_REGEN_PCT);
      const restore = Math.round(max * WAVE_CLEAR_RESTORE);
      const r = runBattle([h], 1, seed);

      let mp = max;
      let casts = 0;
      for (const e of r.events) {
        if (e.note === 'wave_clear') {
          mp = Math.min(max, mp + restore);
          continue;
        }
        if (e.actorId !== 'p1') continue;
        let expected = mp;
        if (e.action === 'skill') {
          expect(mp).toBeGreaterThanOrEqual(mpCost(e.skillId)); // ร่ายได้เพราะมีพอจริง
          expected = mp - mpCost(e.skillId);
          casts++;
        } else if (e.action === 'attack') {
          expected = Math.min(max, mp + BASIC_ATTACK_MP);
        }
        expected = Math.min(max, expected + regen);
        expect(e.mpAfter).toBe(expected);
        mp = e.mpAfter!;
      }
      if (source === FIREBOLT_SPAM) {
        // ร่ายได้มากกว่าที่ MP เต็มหลอดจ่ายไหว — ตัวเลขนี้แหละที่ฉากเดิมวาดผิด
        expect(casts * mpCost('m_firebolt')).toBeGreaterThan(max);
      }
    }
  });

  it('เทิร์นที่สั่ง wait() มีเหตุการณ์ของตัวเอง — เห็น MP ที่ฟื้นระหว่างรอ · บรรทัดที่สั่ง · คำเตือน MP ไม่พอ (8 ต.ค. 2569)', () => {
    // โปรแกรมของผู้เล่นจริงบน server: ร่ายพายุน้ำแข็ง (MP 16) ไม่พอก็รอ — เดิมเทิร์นรอไม่มีเหตุการณ์เลย หลอด MP จึงค้าง
    const WAIT_FOR_MP = 'def turn():\n    cast("blizzard", weakest(enemies))\n    wait()\n';
    const h = hero('mage', 5, WAIT_FOR_MP);
    const max = h.derived.maxMp;
    const regen = Math.round(max * MP_REGEN_PCT);
    const restore = Math.round(max * WAVE_CLEAR_RESTORE);
    const r = runBattle([h], 2, 4242);
    const waits = r.events.filter((e) => e.actorId === 'p1' && e.action === 'wait');
    expect(waits.length).toBeGreaterThan(0);
    for (const e of waits) {
      expect(e.targets).toEqual([]);
      expect(e.line).toBe(3);
      expect(e.codeWarnings?.some((w) => w.includes('blizzard'))).toBe(true);
    }
    // ลำดับ MP สร้างกลับได้ครบทุกเทิร์น รวมเทิร์นรอ (ฟื้น 5% ต่อเทิร์น)
    let mp = max;
    for (const e of r.events) {
      if (e.note === 'wave_clear') {
        mp = Math.min(max, mp + restore);
        continue;
      }
      if (e.actorId !== 'p1') continue;
      const spent = e.action === 'skill' ? mpCost(e.skillId) : 0;
      expect(mp).toBeGreaterThanOrEqual(spent);
      expect(e.mpAfter).toBe(Math.min(max, mp - spent + regen));
      mp = e.mpAfter!;
    }
    // ทุกรอบที่ผู้เล่นยังยืนอยู่มีเหตุการณ์ของผู้เล่นหนึ่งอัน (ไม่มีเทิร์นที่หายไปจากฉาก)
    const heroTurns = new Set(r.events.filter((e) => e.actorId === 'p1').map((e) => `${e.wave}:${e.turn}`));
    const rounds = new Set(r.events.filter((e) => e.actorId !== 'system').map((e) => `${e.wave}:${e.turn}`));
    expect(heroTurns.size).toBe(rounds.size);
  });

  it('อยู่ในช่วง 0 ถึง MP สูงสุดของผู้ลงมือเสมอ (ทั้งผู้เล่นและมอน)', () => {
    const h = hero('warrior', 5, 'def turn():\n    cast("power_strike", weakest(enemies))\n');
    const r = runBattle([h], 4, 123);
    for (const e of r.events) {
      if (isSystem(e)) continue;
      expect(e.mpAfter!).toBeGreaterThanOrEqual(0);
      if (e.actorId === 'p1') expect(e.mpAfter!).toBeLessThanOrEqual(h.derived.maxMp);
    }
  });
});
