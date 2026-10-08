/**
 * Validate — ตรวจ AST ก่อนบันทึก/ก่อนรบ
 *
 * ตรวจ 7 เรื่อง:
 *   1. ใช้เฉพาะไวยากรณ์ที่ปลดล็อกแล้ว        → LockedFeatureError (บอกชั้นที่ต้องผ่าน)
 *   2. ใช้เฉพาะตัวแปร / คุณสมบัติ / ฟังก์ชันที่มีจริง → NameError (ลิสต์ของที่ใช้ได้ให้เลย)
 *   3. จำนวนและชนิดของ argument ถูกต้อง        → TypeError
 *   4. ชื่อสกิลใน cast() ต้องมีในมือ            → ValueError
 *   5. เป้าหมายต้องอยู่ฝั่งที่ถูก                → TypeError  (รอบ 2F §3.4)
 *   6. หนึ่งการกระทำต่อเทิร์น — บรรทัดที่ไม่มีวันทำงาน → TypeError  (รอบ 2F §3.4)
 *   7. ชื่อสถานะใน has_buff()/has_debuff() ต้องมีจริง → ValueError (รอบ 2F §3.4)
 *
 * เคยมีข้อ "MB ที่ใช้ ≤ MB ที่มี → MemoryError" — ถอดออก 19 ก.ย. 2026
 * ตาม docs/design-round2p.md §3.1 (ระบบ Memory ถูกถอดทั้งระบบ)
 *
 * ---------------------------------------------------------------------------
 * ทำไมข้อ 5-7 เป็น "error" ไม่ใช่ "warning" (รอบ 2F)
 *
 * ทั้งสามข้อมาจากอาการเงียบที่วัดได้ในรอบ 2T: โปรแกรมผ่าน แล้วทำสิ่งที่ผู้เล่นไม่ได้สั่ง
 * ในเกมสอนเขียนโปรแกรม อาการเงียบแย่กว่า error เพราะผู้เล่นเรียนสิ่งที่ผิดโดยไม่มีอะไรขัด
 * เกณฑ์ที่ใช้ตัดสิน: "โค้ดแบบนี้เป็นสิ่งที่ผู้เล่นตั้งใจเขียนได้ไหม"
 *   · `attack(me)` / `cast("firebolt", me)` → เป็นไปไม่ได้เลย (ตีตัวเอง/เผาตัวเอง ไม่ใช่ท่าในเกมนี้)
 *   · บรรทัดที่พิสูจน์ได้ว่าไม่มีวันทำงาน   → เป็นไปไม่ได้ที่จะตั้งใจเขียนบรรทัดที่ไม่ทำงาน
 *   · `has_buff("bananas")`                → เงื่อนไขที่เป็นเท็จตลอดกาล ไม่ใช่สิ่งที่ตั้งใจ
 * ทั้งสามจึงบล็อกการบันทึก และทุกข้อความต้องบอก "แล้วให้เขียนอะไรแทน" พร้อมโค้ดที่ใช้ได้จริง
 *
 * ชื่อ error ที่เลือกใช้คือ TypeError / ValueError ไม่ใช่ SyntaxError — เพราะไวยากรณ์ไม่ได้ผิด
 * (โปรแกรมพวกนี้เป็น Python ที่ถูกต้องทุกตัวอักษร) สิ่งที่ผิดคือ "ค่าที่ใส่" กับ "สัญญาของ turn()"
 * ซึ่งตรงกับตระกูลข้อความเดิมที่ผู้เล่นรอบ 2T อ่านรู้เรื่อง เช่น
 * `attack() ต้องการ 1 argument แต่ได้รับ 2` และ `ไม่มีสกิลชื่อ 'bananas' ในเกม`
 */
import {
  ACTION_FUNCS, FEATURE_LABEL_TH, FEATURE_UNLOCK, GLOBALS, ME_ATTRS, PURE_FUNCS, UNIT_ATTRS,
} from './spec';
import type { Expr, Feature, LangError, Program, Stmt, ValidateOptions, ValidateResult } from './spec';
import { closestName, langError } from './errors';
import { gamedata } from '../data';
import { isElifChain } from './parser';
import { KNOWN_SKILL_NAMES, preferredSkillName, resolveSkillName } from './skills';
import type { SkillInfo } from './skills';

/** ชนิดของค่าที่ตรวจแบบสถิต — 'unknown' = ยังสรุปไม่ได้ ปล่อยผ่าน */
type VType = 'num' | 'str' | 'bool' | 'unit' | 'list' | 'action' | 'unknown';

const TH_TYPE: Record<VType, string> = {
  num: 'ตัวเลข',
  str: 'ข้อความ',
  bool: 'ค่าจริง/เท็จ',
  unit: 'ตัวละคร',
  list: 'ลิสต์ของตัวละคร',
  action: 'คำสั่งการกระทำ',
  unknown: 'ค่า',
};

const PURE_NAMES = Object.keys(PURE_FUNCS);
const ACTION_NAMES = Object.keys(ACTION_FUNCS);
const ALL_FUNC_NAMES = [...PURE_NAMES, ...ACTION_NAMES];

/** ฟังก์ชันที่รับลิสต์แล้วคืนตัวละครหนึ่งตัว — "ตัวแปลงจากลิสต์เป็นตัวละคร" */
const UNIT_PICKERS = ['weakest', 'strongest', 'deadliest', 'fastest', 'random_of'];

/**
 * รายการฟังก์ชันที่จะลิสต์ให้ดูใน NameError — จัดกลุ่มตามหน้าที่ ไม่ใช่เรียงตามตัวอักษร
 * เพราะกลุ่มคือสิ่งที่สอนภาษานี้ได้: "การกระทำ" เลือกได้อย่างเดียวต่อเทิร์น
 * ส่วน "เลือกเป้า" กับ "ตรวจสอบ" เรียกกี่ครั้งก็ได้
 */
const FUNC_GROUPS: { labelTh: string; names: string[] }[] = [
  { labelTh: 'การกระทำ (เลือกได้อย่างเดียวต่อเทิร์น)', names: ['attack', 'cast', 'defend', 'wait'] },
  { labelTh: 'เลือกเป้า', names: UNIT_PICKERS },
  { labelTh: 'ตรวจสอบ', names: ['count', 'len', 'has_buff', 'has_debuff', 'can_cast'] },
];

