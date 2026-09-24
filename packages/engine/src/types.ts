/**
 * Code Tower — shared contract types (Phase 0, owned by PM)
 * ทุก workspace ต้องอิงไฟล์นี้ ห้ามแก้โครงสร้างโดยไม่ผ่าน PM
 */

// ---------- Classes & stats ----------
/**
 * `novice` = ผู้ฝึกหัด (เพิ่ม 19 ก.ย. 2026 รอบ 2P)
 * ทุกคนเริ่มเกมด้วยคลาสนี้ ไม่มีสกิล ใช้ได้แค่ attack/defend/wait
 * แล้วเลือกอาชีพจริงหลังผ่านชั้น 1 — เพราะคนเล่นใหม่ยังไม่รู้ว่านักรบกับจอมเวทต่างกันยังไง
 * การให้เลือกตอนสมัครคือการให้เดา (ดู docs/design-round2p.md §3.3)
 */
export type ClassId = 'novice' | 'warrior' | 'mage' | 'guardian';

/** อาชีพที่เลือกได้หลังผ่านชั้น 1 — novice ไม่อยู่ในนี้เพราะเลือกกลับไม่ได้ */
export const PLAYABLE_CLASSES = ['warrior', 'mage', 'guardian'] as const;
export type PlayableClassId = (typeof PLAYABLE_CLASSES)[number];

export interface BaseStats {
  str: number; // พลังโจมตีกายภาพ
  int: number; // พลังเวท + MP
  vit: number; // HP + ป้องกัน
  agi: number; // ความเร็ว (ลำดับเทิร์น) + หลบ
  luk: number; // คริ + โบนัสดรอป
}

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  atk: number;   // กายภาพ
  matk: number;  // เวท
  def: number;
  mdef: number;
  speed: number;
  critRate: number;   // 0..1
  critDmg: number;    // ตัวคูณ เช่น 1.5
  evasion: number;    // 0..1
  dropBonus: number;  // 0..1 (บวกเข้า drop chance แบบคูณ)
}

// ---------- Rule system (Gambit) ----------
export type ConditionType =
  | 'always'
  | 'self_hp_below'      // value = เปอร์เซ็นต์ 0..100
  | 'self_mp_above'      // value = เปอร์เซ็นต์ 0..100
  | 'ally_hp_below'      // มี ally (รวมตัวเอง) ที่ HP% < value
  | 'enemy_count_gte'    // value = จำนวน
  | 'enemy_hp_below'     // มีศัตรู HP% < value
  | 'turn_gte';          // value = เลขเทิร์น

export type TargetSelector =
  | 'lowest_hp_enemy'
  | 'highest_hp_enemy'
  | 'highest_atk_enemy'
  | 'random_enemy'
  | 'self'
  | 'lowest_hp_ally';

export type ActionType = 'attack' | 'skill' | 'defend';

export interface Rule {
  condition: { type: ConditionType; value?: number };
  action: { type: ActionType; skillId?: string; target: TargetSelector };
}

// ---------- Skills ----------
export type SkillKind = 'physical' | 'magic' | 'heal' | 'shield' | 'taunt';

export interface SkillDef {
  id: string;
  name: string;
  nameTh: string;
  classId: ClassId | 'monster';
  kind: SkillKind;
  power: number;      // % ของ atk/matk (100 = 1 เท่า); heal/shield = % ของ matk
  mpCost: number;
  aoe: boolean;       // โดนศัตรู/พวกเดียวกันทุกตัว
  unlockLevel: number;
  /** เฟส 2A: ชื่อแอนิเมชันเอฟเฟกต์ที่ client ใช้วาด (ดู EFFECT_ANIMATIONS ใน client/src/sprites/schema.ts) */
  animation?: string;
}

// ---------- Equipment ----------
export type EquipSlot = 'weapon' | 'armor' | 'helmet' | 'accessory';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type AffixStat =
  | 'atk_pct' | 'matk_pct' | 'hp_pct' | 'def_pct' | 'speed_flat'
  | 'crit_rate' | 'crit_dmg' | 'evasion' | 'lifesteal' | 'mp_flat'
  | 'drop_bonus' | 'exp_bonus';

