/**
 * ค่าความชำนาญ — "โปรแกรมที่คุณเขียน คือบิลด์ของคุณ" (docs/design-round2p.md §3.2)
 *
 * โมดูลนี้ทำสองอย่างและไม่ทำอย่างอื่นเลย:
 *   1. proficiencyFromBattle() — อ่านเหตุการณ์การรบ แล้วสรุปว่า hero ตัวนี้ทำ "งาน" อะไรไปเท่าไร
 *   2. allocatePoints()        — แจก N แต้มตามสัดส่วนงาน คืนจำนวนเต็มที่รวมได้ N พอดีเสมอ
 *
 * แก้รอบสอง (19 ก.ย. 2026) หลัง PM วัดด้วย tools/profprobe.cjs แล้วพบว่าคำสัญญา
 * "โปรแกรมคือบิลด์" เป็นโมฆะ: ผู้พิทักษ์สายตันได้ AGI 3 จาก 5 แต้ม สิ่งที่เปลี่ยน —
 *   · ความชำนาญคุมแค่ PROFICIENCY_STATS (str/int/vit) · AGI/LUK โตเองตามเลเวล
 *   · โล่และการยั่วยุนับเป็นงานของ VIT (สไตล์การเล่น) ไม่ใช่ INT (สูตรที่คูณค่าให้)
 *   · งานดิบคูณด้วย PROFICIENCY_WEIGHTS ก่อนเทียบกัน เพราะคนละหน่วยกัน
 *   · ไม่มี "แต้มพื้น" อีกแล้ว — ตัวบางเพราะไม่เคยป้องกันคือบทเรียนที่เกมควรสอน
 *
 * ทำไมนับเป็น "สัดส่วนของหลอดเลือด" ไม่ใช่ "จำนวนครั้งที่เรียก":
 * ถ้านับจำนวนครั้ง ผู้เล่นจะปั๊มสเตตัสด้วยการกดคำสั่งรัว ๆ กับศัตรูที่อ่อนที่สุดได้
 * การหารด้วย maxHp ของเป้าทำให้ "หนึ่งหน่วยงาน = ล้มหลอดเลือดได้หนึ่งหลอด" เสมอ
 * ไม่ว่าตัวเลขดาเมจจะใหญ่แค่ไหน (ดาเมจล้นเกินไม่ถูกนับ — ดู creditedDamage)
 */
import {
  CLASS_DEFAULT_WEIGHTS, FORMULAS, PASSIVE_POINTS_PER_LEVEL, PASSIVE_STATS,
  PROFICIENCY_STATS, PROFICIENCY_WEIGHTS, ZERO_PROFICIENCY,
} from './types';
import type {
  BaseStats, BattleResult, ClassId, CombatEvent, Proficiency,
} from './types';
import { getSkill } from './data';

/** ลำดับคงที่ของสเตตัส — ใช้ทั้งการวนและการตัดสินเสมอตอนปัดเศษ (ต้อง deterministic) */
const STAT_ORDER = ['str', 'int', 'vit', 'agi', 'luk'] as const;
type ProfStat = (typeof PROFICIENCY_STATS)[number];

/**
 * หน่วยของ "งานที่นับเป็นครั้ง" (เฉพาะช่อง AGI/LUK ซึ่งตอนนี้ไม่มีผลกับการแจกแต้มแล้ว)
 * เก็บไว้เพื่อให้ Proficiency ยังบอกความจริงว่าเกิดอะไรขึ้นในการรบ (ใช้โชว์/วิเคราะห์)
 * — ดูหัวข้อ "AGI/LUK ไม่ใช่ความชำนาญ" ใน allocatePoints
 */
const EVENT_WORK_UNIT = 0.5;