/**
 * สถานะที่เอนจินสร้างได้จริงตอนนี้ (ดู battle.ts ตรงที่ประกอบ buffs ให้ TurnContext)
 *
 * ทำไมต้องมีรายการนี้: `has_buff("bananas")` เคยผ่าน validate แล้วเป็นเท็จตลอดกาล
 * ผู้เล่นรอบ 2T เขียนเงื่อนไขที่ไม่มีวันเป็นจริงโดยไม่มีอะไรบอก — ซึ่งเป็นอาการเงียบ
 * แบบเดียวกับ `cast("bananas")` ที่ฟ้อง ValueError อยู่แล้วและผู้เล่นบอกว่า "แก้ได้ทันที"
 *
 * ระบบสถานะเต็ม (พิษ/มึน) ถูกเลื่อนไปรอบ 2C ตาม docs/bloxcode-language.md §8
 * เมื่อรอบนั้นมาถึง ให้ย้ายรายการนี้ไป spec.ts/gamedata.json แล้วเลิกฮาร์ดโค้ด
 * ระหว่างนี้มีเทสต์ 'status vocabulary covers every buff battle.ts can produce'
 * คอยกันไม่ให้ชื่อใหม่ใน battle.ts หลุดไปโดยที่ validate ไม่รู้จัก
 */
export const BUFF_NAMES = ['taunt', 'shield'] as const;
/**
 * สถานะร้ายที่มอนใส่ให้เราได้ (รอบ 2M) — แยกคลังจากบัฟเพราะ `has_debuff("shield")`
 * ไม่มีวันเป็นจริง (โล่ไม่ใช่ของที่ศัตรูใส่ให้) การรับไว้เฉย ๆ คืออาการเงียบแบบเดียวกับ "bananas"
 *   marked — โกเลมที่ดินแดนน้ำแข็งตั้งท่าเล็งเราไว้ เทิร์นหน้าของมันจะทุบแรง (battle.ts `windup`)
 */
export const DEBUFF_NAMES = ['marked'] as const;
/** ทุกชื่อรวมกัน — คงไว้ให้ของที่อ้างถึงชื่อเดิม */
export const STATUS_NAMES = [...BUFF_NAMES, ...DEBUFF_NAMES] as const;

interface ActionRef {
  func: string;
  line: number;
  col: number;
}

const actionCallOf = (e: Expr): ActionRef | null =>
  e.kind === 'call' && ACTION_NAMES.includes(e.func)
    ? { func: e.func, line: e.line, col: e.col }
    : null;

/**
 * นิพจน์ที่เป็น "ตัวละครหนึ่งตัว" แน่ ๆ — `units` คือชื่อตัวแปรที่รู้แล้วว่าถือตัวละครอยู่
 * (รวมตัวแปรของ for ด้วย ไม่งั้น `for e in enemies: attack(e)` จะรอดสายตา)
 *
 * ประเมินแบบระมัดระวังไว้ก่อน เพราะข้อนี้ใช้ "พิสูจน์" ว่าบรรทัดถัดไปตาย
 * การเดาเกินจริงจะบล็อกโปรแกรมที่ใช้ได้ ซึ่งแย่กว่าปล่อยผ่าน
 */
const isSurelyUnit = (e: Expr, units: ReadonlySet<string>): boolean =>
  (e.kind === 'name' && (e.id === 'me' || units.has(e.id)))
  || (e.kind === 'call' && UNIT_PICKERS.includes(e.func) && e.args.length === 1);

/**
 * ข้อความเมื่อ `cast()` สกิลที่มีอยู่ในเกมแต่ผู้เล่นยังไม่มี (รอบ 2F §3.4)
 *
 * **ต้องเป็นจริงกับผู้เล่นทุกคน** — ข้อความเดิมบอกว่า "ปลดล็อกด้วยการอัพเลเวล
 * หรือหาบล็อกจากมอนสเตอร์" ซึ่งผิดสองชั้น: บล็อกดรอปจากมอนยังไม่มีในเกม (เป็นงานรอบ 2C)
 * และนักรบอัพเลเวลไปเท่าไรก็ไม่ได้ `heal` เพราะเป็นของจอมเวท
 * เป็นความผิดพลาดแบบเดียวกับ "ต้องผ่านชั้น 13" ที่รอบ 2T จับได้ — สัญญาสิ่งที่เกมให้ไม่ได้
 *
 * ตัว validator ไม่รู้อาชีพของผู้เล่น จึงไม่เดาว่า "อัพเลเวลแล้วจะได้" หรือ "ไม่มีวันได้"
 * แต่บอกข้อเท็จจริงของสกิลตรง ๆ ให้ผู้เล่นตัดสินเอง: นักรบที่อ่าน "เป็นสกิลของจอมเวท"
 * เข้าใจทันทีว่าไม่ใช่ของตัวเอง ส่วนจอมเวทเลเวล 5 ที่อ่าน "ปลดที่เลเวล 7" ก็รู้ว่าต้องรอ
 * แล้วปิดท้ายด้วยสิ่งที่ใช้ได้จริงตอนนี้ — แบบเดียวกับ NameError ที่ `newbie` บอกว่าได้ผลที่สุด
 */
function unownedSkillMessage(written: string, info: SkillInfo, owned: string[]): string {
  const classes = gamedata.classes as Record<string, { nameTh: string } | undefined>;
  const owner = classes[info.classId]?.nameTh ?? info.classId;
  // สกิลประจำภูมิภาคไม่ได้ตามเลเวล — บอกว่าได้จากไหนตามจริง (8 ต.ค. 2569)
  const regionName = info.region ? gamedata.regions.find((r) => r.id === info.region)?.nameTh ?? info.region : null;
  const how = regionName ? `ได้จากการพิสูจน์บทเรียนของ${regionName}` : `ปลดที่เลเวล ${info.unlockLevel}`;
  const facts = `ยังใช้สกิล '${written}' ไม่ได้ — เป็นสกิลของ${owner} ${how}`;
  return owned.length > 0
    ? `${facts} · สกิลที่คุณใช้ได้ตอนนี้: ${owned.join(', ')}`
    : `${facts} · ตอนนี้คุณยังไม่มีสกิลเลย — ใช้ attack() ไปก่อน`;
}