export interface Affix { stat: AffixStat; value: number }

export interface ItemInstance {
  id: string;            // uuid
  baseId: string;        // อ้าง baseItems ใน gamedata
  slot: EquipSlot;
  rarity: Rarity;
  upgradeLevel: number;  // 0..15 (+8% base stat ต่อขั้น)
  droppedFloor: number;  // ชั้นที่ดรอป — ใช้คำนวณ main stat: baseValue + perFloor*droppedFloor
  affixes: Affix[];
}

// ---------- Combatants ----------
export interface Combatant {
  id: string;
  name: string;
  side: 'party' | 'enemy';
  classId: ClassId | 'monster';
  level: number;
  stats: BaseStats;
  derived: DerivedStats;
  skills: string[];      // skill ids ที่ใช้ได้
  rules: Rule[];
  isBoss?: boolean;
  monsterId?: string;    // อ้าง archetype สำหรับ drop table
}

// ---------- Battle I/O ----------
export interface WaveSpec { monsters: Combatant[] }

export interface CombatEvent {
  turn: number;
  wave: number;
  actorId: string;
  actorName: string;
  action: ActionType;
  skillId?: string;
  targets: {
    id: string; name: string;
    damage?: number; heal?: number; shield?: number;
    crit?: boolean; evaded?: boolean; killed?: boolean;
    hpAfter: number;
  }[];
  /**
   * 'windup' (รอบ 2M): มอนตั้งท่าหมายหัวเป้าใน `targets` — เทิร์นถัดไปของมันจะทุบเป้านั้น
   * (ดู RegionMechanic) · event นี้ไม่มีดาเมจ มีไว้ให้ฉากและบันทึกการรบบอกผู้เล่นก่อนโดนทุบ
   */
  note?: 'wave_start' | 'wave_clear' | 'defend' | 'windup';
  /**
   * เฟส 2B-1 (เพิ่มได้ตาม docs/api-spec.md — เพิ่มอย่างเดียว ไม่แก้ของเดิม)
   * line: บรรทัดในโปรแกรม BloxCode ที่ตัดสินใจเทิร์นนี้ (0 = ใช้การกระทำสำรอง)
   *       มีเฉพาะตัวที่ขับด้วยโปรแกรม — ตัวที่ยังใช้ rules เดิมจะไม่มี field นี้
   */
  line?: number;
  /** codeWarnings: คำเตือนตอนรันโปรแกรม เช่น "MP ไม่พอสำหรับ blizzard" */
  codeWarnings?: string[];
}

export interface DropResult {
  gold: number;
  materials: number;
  items: ItemInstance[];
}

export interface BattleResult {
  victory: boolean;
  wavesCleared: number;   // 0..10
  events: CombatEvent[];
  drops: DropResult;
  expGained: number;
  seed: number;
}

/**
 * สัญญาหลักของ engine — deterministic: seed เดิม + input เดิม = ผลเดิมเสมอ
 * party: ตัวละครผู้เล่น (สร้างจาก character+equipment ด้วย buildDerivedStats)
 * floor: 1..N  ใช้ gamedata สร้าง 10 waves (wave 10 = boss)
 */
export interface EngineApi {
  runBattle(party: Combatant[], floor: number, seed: number): BattleResult;
  buildDerivedStats(
    classId: ClassId, level: number, stats: BaseStats, equipment: ItemInstance[]
  ): DerivedStats;
  buildWaves(floor: number, partySize: number, seed: number): WaveSpec[];
  rollItem(floor: number, seed: number, dropBonus: number): ItemInstance | null;
}