/**
 * งาน VIT ของ "หนึ่งเทิร์นที่เลือกเล่นเป็นฝ่ายรับ" (ตั้งการ์ด · ยั่วยุ · กางโล่)
 * หน่วยเดียวกับช่องอื่น = สัดส่วนของหลอดเลือดหนึ่งหลอด
 *
 * ทำไมต้องมี — เพราะถ้านับแต่ "ดาเมจที่รับแล้วรอด" ตามตัวอักษรของ §3.2 อย่างเดียว
 * ระบบจะลงโทษคนเล่นสายตันสองชั้น: (1) ยิ่งตันยิ่งโดนน้อย งานยิ่งน้อย — วัดจริงแล้ว
 * ผู้พิทักษ์รับดาเมจแค่ 0.4 หลอดต่อรัน ขณะที่นักรบที่บางกว่ารับ 1.2 หลอด
 * (2) ยั่วยุกับโล่แทบไม่ทิ้งร่องรอยในเหตุการณ์เลย — การเปลี่ยนเป้าหมายเกิดเงียบ ๆ
 * ใน battle.ts (applyTaunt) และ CombatEvent ไม่ได้บอกว่า "เดิมหมัดนี้จะไปลงที่ใคร"
 * จึงวัดดาเมจที่ดึงมาไม่ได้จริงถ้าไม่แก้สัญญา (ซึ่งห้ามแก้)
 *
 * สิ่งที่ผู้เล่นควบคุมได้จริงคือ "เทิร์นนี้จะเล่นรุกหรือรับ" จึงให้ค่าเป็นรายเทิร์น
 * ผลคือสัดส่วนแต้มสะท้อนสัดส่วนเทิร์นที่โปรแกรมเลือกเล่นรับ ซึ่งคือคำสัญญาของระบบนี้
 *
 * ทำไมเลือก 0.25: วัดแล้วหนึ่งเทิร์นที่ใช้ "ตี" ให้งานราว 0.7-1.0 หลอด (ตีจนหลอดหมด
 * = 1 หลอดพอดี) ผมตั้งเทิร์นรับไว้ราวหนึ่งในสามของเทิร์นรุกในหน่วยดิบ พอคูณด้วย
 * PROFICIENCY_WEIGHTS.vit ที่แนะนำ (2) จะได้ ~0.5 คือ "เทิร์นรับ ≈ ครึ่งหนึ่งของเทิร์นรุก"
 * — ตั้งใจให้ต่ำกว่าเทิร์นรุก เพราะการตีต้องเสี่ยงและต้องเล็งเป้าเป็น ส่วนการรับไม่ต้อง
 */
const DEFENSIVE_TURN_WORK = 0.25;

/** สกิลที่ถือว่า "เทิร์นนี้เล่นเป็นฝ่ายรับ" — ฮีลไม่นับ เพราะเป็นเวทสนับสนุน (INT) */
const DEFENSIVE_SKILL_KINDS = new Set(['taunt', 'shield']);

/** ปัดค่าประหลาด (NaN / ติดลบ / อนันต์) ทิ้งเป็น 0 — งานติดลบไม่มีความหมาย */
const clean = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

// ===========================================================================
// 1. อ่านการรบ → Proficiency
// ===========================================================================

/**
 * maxHp ของเป้าหมาย: §3.2 ต้องใช้หาร แต่ CombatEvent ไม่มี field นี้
 * (types.ts แก้ไม่ได้ — PM เป็นเจ้าของ) จึงหามาจากสามทางตามลำดับความแม่น:
 *   1. เหตุการณ์ note='wave_start' — battle.ts ใส่รายชื่อมอนทั้งเวฟพร้อม hpAfter
 *      ซึ่งตอนนั้นคือเลือดเต็มพอดี = maxHp เป๊ะ ไม่ใช่การประมาณ
 *   2. hero เอง — ผู้เรียกส่ง heroMaxHp มาให้
 *   3. เพื่อนร่วมปาร์ตี้ (โหมด co-op) — ไม่มีใครประกาศเลือดเต็มไว้ จึงประมาณจาก
 *      ค่าสูงสุดของ (hpAfter + damage) ที่เคยเห็น ซึ่งเป็นขอบล่างที่ดีที่สุดที่มี
 *      และถ้าไม่เคยเห็นเลยใช้ heroMaxHp แทน (สเกลใกล้กันที่สุดที่เรารู้)
 */