/**
 * การกระทำที่ "เกิดขึ้นแน่นอน" ตัวแรกของคำสั่งนี้ — ใช้หาบรรทัดที่ไม่มีวันทำงาน
 *
 * `cast()` ไม่นับเป็นการกระทำที่แน่นอน เพราะตอนรันมันถูกข้ามได้จริงเมื่อยังไม่มีสกิล
 * หรือ MP ไม่พอ (กฎในเอกสารภาษา §3: "ข้ามคำสั่งนั้น ไม่เสียเทิร์น")
 * ดังนั้น `cast(...)` แล้วตามด้วย `attack(...)` คือท่าสำรองที่ถูกต้อง ห้ามฟ้อง
 */
function certainActionOf(s: Stmt, units: ReadonlySet<string>): ActionRef | null {
  if (s.kind === 'expr') {
    const c = actionCallOf(s.value);
    if (!c) return null;
    if (c.func === 'defend' || c.func === 'wait') return c;
    if (c.func === 'attack' && s.value.kind === 'call' && s.value.args.length === 1
      && isSurelyUnit(s.value.args[0], units)) return c;
    return null;
  }
  // if ที่มี else และทั้งสองทางสั่งการกระทำแน่ → ผ่าน if นี้ไปแล้วยังไงก็สั่งไปแล้ว
  if (s.kind === 'if' && s.orelse.length > 0) {
    const yes = certainActionIn(s.body, units);
    return yes && certainActionIn(s.orelse, units) ? yes : null;
  }
  // for: ลิสต์อาจว่าง จึงพิสูจน์ไม่ได้ว่าวนอย่างน้อยหนึ่งรอบ
  return null;
}

function certainActionIn(stmts: Stmt[], units: ReadonlySet<string>): ActionRef | null {
  for (const s of stmts) {
    const c = certainActionOf(s, units);
    if (c) return c;
  }
  return null;
}

/** การกระทำตัวแรกที่โผล่ที่ไหนก็ได้ในบล็อกนี้ — ใช้ชี้บรรทัดที่กำลังจะหายเงียบ ๆ */
function firstActionIn(stmts: Stmt[]): ActionRef | null {
  for (const s of stmts) {
    if (s.kind === 'expr') {
      const c = actionCallOf(s.value);
      if (c) return c;
    } else if (s.kind === 'if') {
      const c = firstActionIn(s.body) ?? firstActionIn(s.orelse);
      if (c) return c;
    } else if (s.kind === 'for') {
      const c = firstActionIn(s.body);
      if (c) return c;
    }
  }
  return null;
}

/** ชนิดของ argument และผลลัพธ์ของฟังก์ชันแต่ละตัว */
const SIGNATURES: Record<string, { args: VType[]; ret: VType }> = {
  weakest: { args: ['list'], ret: 'unit' },
  strongest: { args: ['list'], ret: 'unit' },
  deadliest: { args: ['list'], ret: 'unit' },
  fastest: { args: ['list'], ret: 'unit' },
  random_of: { args: ['list'], ret: 'unit' },
  count: { args: ['list'], ret: 'num' },
  len: { args: ['list'], ret: 'num' },
  has_buff: { args: ['str'], ret: 'bool' },
  has_debuff: { args: ['str'], ret: 'bool' },
  can_cast: { args: ['str'], ret: 'bool' },
  attack: { args: ['unit'], ret: 'action' },
  cast: { args: ['str', 'unknown'], ret: 'action' },
  defend: { args: [], ret: 'action' },
  wait: { args: [], ret: 'action' },
};

/** ฟีเจอร์ที่ต้องปลดล็อกก่อนใช้ฟังก์ชันนั้น (ที่เหลือใช้ได้ตั้งแต่ชั้น 0) */
const FUNC_FEATURE: Record<string, Feature> = { len: 'arith' };

/**
 * ฝั่งของตัวละครที่พิสูจน์ได้จากโค้ด — 'unknown' = สรุปไม่ได้ ปล่อยผ่าน
 * มีไว้เพื่อจับ `attack(me)` และ `cast("firebolt", me)` ซึ่งเอนจินเคยเปลี่ยนเป้าให้เงียบ ๆ
 */
type Side = 'enemy' | 'ally' | 'unknown';

const TH_SIDE: Record<'enemy' | 'ally', string> = {
  enemy: 'ศัตรู',
  ally: 'ฝ่ายเดียวกับคุณ',
};

class Validator {
  readonly errors: LangError[] = [];
  /** ตัวแปรที่ผู้เล่นสร้าง → ชนิดที่อนุมานได้ ('unknown' = สรุปไม่ได้ ปล่อยผ่าน) */
  private readonly locals = new Map<string, VType>();
  /** ตัวแปรที่ผู้เล่นสร้าง → ฝั่งที่อนุมานได้ (คู่กับ locals) */
  private readonly localSides = new Map<string, Side>();
  /** ฟีเจอร์ที่ล็อกและรายงานไปแล้ว — กันข้อความซ้ำ (ดู needFeature) */
  private readonly lockedReported = new Set<Feature>();

  constructor(private readonly opts: ValidateOptions) {}

  private add(name: LangError['name'], messageTh: string, line: number, col: number): void {
    this.errors.push(langError(name, messageTh, line, col));
  }

  /**
   * บันทึกชนิดของตัวแปร — ถ้าถูกกำหนดใหม่เป็นคนละชนิด (เช่นคนละสาขาของ if)
   * ให้ถอยเป็น 'unknown' แทนที่จะเดาผิดแล้วฟ้อง error ที่ไม่จริง
   */
  private declare(nameId: string, t: VType, side: Side = 'unknown'): void {
    const prev = this.locals.get(nameId);
    this.locals.set(nameId, prev === undefined || prev === t ? t : 'unknown');
    const prevSide = this.localSides.get(nameId);
    this.localSides.set(nameId, prevSide === undefined || prevSide === side ? side : 'unknown');
  }