// ---------- สูตรกลาง (ทุก dev ใช้ตามนี้) ----------
export const FORMULAS = {
  maxHp: (vit: number, level: number) => 50 + vit * 12 + level * 10,
  maxMp: (int: number, level: number) => 20 + int * 5 + level * 2,
  atk: (str: number) => 5 + str * 2,
  matk: (int: number) => 5 + int * 2.5,
  def: (vit: number) => vit * 1,
  mdef: (int: number, vit: number) => int * 0.5 + vit * 0.5,
  speed: (agi: number) => 10 + agi * 1.5,
  critRate: (luk: number) => Math.min(0.5, 0.05 + luk * 0.004),
  evasion: (agi: number) => Math.min(0.35, agi * 0.002),
  dropBonus: (luk: number) => luk * 0.005,
  /** ดาเมจกายภาพ: atk * power% - def*0.5, ผันแปร ±10%, ต่ำสุด 1 */
  physicalDamage: (atk: number, powerPct: number, def: number, variance: number) =>
    Math.max(1, Math.round((atk * (powerPct / 100) - def * 0.5) * variance)),
  magicDamage: (matk: number, powerPct: number, mdef: number, variance: number) =>
    Math.max(1, Math.round((matk * (powerPct / 100) - mdef * 0.5) * variance)),
  /** EXP ที่ต้องใช้เพื่อขึ้นจาก level n -> n+1 */
  expToNext: (n: number) => Math.round(20 * Math.pow(n, 1.8)),
  statPointsPerLevel: 5,
  /** ตีบวก: +8% base stats ต่อขั้น */
  upgradeBonusPerLevel: 0.08,
  upgradeMaterialCost: (currentLevel: number) => Math.round(10 * Math.pow(1.35, currentLevel)),
  upgradeGoldCost: (currentLevel: number) => Math.round(50 * Math.pow(1.3, currentLevel)),
  /** co-op (เฟส 3): มอนคูณ 1 + 0.5*(สมาชิกเพิ่ม), ดรอป +25%/คน */
  coopMonsterMult: (partySize: number) => 1 + 0.5 * (partySize - 1),
  coopDropMult: (partySize: number) => 1 + 0.25 * (partySize - 1),
} as const;

// ---------- ภูมิภาคบนแผนที่โลก (รอบ 2W) ----------

/**
 * ภูมิภาคหนึ่งบนแผนที่ = ธีม + สระมอน + บทเรียน ที่วางทับบน "เลขความยาก" เดิม
 *
 * กฎเหล็กของรอบ 2W: **`floor` ยังเป็นแกนความยากภายในเหมือนเดิม**
 * ความยากของการรบหนึ่งรอบ = `floorBase + depth - 1` แล้วส่งเข้า runBattle ตามปกติ
 * เหตุผล: รอบ 2P เพิ่งกวาดค่าจนเข้าเกณฑ์ B1-B5 ครบ ถ้าเปลี่ยนหน่วยความยากตอนนี้
 * งานวัดทั้งหมดเป็นโมฆะ (ดู docs/design-round2w.md §2)
 */
export interface RegionDef {
  id: string;
  nameTh: string;
  /** ความยากของรอบที่ depth=1 */
  floorBase: number;
  /** เข้าได้กี่รอบ (แต่ละรอบ = 10 เวฟ) */
  depths: number;
  /** archetype id ที่โผล่ในโซนนี้ — เว้นไว้ = ใช้สระรวมตามเดิม */
  pool?: string[];
  /** บทบาทของ "ตัวอันตราย" ที่การันตีต่อเวฟ (รอบ 2P) — เว้นไว้ = 'bruiser' */
  threatRole?: string;
  /**
   * บทเรียนของโซนนี้ เขียนให้ผู้เล่นอ่านบนการ์ดก่อนเข้า
   * นี่คือเหตุผลที่แผนที่ดีกว่าหอคอย: กำแพงที่เป็น *แนวคิด* แข็งแรงกว่ากำแพงที่เป็น *ตัวเลข*
   */
  lessonTh: string;
  /** โอกาสที่รอบนั้นจะมีมอน EX (0..1) */
  eliteChance: number;
  /** กลไกของโซน (รอบ 2M) — เว้นไว้ = มอนทุกตัวทำตามโปรแกรมของมันอย่างเดียว */
  mechanic?: RegionMechanic;
  /**
   * ตำแหน่งบนภาพแผนที่ เป็นสัดส่วน 0..1 ของความกว้าง/สูง
   * ใส่ค่าชั่วคราวไปก่อนได้ — ปรับให้ตรงภาพจริงตอนภาพมาถึง
   */
  hotspot: { x: number; y: number; r: number };
}