class HpTracker {
  /** maxHp ที่รู้แน่ (roster ของเวฟ + hero) */
  private readonly known = new Map<string, number>();
  /** ขอบล่างที่ดีที่สุดของ maxHp สำหรับตัวที่ไม่รู้แน่ */
  private readonly guess = new Map<string, number>();
  /** เลือดล่าสุดที่เห็น — ใช้กันไม่ให้ "ดาเมจล้นเกิน" ถูกนับเป็นงาน */
  private readonly current = new Map<string, number>();

  constructor(private readonly fallback: number) {}

  declareFull(id: string, maxHp: number): void {
    if (maxHp > 0) this.known.set(id, maxHp);
    this.current.set(id, maxHp);
  }

  observe(id: string, hpAfter: number, damage: number): void {
    const before = hpAfter + damage;
    if (!this.known.has(id)) {
      this.guess.set(id, Math.max(this.guess.get(id) ?? 0, before, hpAfter));
    }
    this.current.set(id, hpAfter);
  }

  maxHpOf(id: string): number {
    return this.known.get(id) ?? this.guess.get(id) ?? this.fallback;
  }

  /** เลือดก่อนโดนตีครั้งนี้ — ไม่รู้ก็ถือว่าเต็ม */
  hpBefore(id: string): number {
    return this.current.get(id) ?? this.maxHpOf(id);
  }
}

/**
 * ดาเมจที่ "นับเป็นงาน" = ส่วนที่กินหลอดเลือดจริง
 * ตีก็อบลินเลือด 60 ด้วยหมัด 900 ได้เครดิตเท่ากับตีด้วยหมัด 60 — ล้นเกินไม่นับ
 * ถ้าไม่ตัดตรงนี้ ตัวละครเลเวลสูงที่ย้อนไปถล่มชั้น 1 จะปั๊ม STR ได้ไม่จำกัด
 *
 * หมัดที่ไม่ฆ่า (hpAfter > 0) นับเต็มเสมอ เพราะเหตุการณ์บอกความจริงครบแล้ว
 * ส่วนหมัดที่ฆ่า (hpAfter = 0) ไม่รู้ว่าล้นไปเท่าไร จึงตัดด้วยเลือดที่ติดตามไว้
 */
function creditedDamage(damage: number, hpAfter: number, trackedBefore: number): number {
  if (damage <= 0) return 0;
  return hpAfter > 0 ? damage : Math.max(0, Math.min(damage, trackedBefore));
}

/** ประเภทงานของ 1 การกระทำ — ใช้ตัดสินว่าดาเมจก้อนนี้เข้า STR หรือ INT */
function damageStatOf(e: CombatEvent): 'str' | 'int' {
  if (e.action !== 'skill' || !e.skillId) return 'str'; // โจมตีปกติ = กายภาพเสมอ
  const kind = getSkill(e.skillId)?.kind;
  // สกิลที่ไม่รู้จัก (บล็อกใหม่ที่ยังไม่อยู่ใน gamedata) ถือเป็นกายภาพ
  // เพราะ battle.ts ก็คิดดาเมจจาก atk เป็นค่าตั้งต้นเหมือนกัน
  return kind === 'magic' ? 'int' : 'str';
}

/**
 * ช่องของงาน "ฮีล/โล่" — แบ่งตาม *สไตล์การเล่น* ไม่ใช่ตามสเตตัสที่คูณค่าให้
 * (แก้ 19 ก.ย. 2026 ตามคำสั่ง PM รอบสอง)
 *
 * โล่/ปราการเข้า VIT ไม่ใช่ INT เพราะคนที่กางโล่คือคนเล่นสายตัน ไม่ใช่สายเวท —
 * ถึงสูตรจะคิดค่าโล่จาก matk ก็ตาม สูตรเป็นรายละเอียดภายใน ไม่ใช่สิ่งที่ผู้เล่นตั้งใจ
 * ส่วนฮีลยังเป็น INT เพราะเป็นเวทสนับสนุน: คนร่ายฮีลคือคนเล่นสายเวท
 */