  /**
   * ฝั่งของนิพจน์ — อ่านอย่างเดียว ไม่ฟ้อง error (expr() เป็นคนฟ้อง)
   * สรุปเฉพาะกรณีที่พิสูจน์ได้จริง ที่เหลือคืน 'unknown' เพื่อไม่บล็อกโปรแกรมที่ใช้ได้
   */
  private sideOf(e: Expr): Side {
    if (e.kind === 'name') {
      if (e.id === 'me' || e.id === 'allies') return 'ally';
      if (e.id === 'enemies') return 'enemy';
      return this.localSides.get(e.id) ?? 'unknown';
    }
    if (e.kind === 'call' && UNIT_PICKERS.includes(e.func) && e.args.length === 1) {
      return this.sideOf(e.args[0]);
    }
    return 'unknown';
  }

  /**
   * ประโยคที่อธิบายว่า "ค่าที่ผู้เล่นใส่มา" คือใคร — ยกโค้ดที่เขาเขียนเองมาพูดถึงตรง ๆ
   * เพื่อให้เขาเห็นความเชื่อมโยงระหว่างข้อความกับบรรทัดที่เพิ่งพิมพ์
   */
  private static describe(e: Expr, side: 'enemy' | 'ally'): string {
    if (e.kind === 'name' && e.id === 'me') return 'me คือตัวคุณเอง';
    if (e.kind === 'name') {
      const known = e.id === 'allies' || e.id === 'enemies';
      return known ? `${e.id} คือ${TH_SIDE[side]}` : `ตัวแปร '${e.id}' ถือ${TH_SIDE[side]}อยู่`;
    }
    if (e.kind === 'call' && UNIT_PICKERS.includes(e.func) && e.args[0]?.kind === 'name') {
      const list = (e.args[0] as Extract<Expr, { kind: 'name' }>).id;
      return `${e.func}(${list}) เลือกตัวมาจาก ${list} ซึ่งเป็น${TH_SIDE[side]}`;
    }
    return `ค่านี้เป็น${TH_SIDE[side]}`;
  }

  private needFeature(f: Feature, line: number, col: number): boolean {
    if (this.opts.features.has(f)) return true;
    // รายงานฟีเจอร์ที่ล็อกอยู่ "ครั้งเดียวต่อฟีเจอร์" — ก่อนหน้านี้โปรแกรมที่ใช้ if/elif
    // ยิง error ซ้ำถึง 5 ข้อความเดียวกัน ทำให้ผู้เล่นตกใจและ gutter ในเอดิเตอร์รก
    if (this.lockedReported.has(f)) return false;
    this.lockedReported.add(f);
    const floor = FEATURE_UNLOCK[f];
    const label = FEATURE_LABEL_TH[f];
    this.add(
      'LockedFeatureError',
      floor >= 999
        ? `${label} ยังไม่เปิดใช้งานในเฟสนี้`
        : `${label} ยังไม่ปลดล็อก — ต้องผ่านชั้น ${floor} ก่อน`,
      line,
      col,
    );
    return false;
  }

  /** ชื่อตัวแปรที่รู้แล้วว่าถือ "ตัวละคร" อยู่ — ใช้พิสูจน์ว่า attack(t) สั่งแน่ */
  private unitLocals(): ReadonlySet<string> {
    const out = new Set<string>();
    for (const [k, t] of this.locals) if (t === 'unit') out.add(k);
    return out;
  }

  /**
   * ประโยคปิดท้ายของข้อความ "หนึ่งการกระทำต่อเทิร์น"
   * ถ้า if / else ยังล็อกอยู่ ห้ามแนะนำให้ใช้ — จะกลายเป็นทางแก้ที่ทำตามไม่ได้
   * กรณีนั้นใช้ถ้อยคำเดียวกับ LockedFeatureError ("ยังไม่ปลดล็อก — ต้องผ่านชั้น N ก่อน")
   * ซึ่งผู้เล่นรอบ 2T อ่านแล้วเข้าใจว่า "ยังไม่ถึงเวลา" ไม่ใช่ "ทำไม่ได้"
   */
  private keepOneHintTh(): string {
    return this.opts.features.has('if_else')
      ? 'เก็บไว้บรรทัดเดียว หรือใช้ if / else เลือกว่าเทิร์นนี้จะทำอันไหน'
      : 'ตอนนี้เก็บไว้บรรทัดเดียวก่อน (if / else ยังไม่ปลดล็อก — ต้องผ่านชั้น '
        + `${FEATURE_UNLOCK.if_else} ก่อน จึงจะแยกเงื่อนไขได้)`;
  }

  // ------------------------------------------------------------- statements
  /**
   * เดินทีละคำสั่ง พร้อมหา "บรรทัดที่ไม่มีวันทำงาน" ในบล็อกเดียวกัน
   * รายงานไม่เกินหนึ่งครั้งต่อบล็อก — พอให้รู้กฎ โดยไม่ท่วม gutter ของเอดิเตอร์
   *
   * ตรวจ "ตายหรือยัง" ก่อนเดินเข้าไปในคำสั่ง แต่สรุป "สั่งการกระทำแน่หรือยัง" หลังเดิน
   * เพื่อให้ชนิดของตัวแปรที่เพิ่งประกาศถูกนับด้วย (เช่น t = weakest(enemies) แล้ว attack(t))
   */
  block(stmts: Stmt[]): void {
    let acted: ActionRef | null = null;
    let reported = false;
    for (const s of stmts) {
      if (acted && !reported) {
        const dead = firstActionIn([s]);
        if (dead) {
          reported = true;
          this.add(
            'TypeError',
            `turn() สั่งได้แค่ 1 การกระทำต่อเทิร์น — ${dead.func}() บรรทัดนี้จึงไม่มีวันทำงาน`
            + ` เพราะ ${acted.func}() ที่บรรทัด ${acted.line} สั่งไปก่อนแล้ว`
            + ` · ${this.keepOneHintTh()}`,
            dead.line,
            dead.col,
          );
        }
      }
      this.stmt(s);
      if (!acted) acted = certainActionOf(s, this.unitLocals());
    }
  }