/**
 * กลไกของโซน (รอบ 2M — docs/design-round2m.md)
 *
 * 'windup' = หมายหัว: มอน archetype ที่ระบุ (รวม EX และบอสของ archetype นั้น) ทุกเทิร์นที่ `every`
 * ของมันจะ **ตั้งท่า** แทนการทำตามโปรแกรม แล้วหมายหัวผู้เล่นหนึ่งคน เทิร์นถัดไปของมันจะ **ทุบ** คนนั้น
 * ด้วยสกิล `mon_crush` (แรงอยู่ที่ power ของสกิลใน gamedata) · ระหว่างนั้น has_debuff("marked")
 * ของคนที่ถูกหมายเป็นจริง
 *
 * ทำไมเป็นข้อมูลของโซน ไม่ใช่ของมอน: โกเลมตัวเดียวกันที่หอคอยต้องไม่เปลี่ยนพฤติกรรม
 * (หอคอยคือทางพลังตามรอบ 2L และมี golden fixture คุมอยู่) — กลไกคือ "บทเรียนของที่นี่"
 */
export interface RegionMechanic {
  kind: 'windup';
  archetypes: string[];
  every: number;
  /**
   * สัดส่วนของท่าทุบที่ทะลุ `defend()` (0..1) — ต่ำกว่าการโจมตีปกติ (0.5) โดยตั้งใจ
   * เพราะเกณฑ์ M2: คนที่อ่านจังหวะถูกต้องแทบไม่เจ็บ ส่วนคนที่ไม่อ่านโดนเต็ม ๆ
   */
  guardMult: number;
}

/**
 * มอน EX ที่ถูกปลุกในรอบนั้น — เซิร์ฟเวอร์สุ่มตอนกดเข้า แล้ว **ต้องบอกผู้เล่นก่อนเริ่มรบ**
 *
 * กติกาที่ห้ามผิด: ดวงต้องไม่เป็นตัวตัดสินว่าผ่านหรือไม่ผ่าน เกมนี้สัญญาว่า
 * "โค้ดดีขึ้นแล้วผ่าน" ถ้า EX โผล่กลางทางแล้วแพ้ทั้งที่โค้ดเหมือนเดิม สัญญานั้นเป็นโมฆะ
 */
export interface EliteSpawn {
  /** เวฟที่มันจะอยู่ (1..10) — รู้ล่วงหน้าเสมอ */
  wave: number;
  archetypeId: string;
  nameTh: string;
}

/**
 * คู่ดวล — ตัวละครของผู้เล่นอีกคนพร้อมโปรแกรมของเขา
 *
 * engine รองรับอยู่แล้วโดยไม่ต้องแก้อะไร: `programOf()` ใน battle.ts เช็ก `programSource`
 * ก่อนเช็ก `side === 'enemy'` ตัวละครฝั่งศัตรูที่พกโปรแกรมมาจึงใช้โปรแกรมนั้น
 *
 * ส่งเท่าที่จำเป็นต้องใช้รบ + ชื่อกับคลาสไว้แสดงผล ไม่ต้องพกข้อมูลบัญชีอื่นมาด้วย
 */
export interface DuelOpponent {
  username: string;
  classId: ClassId;
  level: number;
  stats: BaseStats;
  derived: DerivedStats;
  skills: string[];
  /** โปรแกรม BloxCode ของเขา — ฝ่ายแพ้จะได้เห็นหลังจบการรบ (docs/design-round2w.md §5.4) */
  programSource: string;
  /** true = คนนี้กำลังออนไลน์อยู่โซนเดียวกันจริง · false = สแนปช็อตที่เก็บไว้ */
  live: boolean;
}