const SHIELD_STAT: ProfStat = 'vit';
const HEAL_STAT: ProfStat = 'int';

/** เทิร์นนี้ hero เลือกเล่นเป็นฝ่ายรับหรือเปล่า (ดู DEFENSIVE_TURN_WORK) */
function isDefensiveTurn(e: CombatEvent): boolean {
  if (e.action === 'defend') return true;
  if (e.action !== 'skill' || !e.skillId) return false;
  const kind = getSkill(e.skillId)?.kind;
  return kind !== undefined && DEFENSIVE_SKILL_KINDS.has(kind);
}

export function proficiencyFromBattle(
  result: BattleResult,
  heroId: string,
  heroMaxHp: number,
): Proficiency {
  const work: Proficiency = { ...ZERO_PROFICIENCY };
  const hp = new HpTracker(heroMaxHp > 0 ? heroMaxHp : 1);
  hp.declareFull(heroId, heroMaxHp);

  /** id ของฝ่ายศัตรู — ได้จาก roster ของทุกเวฟ ใช้ตัดสิน "ลงมือก่อนศัตรู" */
  const enemyIds = new Set<string>();
  /** รอบไหน hero ลงมือเป็นลำดับที่เท่าไร / ศัตรูตัวแรกลงมือเป็นลำดับที่เท่าไร */
  const heroActedAt = new Map<number, number>();
  const enemyActedAt = new Map<number, number>();
  /**
   * hero ตั้งการ์ดค้างอยู่ไหม — battle.ts ล้างสถานะนี้ตอนต้นเทิร์นของเจ้าตัว
   * ที่นี่จึงถือว่า "ตั้งการ์ดจนกว่าจะเห็น hero ทำอย่างอื่น หรือขึ้นเวฟใหม่"
   * (ข้อจำกัดที่ยอมรับ: เทิร์นที่สั่ง wait() ไม่มีเหตุการณ์ออกมาเลย จึงมองไม่เห็น)
   */
  let defending = false;

  result.events.forEach((e, idx) => {
    if (e.note === 'wave_start') {
      for (const t of e.targets) {
        enemyIds.add(t.id);
        hp.declareFull(t.id, t.hpAfter);
      }
      defending = false;
      return;
    }
    if (e.note === 'wave_clear') return;

    const isHero = e.actorId === heroId;
    if (isHero && !heroActedAt.has(e.turn)) heroActedAt.set(e.turn, idx);
    if (enemyIds.has(e.actorId) && !enemyActedAt.has(e.turn)) enemyActedAt.set(e.turn, idx);

    if (isHero) defending = e.action === 'defend';

    // เทิร์นที่เลือกเล่นเป็นฝ่ายรับ (ตั้งการ์ด/ยั่วยุ/กางโล่) → งานของ VIT
    // ต้องนับนอกลูปเป้าหมาย เพราะเหตุการณ์พวกนี้ไม่มีตัวเลขในช่อง targets เลย
    // (ตั้งการ์ดมี targets ว่าง ส่วนยั่วยุมีแค่ชื่อตัวเอง)
    if (isHero && isDefensiveTurn(e)) work.vit += DEFENSIVE_TURN_WORK;

    for (const t of e.targets) {
      const before = hp.hpBefore(t.id);
      const maxHp = hp.maxHpOf(t.id) || 1;
      const damage = t.damage ?? 0;

      if (isHero) {
        // ---- งานที่ hero ทำ ----
        if (damage > 0 && t.id !== heroId) {
          work[damageStatOf(e)] += creditedDamage(damage, t.hpAfter, before) / maxHp;
        }
        // ฮีล/โล่ คิดเทียบหลอดของ "ผู้รับ" รวมกรณีร่ายใส่ตัวเอง
        if (t.heal) work[HEAL_STAT] += t.heal / maxHp;
        if (t.shield) work[SHIELD_STAT] += t.shield / maxHp;
        if (t.crit) work.luk += EVENT_WORK_UNIT;
      }

      if (t.id === heroId && !isHero) {
        // ---- งานที่คนอื่นทำใส่ hero ----
        if (t.evaded) work.agi += EVENT_WORK_UNIT;
        // "อึด" = รับของหนักแล้วรอด — หมัดที่ฆ่าเราไม่นับ
        if (damage > 0 && t.hpAfter > 0) {
          const taken = creditedDamage(damage, t.hpAfter, before) / (heroMaxHp || 1);
          // ตอนตั้งการ์ด battle.ts หารดาเมจครึ่งหนึ่ง ดาเมจที่เห็นจึงเท่ากับส่วนที่กันไว้ได้พอดี
          work.vit += defending ? taken * 2 : taken;
        }
      }

      if (t.damage !== undefined || t.heal !== undefined || t.shield !== undefined) {
        hp.observe(t.id, t.hpAfter, damage);
      }
    }
  });

  // เทิร์นที่ได้ลงมือก่อนศัตรู (ไม่มีศัตรูลงมือในรอบนั้นเลยก็ถือว่าได้ก่อน)
  for (const [turn, heroIdx] of heroActedAt) {
    const enemyIdx = enemyActedAt.get(turn);
    if (enemyIdx === undefined || heroIdx < enemyIdx) work.agi += EVENT_WORK_UNIT;
  }

  // ไอเทมที่ดรอป: DropResult เป็นของทั้งปาร์ตี้ ไม่ได้แยกรายคน — โหมดเดี่ยวจึงเป็นของ hero
  work.luk += result.drops.items.length * EVENT_WORK_UNIT;

  for (const k of STAT_ORDER) work[k] = clean(work[k]);
  return work;
}