  private stmt(s: Stmt): void {
    switch (s.kind) {
      case 'pass':
        return;
      case 'expr':
        this.expr(s.value, true);
        return;
      case 'assign': {
        this.needFeature('variable', s.line, s.col);
        if ((GLOBALS as readonly string[]).includes(s.target)) {
          this.add(
            'SyntaxError',
            `ตั้งชื่อตัวแปรทับตัวแปรของเกมไม่ได้ ('${s.target}') — เปลี่ยนเป็นชื่ออื่น เช่น t`,
            s.line,
            s.col,
          );
        }
        const t = this.expr(s.value, false);
        if (t === 'action') {
          this.add(
            'TypeError',
            'เก็บผลของคำสั่งการกระทำใส่ตัวแปรไม่ได้ — เรียกเป็นคำสั่งเดี่ยว ๆ แทน',
            s.value.line,
            s.value.col,
          );
        }
        this.declare(s.target, t === 'action' ? 'unknown' : t, this.sideOf(s.value));
        return;
      }
      case 'for': {
        this.needFeature('for', s.line, s.col);
        if ((GLOBALS as readonly string[]).includes(s.target)) {
          this.add(
            'SyntaxError',
            `ตั้งชื่อตัวแปรวนซ้ำทับตัวแปรของเกมไม่ได้ ('${s.target}')`,
            s.line,
            s.col,
          );
        }
        const it = this.expr(s.iter, false);
        if (it !== 'list' && it !== 'unknown') {
          this.add(
            'TypeError',
            `for วนได้เฉพาะลิสต์ (enemies / allies) แต่ได้รับ${TH_TYPE[it]}`,
            s.iter.line,
            s.iter.col,
          );
        }
        this.declare(s.target, 'unit', this.sideOf(s.iter));
        this.loopActsEveryRound(s);
        this.block(s.body);
        return;
      }
      case 'if': {
        this.needFeature('if_else', s.line, s.col);
        if (isElifChain(s)) this.needFeature('elif', s.orelse[0].line, s.orelse[0].col);
        this.condition(s.test);
        this.block(s.body);
        this.block(s.orelse);
        return;
      }
    }
  }

  /**
   * `for e in enemies: attack(e)` — ท่าที่มือใหม่ทุกคนเขียน และไม่เคยทำอย่างที่คิด
   *
   * รอบแรกสั่งการกระทำ รอบที่เหลือถูกข้ามทั้งหมด จึง "ตีตัวเดียว" เสมอ — ผู้เล่นรอบ 2T
   * สรุปจากอาการนี้ว่า "for แทบไม่มีประโยชน์" ซึ่งไม่จริง มันมีประโยชน์เมื่อมี if คัดตัวอยู่ข้างใน
   * ฟ้องเฉพาะตอนที่ body สั่งการกระทำ "ทุกรอบแน่นอน" — ถ้ามี if คุมอยู่ถือว่าเขียนถูกแล้ว
   */
  private loopActsEveryRound(s: Extract<Stmt, { kind: 'for' }>): void {
    const act = certainActionIn(s.body, this.unitLocals());
    if (!act) return;
    const pick = act.func === 'attack'
      ? ' · ถ้าจะตีตัวเดียว เลือกเป้าตรง ๆ เช่น attack(weakest(enemies))'
      : '';
    const cond = this.opts.features.has('if_else')
      ? ` · ถ้าจะให้ for มีประโยชน์ ต้องมี if คัดตัวอยู่ข้างใน แล้วสั่ง ${act.func}()`
        + ` เฉพาะตัวที่ผ่านเงื่อนไข เช่น if ${s.target}.hp_pct < 20:`
      : '';
    this.add(
      'TypeError',
      `turn() สั่งได้แค่ 1 การกระทำต่อเทิร์น — ${act.func}() ที่อยู่ใน for จึงทำงานแค่รอบแรก`
      + ` วนกี่ตัวก็สั่งได้ครั้งเดียว${pick}${cond}`,
      act.line,
      act.col,
    );
  }

  private condition(e: Expr): void {
    const t = this.expr(e, false);
    if (t === 'str' || t === 'unit' || t === 'action') {
      this.add(
        'TypeError',
        `เงื่อนไขต้องเป็นการเปรียบเทียบ แต่ได้รับ${TH_TYPE[t]} — เช่น me.hp_pct < 50`,
        e.line,
        e.col,
      );
    }
  }

