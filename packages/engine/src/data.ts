/**
 * Typed access to gamedata.json.
 * The JSON is imported through resolveJsonModule and is included in the tsc
 * build (tsconfig include: ["src", "data"]), so `dist/data/gamedata.json`
 * exists at runtime and `require('@tower/engine')` works with no extra steps.
 */
import raw from '../data/gamedata.json';
import type {
  AffixStat, BaseStats, ClassId, EquipSlot, Rarity, RegionDef, Rule, SkillDef,
} from './types';

export interface BaseItemDef {
  baseId: string;
  nameTh: string;
  slot: EquipSlot;
  stat: 'atk' | 'matk' | 'def' | 'mdef';
  baseValue: number;
  perFloor: number;
}

export interface AffixPoolEntry {
  stat: AffixStat;
  nameTh: string;
  min: number;
  max: number;
}

export interface MonsterArchetype {
  id: string;
  nameTh: string;
  role: string;
  stats: BaseStats;
  skills: string[];
  minFloor: number;
}

export interface BossDef {
  floor: number;
  id: string;
  nameTh: string;
  archetype: string;
  hpMult: number;
  dmgMult: number;
}

/** ปุ่มจูนความยากหลัก — อยู่ในไฟล์ข้อมูลเพื่อให้จูนได้โดยไม่แตะโค้ด */
export interface BalanceTuning {
  monsterStatGrowthPerLevel: number;
  monsterHpMult: number;
  monsterDmgMult: number;
  expPerMonsterBase: number;
  expPerMonsterPerLevel: number;
  /** ตัวคูณเลือดของทั้งสองฝ่ายในการดวล — ดูเหตุผลใน runDuel */
  duelHpMult: number;
  /**
   * รางวัลของเนื้อหาที่ต่ำกว่าตัวเรา (รอบ 2F §3.1) — ดูสูตรและเหตุผลที่ `rewardFalloff`
   * ใน battle.ts · ต่ำกว่าเราไม่เกิน freeGap เลเวลยังจ่ายเต็ม เกินจากนั้นคูณลดทีละเลเวล
   */
  farmFalloffFreeGap: number;
  farmFalloffPerLevel: number;
  farmFalloffMin: number;
  /** เลเวลที่ยังไม่คิดตัวคูณนี้เลย — ต้นเกมมีเศรษฐกิจ EXP ของตัวเอง (ดู battle.ts) */
  farmFalloffGraceLevel: number;
  /** รางวัลตอนแพ้ คิดตามสัดส่วนเวฟที่ผ่าน (รอบ 2F §3.1) — min ห้ามเป็น 0 */
  defeatRewardMin: number;
  defeatRewardMax: number;
  /**
   * เลเวลที่ล็อกของแต่ละชั้นในภูมิภาค (รอบ 2L) — index 0 = ชั้น 1
   * เลือกด้วย engine/tools/syncprobe.cjs ไม่ใช่เดา · หอคอยไม่ใช้ตารางนี้
   */
  levelSync: number[];
  /**
   * สวิตช์ของการล็อกเลเวล — **ปิดอยู่** จนกว่าตารางจะถูกจูนรายภูมิภาค (ดูเหตุผลใน gamedata.json)
   * อยู่ใน gamedata ไม่ใช่ในโค้ด เพื่อให้เปิดได้โดยไม่ต้องแก้โค้ดเมื่อจูนเสร็จ
   */
  levelSyncEnabled: boolean;
  /**
   * ตัวคูณ EXP ของมอนเลเวล 2 (ชั้น 1) — ไล่ขึ้นเป็น 1 ที่ `earlyExpFullLevel` (playtest รอบ B)
   * ไม่ตั้ง = ไม่ลด · ดูเหตุผลที่ earlyExpMult() ใน battle.ts
   */
  earlyExpMult?: number;
  /** เลเวลมอนที่เริ่มจ่าย EXP เต็ม (มอนเลเวล = ชั้น × 2) */
  earlyExpFullLevel?: number;
}

/**
 * ตัวคูณของมอน EX (รอบ 2W §4) — อยู่ในไฟล์ข้อมูลทั้งชุดตามสเปก
 * "ตัวเลขทั้งหมดอยู่ใน gamedata — ตัวคูณสเตตัส ตัวคูณดรอป และ eliteChance ต่อภูมิภาค"
 */
export interface EliteTuning {
  /** ต่อท้ายชื่อมอนเพื่อให้ผู้เล่นรู้ทันทีว่าตัวไหนคือ EX */
  nameSuffixTh: string;
  hpMult: number;
  dmgMult: number;
  /** ช่วงเวฟที่ EX โผล่ได้ — ไม่รวมเวฟ 10 เพราะเวฟนั้นเป็นของบอส */
  waveMin: number;
  waveMax: number;
  expMult: number;
  goldMult: number;
  materialsMin: number;
  materialsMax: number;
  /** จำนวนไอเทมที่การันตี */
  itemRolls: number;
  /** โอกาสได้ไอเทมเพิ่มอีกชิ้น */
  extraItemChance: number;
  /** บวกเข้าชั้นตอนสุ่มของ = ของจาก EX หายากกว่าและแรงกว่าของชั้นเดียวกัน */
  itemFloorBonus: number;
}

/** เวฟดวล (รอบ 2W §5) */
export interface DuelTuning {
  /** ต่างเลเวลกันได้ไม่เกินเท่านี้ถึงจะจับคู่กัน (§5.3) */
  levelRange: number;
  /** ดวลยืดเยื้อเกินนี้ = เสมอ (สั้นกว่า MAX_ROUNDS ของการไต่ชั้นมาก) */
  maxRounds: number;
  /** ตัวคูณรางวัลของเวฟดวล — 0 = ยังไม่ให้ เปิดได้โดยไม่แตะโค้ด */
  rewardMult: number;
}

export interface GameData {
  balance: BalanceTuning;
  /** ภูมิภาคบนแผนที่โลก (รอบ 2W) — เพิ่ม/แก้โซนได้โดยไม่แตะโค้ด */
  regions: RegionDef[];
  elite: EliteTuning;
  duel: DuelTuning;
  classes: Record<ClassId, { nameTh: string; baseStats: BaseStats; growthHint: string }>;
  skills: SkillDef[];
  affixPool: AffixPoolEntry[];
  rarityWeights: Record<Rarity, number>;
  baseItems: BaseItemDef[];
  monsterArchetypes: MonsterArchetype[];
  bosses: BossDef[];
  /**
   * กฎสำรองต่อคลาส — ใช้กับตัวละครที่ยังไม่มีโปรแกรม BloxCode
   * `Record<ClassId, Rule[]>` บังคับให้ต้องมีครบทุกคลาส: เพิ่มคลาสใหม่ใน ClassId
   * แล้วลืมใส่กฎที่นี่ tsc จะฟ้องทันที (ที่ novice เข้ามาเมื่อ 19 ก.ย. 2026)
   */
  defaultRules: Record<ClassId, Rule[]> & { monsterDefault: Rule[] };
  /**
   * เฟส 2B-1 — AI ของมอนสเตอร์เขียนด้วย BloxCode
   * key = role ของ archetype (fodder/dps/bruiser/caster/tank) + 'default'
   */
  monsterPrograms: Record<string, string>;
}

export const gamedata = raw as unknown as GameData;

const skillById = new Map<string, SkillDef>(gamedata.skills.map((s) => [s.id, s]));

export function getSkill(id: string): SkillDef | undefined {
  return skillById.get(id);
}
