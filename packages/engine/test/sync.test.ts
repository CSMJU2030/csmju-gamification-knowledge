/**
 * ล็อกเลเวลในภูมิภาค (รอบ 2L §3) — เทสต์ยืนยันว่าการล็อก "ไม่รั่ว"
 *
 * รูที่กลัวที่สุดคือล็อกแค่เลขเลเวล แล้วปล่อยแต้มสเตตัสกับของไว้ตามจริง
 * ซึ่งทำให้ผู้เล่นเลเวลสูงยังโหดในภูมิภาคเหมือนเดิม — ทุกข้อข้างล่างกันรูนั้นคนละด้าน
 */
import { describe, expect, it } from 'vitest';
import { syncEquipment, syncLevelForFloor, syncLoadout, syncStats } from '../src/sync';
import { buildDerivedStats, itemMainStat } from '../src/stats';
import { FORMULAS, type BaseStats, type ItemInstance } from '../src/types';
import { gamedata } from '../src/data';

const base = gamedata.classes.warrior.baseStats;
const total = (s: BaseStats) => s.str + s.int + s.vit + s.agi + s.luk;
const baseTotal = total(base);

/** นักรบสาย STR ที่เลเวลอัพมาแบบ "ตีอย่างเดียว" — รูปทรงเดียวกับคนขี้เกียจรอบ 2F */
function strWarrior(level: number): BaseStats {
  const pts = (level - 1) * 5;
  return {
    ...base,
    str: base.str + Math.round(pts * 0.8),
    vit: base.vit + Math.round(pts * 0.1),
    agi: base.agi + Math.round(pts * 0.05),
    luk: base.luk + (pts - Math.round(pts * 0.8) - Math.round(pts * 0.1) - Math.round(pts * 0.05)),
  };
}

const sword = (droppedFloor: number, upgradeLevel: number): ItemInstance => ({
  id: 'x', baseId: 'sword', slot: 'weapon', rarity: 'rare', upgradeLevel, droppedFloor,
  affixes: [{ stat: 'atk_pct', value: 20 }],
});

describe('ล็อกสเตตัส', () => {
  it('แต้มรวมหลังล็อก = แต้มรวมของคนเลเวลนั้นจริง (±ปัดเศษ)', () => {
    const synced = syncStats('warrior', 21, strWarrior(21), 10);
    const realLevel10Total = baseTotal + (10 - 1) * 5;
    expect(Math.abs(total(synced) - realLevel10Total)).toBeLessThanOrEqual(3);
  });

  it('รักษารูปทรงบิลด์ — สาย STR ยังเป็นสาย STR', () => {
    const before = strWarrior(21);
    const after = syncStats('warrior', 21, before, 10);
    const shareBefore = (before.str - base.str) / (total(before) - baseTotal);
    const shareAfter = (after.str - base.str) / (total(after) - baseTotal);
    expect(Math.abs(shareAfter - shareBefore)).toBeLessThan(0.05);
  });

  it('เลเวลไม่ถึงโซน = ไม่แตะเลย (ล็อกลงอย่างเดียว ไม่ดึงขึ้น)', () => {
    const s = strWarrior(6);
    expect(syncStats('warrior', 6, s, 10)).toEqual(s);
  });
});

describe('ล็อกอุปกรณ์', () => {
  it('ของชั้น 10 +15 ในโซนชั้น 5 = ของชั้น 5 ที่อัปเกรดไม่เกิน +5', () => {
    const [s] = syncEquipment([sword(10, 15)], 5);
    expect(s.droppedFloor).toBe(5);
    expect(s.upgradeLevel).toBe(5);
    expect(itemMainStat(s)).toEqual(itemMainStat(sword(5, 5)));
  });

  it('อัฟฟิกซ์ย่อตามสัดส่วนชั้น', () => {
    const [s] = syncEquipment([sword(10, 0)], 5);
    expect(s.affixes[0].value).toBe(10); // 20 × 5/10
  });

  it('ของที่ดรอปต่ำกว่าโซนอยู่แล้ว ค่าหลักไม่ถูกแตะ แต่การอัปเกรดยังถูกตัด', () => {
    const [s] = syncEquipment([sword(3, 9)], 5);
    expect(s.droppedFloor).toBe(3);
    expect(s.affixes[0].value).toBe(20);
    expect(s.upgradeLevel).toBe(5);
  });
});

describe('ล็อกทั้งชุด — เกณฑ์ที่แท้จริงของรอบ 2L', () => {
  it('นักรบเลเวล 21 + ของหอคอยชั้นบนสุด ในโซนที่ล็อกเลเวล 10 ต้องแรงพอ ๆ กับคนเลเวล 10 จริง', () => {
    const floor = gamedata.balance.levelSync.indexOf(
      gamedata.balance.levelSync.find((l) => l >= 10) ?? 10) + 1;
    const target = syncLevelForFloor(floor);

    const farmer = syncLoadout('warrior', 21, strWarrior(21), [sword(10, 15)], floor);
    const honest = { level: target, stats: strWarrior(target), equipment: [sword(floor, 0)] };

    const a = buildDerivedStats('warrior', farmer.level, farmer.stats, farmer.equipment);
    const b = buildDerivedStats('warrior', honest.level, honest.stats, honest.equipment);

    expect(farmer.synced).toBe(true);
    expect(farmer.level).toBe(target);
    // ไม่เป๊ะเพราะคนฟาร์มยังได้อัปเกรดถึง +floor แต่ต้องไม่ห่างจนเลเวลกลับมามีผล
    expect(a.atk / b.atk).toBeLessThan(1.3);
    expect(a.maxHp / b.maxHp).toBeLessThan(1.15);
  });

  it('ตาราง levelSync ครบทุกชั้นของเกม และไม่ลดลงเมื่อชั้นสูงขึ้น', () => {
    const table = gamedata.balance.levelSync;
    const top = Math.max(...gamedata.regions.filter((r) => r.depths > 0)
      .map((r) => r.floorBase + r.depths - 1));
    expect(table.length).toBeGreaterThanOrEqual(top);
    for (let i = 1; i < table.length; i++) expect(table[i]).toBeGreaterThanOrEqual(table[i - 1]);
  });

  it('maxHp ที่ล็อกแล้วใช้เลเวลที่ล็อก ไม่ใช่เลเวลจริง', () => {
    const r = syncLoadout('warrior', 30, strWarrior(30), [], 3);
    const d = buildDerivedStats('warrior', r.level, r.stats, r.equipment);
    expect(d.maxHp).toBe(FORMULAS.maxHp(r.stats.vit, syncLevelForFloor(3)));
  });
});