  // ------------------------------------------------------------ expressions
  private expr(e: Expr, statementLevel: boolean): VType {
    switch (e.kind) {
      case 'num':
        return 'num';
      case 'str':
        this.needFeature('string', e.line, e.col);
        return 'str';
      case 'name': {
        if ((GLOBALS as readonly string[]).includes(e.id)) {
          return e.id === 'me' ? 'unit' : e.id === 'turn_no' ? 'num' : 'list';
        }
        const local = this.locals.get(e.id);
        if (local !== undefined) {
          this.needFeature('variable', e.line, e.col);
          return local;
        }
        const known = [...GLOBALS, ...this.locals.keys(), ...ALL_FUNC_NAMES];
        const guess = closestName(e.id, known);
        this.add(
          'NameError',
          guess
            ? `ไม่รู้จัก '${e.id}' — คุณหมายถึง '${guess}' หรือเปล่า?`
            : `ไม่รู้จัก '${e.id}' — ใช้ได้เฉพาะ me, enemies, allies, turn_no และตัวแปรที่สร้างไว้ก่อนหน้า`,
          e.line,
          e.col,
        );
        return 'unknown';
      }
      case 'attr': {
        const objT = this.expr(e.obj, false);
        const isMe = e.obj.kind === 'name' && e.obj.id === 'me';
        if (objT === 'list') {
          this.add(
            'TypeError',
            `ลิสต์ไม่มีคุณสมบัติ .${e.attr} — เลือกตัวก่อน เช่น weakest(enemies).${e.attr}`,
            e.line,
            e.col,
          );
          return 'unknown';
        }
        if (objT === 'num' || objT === 'str' || objT === 'bool' || objT === 'action') {
          this.add('TypeError', `${TH_TYPE[objT]}ไม่มีคุณสมบัติ .${e.attr}`, e.line, e.col);
          return 'unknown';
        }
        // ตัวแปรของผู้เล่นอาจถือ me เอาไว้ (t = me) จึงตรวจแบบผ่อนปรนด้วยรายการรวม
        const viaLocal = e.obj.kind === 'name' && this.locals.has(e.obj.id);
        const strict = isMe || (objT === 'unit' && !viaLocal);
        const allowed: readonly string[] = isMe ? ME_ATTRS : UNIT_ATTRS;
        if (!strict) {
          const union = [...new Set<string>([...ME_ATTRS, ...UNIT_ATTRS])];
          if (!union.includes(e.attr)) {
            const guess = closestName(e.attr, union);
            this.add(
              'NameError',
              guess
                ? `ไม่รู้จักคุณสมบัติ '.${e.attr}' — คุณหมายถึง '.${guess}' หรือเปล่า?`
                : `ไม่รู้จักคุณสมบัติ '.${e.attr}' — ตัวละครมีได้แค่ ${UNIT_ATTRS.join(', ')}`,
              e.line,
              e.col,
            );
          }
          return 'num';
        }
        if (!allowed.includes(e.attr)) {
          const guess = closestName(e.attr, allowed);
          const extra = isMe ? '' : ' (คุณสมบัติเต็มชุดมีเฉพาะ me เท่านั้น)';
          this.add(
            'NameError',
            guess
              ? `ไม่รู้จักคุณสมบัติ '.${e.attr}' — คุณหมายถึง '.${guess}' หรือเปล่า?${extra}`
              : `ไม่รู้จักคุณสมบัติ '.${e.attr}' — ใช้ได้แค่ ${allowed.join(', ')}${extra}`,
            e.line,
            e.col,
          );
        }
        return 'num';
      }
      case 'call':
        return this.call(e, statementLevel);
      case 'compare': {
        this.needFeature('if_else', e.line, e.col);
        const lt = this.expr(e.left, false);
        const rt = this.expr(e.right, false);
        const eq = e.op === '==' || e.op === '!=';
        const okStr = eq && lt === 'str' && rt === 'str';
        for (const [t, side] of [[lt, e.left], [rt, e.right]] as const) {
          if (t === 'unit' || t === 'list' || t === 'action') {
            this.add(
              'TypeError',
              `เปรียบเทียบ${TH_TYPE[t]}โดยตรงไม่ได้ — เทียบคุณสมบัติแทน เช่น .hp_pct`,
              side.line,
              side.col,
            );
          } else if (t === 'str' && !okStr) {
            this.add(
              'TypeError',
              eq
                ? 'เปรียบเทียบข้อความกับตัวเลขไม่ได้'
                : `ใช้ ${e.op} กับข้อความไม่ได้ — ใช้ == หรือ != เท่านั้น`,
              side.line,
              side.col,
            );
          }
        }
        return 'bool';
      }
      case 'boolop': {
        this.needFeature('boolop', e.line, e.col);
        for (const v of e.values) this.truthy(v);
        return 'bool';
      }
      case 'unary': {
        if (e.op === 'not') {
          this.needFeature('boolop', e.line, e.col);
          this.truthy(e.operand);
          return 'bool';
        }
        this.needFeature('arith', e.line, e.col);
        const t = this.expr(e.operand, false);
        if (t !== 'num' && t !== 'unknown' && t !== 'bool') {
          this.add('TypeError', `ใส่เครื่องหมายลบหน้า${TH_TYPE[t]}ไม่ได้`, e.line, e.col);
        }
        return 'num';
      }
      case 'binop': {
        this.needFeature('arith', e.line, e.col);
        for (const side of [e.left, e.right]) {
          const t = this.expr(side, false);
          if (t !== 'num' && t !== 'unknown' && t !== 'bool') {
            this.add(
              'TypeError',
              `ใช้ ${e.op} กับ${TH_TYPE[t]}ไม่ได้ — คำนวณได้เฉพาะตัวเลข`,
              side.line,
              side.col,
            );
          }
        }
        return 'num';
      }
    }
  }

  private truthy(e: Expr): void {
    const t = this.expr(e, false);
    if (t === 'str' || t === 'unit' || t === 'action') {
      this.add(
        'TypeError',
        `ใช้${TH_TYPE[t]}เป็นเงื่อนไขไม่ได้ — เขียนเป็นการเปรียบเทียบ เช่น me.hp_pct < 50`,
        e.line,
        e.col,
      );
    }
  }

  /** ฟังก์ชันที่ผู้เล่นคนนี้เรียกได้ "ตอนนี้" — ตัวที่ยังล็อกอยู่ไม่นับ */
  private usableFuncNames(): string[] {
    return ALL_FUNC_NAMES.filter((n) => {
      const gate = FUNC_FEATURE[n];
      return !gate || this.opts.features.has(gate);
    });
  }

  /**
   * รายการฟังก์ชันที่ใช้ได้ จัดกลุ่มไว้ในข้อความเดียว
   *
   * นี่คือการแก้ที่รอบ 2T ชี้ว่าคุ้มที่สุด: ข้อความเดิมบอกให้ "ดูหน้าช่วยเหลือ" ซึ่งไม่มีอยู่จริง
   * ผู้เล่นจึงต้องยัดชื่อที่เดา 35 ชื่อลงโปรแกรมเดียวเพื่อค้นว่ามีฟังก์ชันอะไรบ้าง
   * ขณะที่ NameError ของ "ตัวแปร" ลิสต์ตัวเลือกให้อยู่แล้ว และผู้เล่นคนเดียวกันบอกว่า
   * เขารู้จัก allies กับ turn_no ครั้งแรกจากข้อความนั้น — ทำแบบเดียวกันกับฟังก์ชัน
   *
   * ตัวที่ยังล็อกอยู่ถูกตัดออก (เช่น len() ก่อนปลด arith) เพราะแนะนำของที่ใช้ไม่ได้
   * คือกับดักเดียวกับที่ผู้เล่นรอบ 2T เจอตอน `flee()` ถูกแนะนำเป็น `len()` ที่ยังล็อกอยู่
   */
  private funcListTh(): string {
    const usable = new Set(this.usableFuncNames());
    return FUNC_GROUPS
      .map((g) => ({ labelTh: g.labelTh, names: g.names.filter((n) => usable.has(n)) }))
      .filter((g) => g.names.length > 0)
      .map((g) => `${g.labelTh} ${g.names.join(', ')}`)
      .join(' · ');
  }

