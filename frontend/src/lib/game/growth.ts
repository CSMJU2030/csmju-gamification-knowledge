/**
 * สรุป "ตัวละครโตขึ้นเท่าไรจากการรบนี้" สำหรับหน้าผลการรบ (playtest รอบ A ข้อ 6 · 26 ก.ย. 2026)
 *
 * ผู้เล่นขอให้ "เห็นการเติบโตของตัวละคร" — เดิมหน้าผลบอกแค่ "+3 STR" เป็นป้ายเล็ก ๆ
 * ส่วนนี้บอกเป็น "ก่อน → หลัง" ทั้งสเตตัสและค่าที่ใช้รบจริง (เลือด ATK ...) และเทียบกับครั้งก่อนที่จุดเดียวกัน
 * ข้อมูลทั้งหมดมีอยู่แล้วในหน้า: ตัวละครก่อนรบ (battle-store) กับหลังรบ (ผลของ POST /battles)
 */
import type { BattleOutcome, Character } from '@/lib/api/types';
import { STAT_SHORT } from './labels';

export interface GrowthLine {
  key: string;
  label: string;
  before: number;
  after: number;
}

export type GrowthComparison =
  | { kind: 'first' }
  | { kind: 'better' | 'same' | 'worse'; prevVictory: boolean; prevWaves: number };

export interface GrowthSummary {
  victory: boolean;
  wavesCleared: number;
  levelFrom: number;
  levelTo: number;
  /** สเตตัสฐานที่เปลี่ยน (เรียง STR INT VIT AGI LUK) */
  stats: GrowthLine[];
  /** ค่าที่ใช้รบที่เปลี่ยน */
  derived: GrowthLine[];
  /** EXP ที่ยังขาดถึงเลเวลถัดไป (หลังรบ) */
  expToLevel: number;
  comparison: GrowthComparison;
}

const STAT_KEYS = ['str', 'int', 'vit', 'agi', 'luk'] as const;
const DERIVED: { key: keyof Character['derived']; label: string }[] = [
  { key: 'maxHp', label: 'เลือดสูงสุด' },
  { key: 'maxMp', label: 'MP สูงสุด' },
  { key: 'atk', label: 'ATK' },
  { key: 'matk', label: 'MATK' },
  { key: 'def', label: 'DEF' },
  { key: 'mdef', label: 'MDEF' },
  { key: 'speed', label: 'ความเร็ว' },
];

export function growthSummary(before: Character, outcome: BattleOutcome): GrowthSummary {
  const after = outcome.character;
  const stats: GrowthLine[] = [];
  for (const k of STAT_KEYS) {
    if (after.stats[k] !== before.stats[k]) {
      stats.push({ key: k, label: `${STAT_SHORT[k].th} (${STAT_SHORT[k].key})`, before: before.stats[k], after: after.stats[k] });
    }
  }
  const derived: GrowthLine[] = [];
  for (const d of DERIVED) {
    const b = before.derived[d.key] as number;
    const a = after.derived[d.key] as number;
    if (a !== b) derived.push({ key: d.key, label: d.label, before: b, after: a });
  }

  const victory = outcome.result.victory;
  const waves = outcome.result.wavesCleared;
  const prev = outcome.attempt?.previous ?? null;
  let comparison: GrowthComparison = { kind: 'first' };
  if (prev) {
    const better = (victory && !prev.victory) || (victory === prev.victory && waves > prev.wavesCleared);
    const worse = (!victory && prev.victory) || (victory === prev.victory && waves < prev.wavesCleared);
    comparison = {
      kind: better ? 'better' : worse ? 'worse' : 'same',
      prevVictory: prev.victory,
      prevWaves: prev.wavesCleared,
    };
  }

  return {
    victory,
    wavesCleared: waves,
    levelFrom: before.level,
    levelTo: after.level,
    stats,
    derived,
    expToLevel: Math.max(0, after.expToNext - after.exp),
    comparison,
  };
}

/** เลขที่มีทศนิยม (เช่นความเร็ว 17.5) แสดงหนึ่งตำแหน่ง ที่เหลือเป็นจำนวนเต็ม */
export function growthNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('th-TH') : n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
}