// ===========================================================================
// 2. แจกแต้ม
// ===========================================================================

/**
 * น้ำหนักที่ใช้แจกจริงในสามช่องที่ความชำนาญคุม
 *
 * งานดิบของแต่ละช่องคนละหน่วยกันโดยธรรมชาติ (รันที่ชนะหนึ่งรอบ ทำดาเมจได้ ~26 หลอด
 * แต่รับดาเมจแค่ ~1 หลอด) จึงคูณด้วย PROFICIENCY_WEIGHTS ก่อนเทียบกัน
 *
 * ถ้าไม่มีงานเลยสักช่อง → ถอยไปใช้ CLASS_DEFAULT_WEIGHTS ของคลาสนั้นเฉพาะสามช่องนี้
 * และ *ไม่* คูณด้วย PROFICIENCY_WEIGHTS เพราะค่ามาตรฐานเป็นสัดส่วนสุดท้ายอยู่แล้ว
 * (นักรบ str .5 vit .3 คือผลที่อยากได้ ไม่ใช่งานดิบที่ต้องแปลงหน่วย)
 */
function weightsOf(work: Proficiency, classId: ClassId): Record<ProfStat, number> {
  const out = {} as Record<ProfStat, number>;
  let total = 0;
  for (const k of PROFICIENCY_STATS) {
    out[k] = clean(work[k]) * PROFICIENCY_WEIGHTS[k];
    total += out[k];
  }
  if (total > 0) return out;

  const fallback = CLASS_DEFAULT_WEIGHTS[classId] ?? CLASS_DEFAULT_WEIGHTS.novice;
  let fbTotal = 0;
  for (const k of PROFICIENCY_STATS) {
    out[k] = clean(fallback[k]);
    fbTotal += out[k];
  }
  // คลาสที่น้ำหนักมาตรฐานเป็นศูนย์ทั้งสามช่อง (ไม่ควรมี) → เท่ากันดีกว่าหารด้วยศูนย์
  if (fbTotal <= 0) for (const k of PROFICIENCY_STATS) out[k] = 1;
  return out;
}