/**
 * ผลการดวล — **ไม่ใช่ `BattleResult`** โดยตั้งใจ
 *
 * `BattleResult.victory` มองจากมุมของ "ปาร์ตี้" ซึ่งในการดวลไม่มีความหมาย เพราะทั้งสองฝ่าย
 * เป็นผู้เล่นเท่ากัน ถ้าคืน victory ไป ผู้เรียกฝั่งหนึ่งจะต้องกลับค่าเอง ซึ่งเป็นจุดที่พลาดง่าย
 * และทำให้เกณฑ์ W2 (ทั้งคู่ต้องได้ผลชุดเดียวกันเป๊ะ) พังแบบเงียบ ๆ
 *
 * จึงคืน `winnerId` แทน แล้วให้แต่ละฝั่งเทียบกับ id ของตัวเอง — ข้อมูลชุดเดียว ตีความได้สองมุม
 */
export interface DuelResult {
  /** บันทึกการรบ — ชุดเดียวกันทุกไบต์ไม่ว่าจะเรียกจากฝั่งไหน */
  events: CombatEvent[];
  winnerId: string;
  /** true = ครบรอบสูงสุดแล้วยังไม่มีใครตาย ตัดสินด้วยสัดส่วนเลือดที่เหลือ */
  byTimeout: boolean;
  rounds: number;
}

// ---------- ค่าความชำนาญ (รอบ 2P) ----------

/**
 * "งาน" ที่ตัวละครทำในการต่อสู้ แยกตามสเตตัสที่มันควรทำให้โต
 *
 * หน่วยเป็นสัดส่วน ไม่ใช่จำนวนครั้ง — ตีก็อบลินชั้น 1 ร้อยครั้งต้องไม่เท่าตีบอสชั้น 8 สามครั้ง
 * (ดู docs/design-round2p.md §3.2 สำหรับที่มาของแต่ละช่อง)
 */
export interface Proficiency {
  str: number; // ดาเมจกายภาพที่ทำได้ ÷ maxHp ของเป้า
  int: number; // ดาเมจเวท + HP ที่ฮีล ÷ maxHp ของเป้า (โล่ย้ายไป vit แล้ว — ดู §3.2)
  vit: number; // ดาเมจที่รับแล้วรอด ÷ maxHp ตัวเอง · ที่ defend กันได้ · ทุกเทิร์นที่เลือกเล่นรับ
  agi: number; // เทิร์นที่ลงมือก่อนศัตรู + ครั้งที่หลบได้
  luk: number; // คริที่ออก + ไอเทมที่ดรอป
}

export const ZERO_PROFICIENCY: Proficiency = { str: 0, int: 0, vit: 0, agi: 0, luk: 0 };

/**
 * น้ำหนักสำรองของแต่ละคลาส ใช้เมื่อเลเวลอัพโดยไม่มีงานที่วัดได้เลย
 * (เช่นชนะเพราะศัตรูฆ่ากันเอง) — ไม่งั้นแต้มจะกระจายเท่ากันซึ่งไม่เข้ากับคลาสไหนเลย
 */
export const CLASS_DEFAULT_WEIGHTS: Record<ClassId, Proficiency> = {
  novice:   { str: 0.4, int: 0.1, vit: 0.3, agi: 0.1, luk: 0.1 },
  warrior:  { str: 0.5, int: 0.0, vit: 0.3, agi: 0.1, luk: 0.1 },
  mage:     { str: 0.0, int: 0.6, vit: 0.2, agi: 0.1, luk: 0.1 },
  guardian: { str: 0.2, int: 0.1, vit: 0.5, agi: 0.1, luk: 0.1 },
};