  /**
   * ชื่อที่พิมพ์ไปเป็น "ชื่อสกิล" ไม่ใช่ชื่อฟังก์ชันหรือเปล่า — `heal()` `taunt()` `execute()`
   * เป็นสิ่งที่ผู้เล่นเดาบ่อยที่สุด และคำตอบที่ถูกคือ cast() ไม่ใช่ชื่อที่สะกดใกล้กัน
   *
   * แนะนำก็ต่อเมื่อบรรทัดที่ยื่นให้ "ใช้ได้จริงกับผู้เล่นคนนี้": ต้องมีสกิลนั้นในมือ
   * และต้องปลดล็อกข้อความในเครื่องหมายคำพูดแล้ว ไม่งั้นจะกลายเป็นทางแก้ที่ทำตามแล้วผิดซ้ำ
   */
  private skillHintTh(name: string): string | undefined {
    if (!this.opts.features.has('string')) return undefined;
    const info = resolveSkillName(name);
    if (!info || !this.opts.availableSkills.includes(info.id)) return undefined;
    const ally = info.kind === 'heal' || info.kind === 'shield' || info.kind === 'taunt';
    const target = ally ? 'me' : (info.aoe ? 'enemies' : 'weakest(enemies)');
    return `'${name}' เป็นชื่อสกิล ร่ายด้วย cast("${name}", ${target}) ไม่ใช่เรียกเป็นฟังก์ชัน`;
  }

  private call(e: Extract<Expr, { kind: 'call' }>, statementLevel: boolean): VType {
    const sig = SIGNATURES[e.func];
    if (!sig) {
      const skill = this.skillHintTh(e.func);
      const guess = skill ? undefined : closestName(e.func, this.usableFuncNames());
      const hint = skill ?? (guess ? `คุณหมายถึง '${guess}()' หรือเปล่า?` : undefined);
      this.add(
        'NameError',
        `ไม่รู้จักฟังก์ชัน '${e.func}()' — ${hint ? `${hint} · ` : ''}`
        + `ใช้ได้: ${this.funcListTh()}`,
        e.line,
        e.col,
      );
      for (const a of e.args) this.expr(a, false);
      return 'unknown';
    }
    const gate = FUNC_FEATURE[e.func];
    if (gate) this.needFeature(gate, e.line, e.col);
    const isAction = ACTION_NAMES.includes(e.func);
    if (isAction && !statementLevel) {
      this.add(
        'TypeError',
        `${e.func}() เป็นคำสั่งการกระทำ ใช้เป็นค่าในนิพจน์ไม่ได้ — เขียนเป็นบรรทัดของตัวเอง`,
        e.line,
        e.col,
      );
    }
    if (e.args.length !== sig.args.length) {
      this.add(
        'TypeError',
        `${e.func}() ต้องการ ${sig.args.length} argument แต่ได้รับ ${e.args.length}`,
        e.line,
        e.col,
      );
      for (const a of e.args) this.expr(a, false);
      return sig.ret;
    }

    if (e.func === 'cast') return this.castCall(e);

    e.args.forEach((a, idx) => {
      const want = sig.args[idx];
      const got = this.expr(a, false);
      if (want === 'unknown' || got === 'unknown') return;
      if (want === got) {
        // ชนิดถูกแล้ว เหลือเรื่อง "ฝั่ง" — attack() เล็งพวกเดียวกันไม่ได้
        // เดิมผ่าน validate แล้วเอนจินเปลี่ยนเป้าไปหาศัตรูให้เงียบ ๆ ผู้เล่นจึงเชื่อว่าเขียนถูก
        if (e.func === 'attack' && got === 'unit' && this.sideOf(a) === 'ally') {
          this.add(
            'TypeError',
            `attack() ต้องเล็งศัตรู แต่ ${Validator.describe(a, 'ally')}`
            + ' — ใช้ attack(weakest(enemies)) หรือ attack(deadliest(enemies))',
            a.line,
            a.col,
          );
        }
        return;
      }
      if (want === 'num' && got === 'bool') return;
      this.add(
        'TypeError',
        `${e.func}() ต้องการ${TH_TYPE[want]} แต่ได้รับ${TH_TYPE[got]}`,
        a.line,
        a.col,
      );
    });

    if ((e.func === 'has_buff' || e.func === 'has_debuff' || e.func === 'can_cast')
      && e.args[0]?.kind !== 'str') {
      const example = e.func === 'can_cast' ? 'firebolt'
        : e.func === 'has_debuff' ? DEBUFF_NAMES[0] : BUFF_NAMES[0];
      this.add(
        'TypeError',
        `${e.func}() ต้องใส่ชื่อเป็นข้อความคงที่ เช่น ${e.func}("${example}")`,
        e.args[0]?.line ?? e.line,
        e.args[0]?.col ?? e.col,
      );
    }
    if ((e.func === 'has_buff' || e.func === 'has_debuff') && e.args[0]?.kind === 'str') {
      // `has_buff("bananas")` เคยผ่านแล้วเป็นเท็จตลอดกาล — เงื่อนไขที่ไม่มีวันเป็นจริง
      // คือความผิดพลาดแบบเงียบ ไม่ใช่สิ่งที่ใครตั้งใจเขียน จึงฟ้องแบบเดียวกับชื่อสกิลที่ไม่มีจริง
      const nameNode = e.args[0];
      const vocab: readonly string[] = e.func === 'has_debuff' ? DEBUFF_NAMES : BUFF_NAMES;
      if (!vocab.includes(nameNode.value)) {
        const guess = closestName(nameNode.value, vocab);
        // เขียนชื่อถูกแต่ผิดฟังก์ชัน (has_debuff("shield")) — บอกตรง ๆ ว่าต้องย้ายไปอีกตัว
        const other = e.func === 'has_debuff' ? 'has_buff' : 'has_debuff';
        const wrongFunc = !vocab.includes(nameNode.value)
          && (STATUS_NAMES as readonly string[]).includes(nameNode.value);
        this.add(
          'ValueError',
          wrongFunc
            ? `'${nameNode.value}' ไม่ใช่${e.func === 'has_debuff' ? 'สถานะร้ายที่ศัตรูใส่ให้' : 'บัฟของเรา'}`
              + ` — ใช้ ${other}("${nameNode.value}") แทน · ${e.func}() มีแค่ ${vocab.join(', ')}`
            : `ไม่มีสถานะชื่อ '${nameNode.value}' ในเกม — ${guess ? `คุณหมายถึง '${guess}' หรือเปล่า? ` : ''}`
              + `${e.func}() ตอนนี้มีแค่ ${vocab.join(', ')}`,
          nameNode.line,
          nameNode.col,
        );
      }
    }
    if (e.func === 'can_cast' && e.args[0]?.kind === 'str') {
      const nameNode = e.args[0];
      if (!resolveSkillName(nameNode.value)) {
        const guess = closestName(nameNode.value, KNOWN_SKILL_NAMES);
        this.add(
          'ValueError',
          guess
            ? `ไม่มีสกิลชื่อ '${nameNode.value}' — คุณหมายถึง '${guess}' หรือเปล่า?`
            : `ไม่มีสกิลชื่อ '${nameNode.value}' ในเกม`,
          nameNode.line,
          nameNode.col,
        );
      }
    }
    return sig.ret;
  }