/**
 * แต้มที่กันไว้ให้ AGI/LUK ในก้อนนี้ และแบ่งกันยังไง
 *
 * AGI/LUK ไม่ใช่ความชำนาญ (ดูเหตุผลใน types.ts) มันโตเองเลเวลละ PASSIVE_POINTS_PER_LEVEL แต้ม
 * แต้มเดียวต่อเลเวลหารสองตัวไม่ลงตัว จึงสลับกันตามเลขคี่/คู่ของเลเวล:
 *   เลเวลคี่ → AGI · เลเวลคู่ → LUK  ⇒ สองเลเวลได้ฝ่ายละหนึ่งเสมอ
 * ก้อนใหญ่ (migrate แต้มค้างหลายเลเวลพร้อมกัน) แบ่งครึ่ง เศษที่เหลือตัดสินด้วยเลเวลเดียวกัน
 */
function passiveSplit(
  points: number,
  level: number,
): { each: Record<(typeof PASSIVE_STATS)[number], number>; used: number } {
  const levels = points / FORMULAS.statPointsPerLevel;
  const used = Math.min(points, Math.round(levels * PASSIVE_POINTS_PER_LEVEL));
  const half = Math.floor(used / 2);
  const odd = used - half * 2; // 0 หรือ 1
  const oddTo = Math.abs(Math.trunc(level)) % 2 === 1 ? PASSIVE_STATS[0] : PASSIVE_STATS[1];
  const each = {} as Record<(typeof PASSIVE_STATS)[number], number>;
  for (const k of PASSIVE_STATS) each[k] = half + (k === oddTo ? odd : 0);
  return { each, used };
}

/**
 * แจก points แต้ม — ผลรวมเท่ากับ points พอดีเสมอ
 *
 *   1. กันแต้มให้ AGI/LUK ก่อนตาม PASSIVE_POINTS_PER_LEVEL (ไม่เกี่ยวกับสิ่งที่ผู้เล่นทำ)
 *   2. ที่เหลือแจกใน PROFICIENCY_STATS ตามสัดส่วนงาน × PROFICIENCY_WEIGHTS
 *   3. ปัดด้วย largest remainder (เศษมากได้ก่อน) เสมอกันตัดสินตามลำดับ str > int > vit
 *
 * เหตุผลที่ไม่ใช้ Math.round ทีละตัว: มันไม่การันตีผลรวม เช่น 4 แต้มแบ่งเท่ากันสามทาง
 * จะได้ 1+1+1 = 3 (หายไปหนึ่ง) หรือกรณีอื่นได้เกิน — "พลังรวมที่เลเวล N" ต้องคงที่เป๊ะ
 *
 * @param level เลเวลที่เพิ่งได้ ใช้ตัดสินว่ารอบนี้แต้มเฉื่อยไป AGI หรือ LUK
 */
export function allocatePoints(
  work: Proficiency,
  points: number,
  classId: ClassId,
  level: number,
): BaseStats {
  const total = Math.max(0, Math.floor(points));
  const out: BaseStats = { str: 0, int: 0, vit: 0, agi: 0, luk: 0 };
  if (total === 0) return out;

  const passive = passiveSplit(total, level);
  for (const k of PASSIVE_STATS) out[k] = passive.each[k];

  const rest = total - passive.used;
  if (rest <= 0) return out;

  const w = weightsOf(work, classId);
  const wSum = PROFICIENCY_STATS.reduce((s, k) => s + w[k], 0);

  const raw = {} as Record<ProfStat, number>;
  let assigned = 0;
  for (const k of PROFICIENCY_STATS) {
    raw[k] = (rest * w[k]) / wSum;
    out[k] = Math.floor(raw[k]);
    assigned += out[k];
  }

  const byRemainder = [...PROFICIENCY_STATS].sort((a, b) => {
    const ra = raw[a] - Math.floor(raw[a]);
    const rb = raw[b] - Math.floor(raw[b]);
    if (rb !== ra) return rb - ra;
    return PROFICIENCY_STATS.indexOf(a) - PROFICIENCY_STATS.indexOf(b);
  });
  for (let i = 0; assigned < rest; i++, assigned++) {
    out[byRemainder[i % PROFICIENCY_STATS.length]] += 1;
  }
  return out;
}