/**
 * สเตตัสที่ "โปรแกรมของผู้เล่นสั่งได้จริง" — มีแค่สามตัวนี้ที่ความชำนาญควบคุม
 *
 * แก้เมื่อ 19 ก.ย. 2026 หลังวัดของจริง: AGI กับ LUK เขียนโปรแกรมไล่ตามไม่ได้
 * ความเร็วเป็นตัวตัดสินลำดับเทิร์น ไม่ใช่สิ่งที่โค้ดสั่งได้ และคริออกเพราะ LUK สูง
 * ไม่ใช่เพราะเขียนโค้ดเก่ง — ทั้งคู่จึงเป็นผลของสเตตัส ไม่ใช่เหตุ การเอามาเป็น
 * ความชำนาญทำให้เกิดวงจรป้อนกลับที่ผู้เล่นควบคุมไม่ได้ (วัดจริงแล้วผู้พิทักษ์ที่
 * ตั้งใจเล่นสายตันได้ AGI 3 แต้มจาก 5 ซึ่งไม่มีใครตั้งใจ)
 */
export const PROFICIENCY_STATS = ['str', 'int', 'vit'] as const;

/** AGI/LUK โตเองเลเวลละครึ่งแต้ม สลับกันไปเพื่อให้เป็นจำนวนเต็มเสมอ */
export const PASSIVE_STATS = ['agi', 'luk'] as const;

/** แต้มต่อเลเวลที่กันไว้ให้ AGI/LUK (ที่เหลือแจกตามความชำนาญ) */
export const PASSIVE_POINTS_PER_LEVEL = 1;

/**
 * ตัวคูณปรับหน่วยของแต่ละช่องให้เทียบกันได้
 *
 * ทำไมต้องมี: ช่องพวกนี้วัดคนละอย่างโดยธรรมชาติ รันหนึ่งรอบที่ชนะ ผู้เล่นทำดาเมจ
 * ราว 26 หลอด (ฆ่าศัตรู 26 ตัว) แต่รับดาเมจแค่ราว 1 หลอด ถ้าเอาเลขดิบมาเทียบกัน
 * STR/INT จะชนะ VIT ตลอดกาลไม่ว่าเล่นยังไง — ซึ่งทำลายคำสัญญาของระบบนี้ทั้งระบบ
 *
 * ค่าที่ตั้งไว้มาจากการวัดจริง (ดู engine/tools/profprobe.cjs) และจูนได้โดยไม่แตะโค้ด
 */
export const PROFICIENCY_WEIGHTS: Record<(typeof PROFICIENCY_STATS)[number], number> = {
  str: 1,
  int: 1,
  /**
   * 2 ไม่ใช่ 9 — แก้เมื่อ 19 ก.ย. 2026 หลังกวาดค่าจริง 154 เคสต่อสไตล์
   * (ชั้น 1-8 x 7 seed x เลเวลที่สมน้ำสมเนื้อ ดู `npm run profprobe -w engine`)
   * ที่ 9 ผ่านเฉพาะจุดวัดจุดเดียว แต่ตกถึง 73/154 เคส: นักรบที่ตีอย่างเดียว
   * ได้ VIT ขึ้นมาแทน STR ในหนึ่งในสามของเคส = "ตีอย่างเดียวแล้วได้สายตัน"
   * ช่วงที่ปลอดภัยคือ 1-3 เลือก 2 เป็นจุดกลาง
   */
  vit: 2,
};

/**
 * ตีบวกได้สูงสุดถึงขั้นนี้ (ไม่มีของแตก)
 * ย้ายมาไว้ที่นี่ 19 ก.ย. 2026: เดิมเลข 15 ถูกเขียนซ้ำเป็นค่าดิบใน server
 * และเป็นค่าคงที่แยกอีกตัวใน client — สามที่ที่ต้องแก้พร้อมกันคือสามที่ที่จะลืมแก้
 */
export const UPGRADE_MAX_LEVEL = 15;

export const SALVAGE_MATERIALS: Record<Rarity, number> = {
  common: 1, uncommon: 3, rare: 8, epic: 20, legendary: 50,
};

export const AFFIX_SLOTS: Record<Rarity, [number, number]> = {
  common: [0, 1], uncommon: [1, 2], rare: [2, 3], epic: [3, 4], legendary: [4, 4],
};