  private castCall(e: Extract<Expr, { kind: 'call' }>): VType {
    const nameNode = e.args[0];
    const targetNode = e.args[1];
    const targetT = this.expr(targetNode, false);

    if (nameNode.kind !== 'str') {
      this.expr(nameNode, false);
      this.add(
        'TypeError',
        'cast() ต้องใส่ชื่อสกิลเป็นข้อความคงที่ เช่น cast("firebolt", weakest(enemies))',
        nameNode.line,
        nameNode.col,
      );
      return 'action';
    }
    this.needFeature('string', nameNode.line, nameNode.col);

    const info = resolveSkillName(nameNode.value);
    if (!info) {
      const guess = closestName(nameNode.value, KNOWN_SKILL_NAMES);
      this.add(
        'ValueError',
        guess
          ? `ไม่มีสกิลชื่อ '${nameNode.value}' — คุณหมายถึง '${guess}' หรือเปล่า?`
          : `ไม่มีสกิลชื่อ '${nameNode.value}' ในเกม — ตรวจตัวสะกดอีกครั้ง`,
        nameNode.line,
        nameNode.col,
      );
      return 'action';
    }
    if (!this.opts.availableSkills.includes(info.id)) {
      const owned = this.opts.availableSkills.map(preferredSkillName);
      const guess = closestName(nameNode.value, owned);
      this.add(
        'ValueError',
        guess
          ? `ยังใช้สกิล '${nameNode.value}' ไม่ได้ — คุณหมายถึง '${guess}' หรือเปล่า?`
          : unownedSkillMessage(nameNode.value, info, owned),
        nameNode.line,
        nameNode.col,
      );
      return 'action';
    }
    if (targetT === 'list' && !info.aoe) {
      this.add(
        'TypeError',
        `'${nameNode.value}' ไม่ใช่สกิลวงกว้าง — ต้องเล็งทีละตัว เช่น cast("${nameNode.value}", weakest(enemies))`,
        targetNode.line,
        targetNode.col,
      );
    } else if (targetT !== 'list' && targetT !== 'unit' && targetT !== 'unknown') {
      this.add(
        'TypeError',
        `cast() ต้องการตัวละครหรือลิสต์เป็นเป้าหมาย แต่ได้รับ${TH_TYPE[targetT]}`,
        targetNode.line,
        targetNode.col,
      );
    } else {
      this.castTargetSide(nameNode.value, info.kind, targetNode);
    }
    return 'action';
  }

  /**
   * สกิลทำร้ายต้องเล็งศัตรู สกิลฟื้นฟู/เกราะต้องเล็งฝ่ายเดียวกัน
   *
   * เดิมเขียนผิดฝั่งแล้วผ่าน validate จากนั้นเอนจินเปลี่ยนเป้าให้เงียบ ๆ ตอนรบ
   * ผู้เล่นรอบ 2T ทดสอบ `cast("firebolt", me)` แล้วเห็นลูกไฟไปโดนก็อบลิน จึงสรุปว่า
   * "เป้าหมายที่เขียนไม่สำคัญ" ทั้งที่การเลือกเป้าคือเรื่องเดียวที่เกมนี้สอน
   *
   * `taunt` ไม่ตรวจ เพราะมันเป็นออร่ารอบตัวเอง เป้าที่ใส่มาไม่มีผลอยู่แล้วทั้งสองฝั่ง
   */
  private castTargetSide(name: string, kind: SkillInfo['kind'], targetNode: Expr): void {
    const side = this.sideOf(targetNode);
    if (side === 'unknown') return;
    if ((kind === 'physical' || kind === 'magic') && side === 'ally') {
      this.add(
        'TypeError',
        `'${name}' เป็นสกิลทำร้าย ต้องเล็งศัตรู แต่ ${Validator.describe(targetNode, 'ally')}`
        + ` — ใช้ cast("${name}", weakest(enemies))`,
        targetNode.line,
        targetNode.col,
      );
    } else if ((kind === 'heal' || kind === 'shield') && side === 'enemy') {
      this.add(
        'TypeError',
        `'${name}' เป็นสกิลช่วยเหลือ ต้องเล็งฝ่ายเดียวกับคุณ แต่ ${Validator.describe(targetNode, 'enemy')}`
        + ` — ใช้ cast("${name}", me) หรือ cast("${name}", weakest(allies))`,
        targetNode.line,
        targetNode.col,
      );
    }
  }
}

export function validate(program: Program, opts: ValidateOptions): ValidateResult {
  const v = new Validator(opts);
  v.block(program.turn);
  const errors = [...v.errors];
  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return { errors };
}
