/**
 * Evaluator — รันโปรแกรมของผู้เล่น 1 เทิร์น
 *
 * กติกาการทำงาน (ต้องตรงกับ CPython + shim ทุกข้อ ดู docs/bloxcode-language.md §3):
 *   1. โปรแกรมวิ่งจนจบเสมอ — "การกระทำแรกชนะ" คำสั่งการกระทำถัดไปถูกมองข้าม
 *      (แต่ argument ยังถูกประเมิน เพราะ Python ประเมิน argument ก่อนเรียกฟังก์ชัน
 *       → ลำดับการดึงเลขสุ่มจึงตรงกันทั้งสองฝั่ง)
 *   2. cast สกิลที่ไม่มี / MP ไม่พอ / ไม่ใช่ AoE แต่เล็งลิสต์ → ข้ามคำสั่งนั้น ไม่เสียเทิร์น + เตือน
 *   3. จบโปรแกรมโดยไม่มีการกระทำ → FALLBACK_ACTION (attack(weakest(enemies))) usedFallback: true
 *   4. ใช้โหนดเกิน NODE_BUDGET_PER_TURN → ตัดจบทันทีแล้วใช้ fallback
 *   5. เกิดข้อผิดพลาดตอนรัน (หารศูนย์ / ตัวแปรยังไม่มีค่า) → หยุดโปรแกรม
 *      ถ้ามีการกระทำไปแล้วให้ใช้อันนั้น ไม่งั้นใช้ fallback  (เหมือน exception ใน Python)
 */
import { NODE_BUDGET_PER_TURN } from './spec';
import type { Expr, Program, Stmt, TurnDecision } from './spec';
import type { Rng } from '../rng';
import { resolveSkillName, type SkillInfo } from './skills';

/** หน่วยรบที่โปรแกรมมองเห็น (battle.ts สร้างจาก Fighter) */
export interface RuntimeUnit {
  id: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  atk: number;
  matk: number;
  /** เข้าถึงในโค้ดผ่าน me.defense (ชื่อ `def` เขียนใน Python ไม่ได้ — เป็นคำสงวน) */
  def: number;
  /** เข้าถึงในโค้ดผ่าน me.magic_defense */
  mdef: number;
  speed: number;
}

export interface TurnContext {
  me: RuntimeUnit;
  /** ศัตรูที่ยังไม่ตาย */
  enemies: RuntimeUnit[];
  /** พวกเดียวกันที่ยังไม่ตาย (รวมตัวเอง) */
  allies: RuntimeUnit[];
  turn_no: number;
  rng: Rng;
  /** skill id ที่ตัวนี้ใช้ได้จริง */
  availableSkills: readonly string[];
  buffs?: readonly string[];
  debuffs?: readonly string[];
  /** เผื่อทดสอบ — ปกติใช้ตาราง gamedata */
  lookupSkill?: (name: string) => SkillInfo | undefined;
}

export const SELF_TARGET = '__self__';

type Val = number | string | boolean | RuntimeUnit | RuntimeUnit[];

const isUnit = (v: Val): v is RuntimeUnit =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isList = (v: Val): v is RuntimeUnit[] => Array.isArray(v);

class Abort extends Error {
  constructor(public readonly warning: string, public readonly budget = false) {
    super(warning);
  }
}

interface PendingAction {
  action: TurnDecision['action'];
  skillId?: string;
  targetId?: string;
  line: number;
}

class Interpreter {
  private budget = NODE_BUDGET_PER_TURN;
  private readonly scope = new Map<string, Val>();
  readonly warnings: string[] = [];
  action: PendingAction | null = null;

  constructor(private readonly ctx: TurnContext) {}

  private charge(): void {
    if (--this.budget < 0) {
      throw new Abort('โปรแกรมยาวเกินงบประมวลผลต่อเทิร์น — ใช้การกระทำสำรองแทน', true);
    }
  }

  private warn(msg: string): void {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
  }

  private skill(name: string): SkillInfo | undefined {
    return (this.ctx.lookupSkill ?? resolveSkillName)(name);
  }

  private targetIdOf(u: RuntimeUnit): string {
    return u.id === this.ctx.me.id ? SELF_TARGET : u.id;
  }

  /** ตัวนี้อยู่ฝั่งศัตรูของเราไหม — ดูจากลิสต์จริงที่ battle.ts ส่งมา */
  private isEnemy(u: RuntimeUnit): boolean {
    return this.ctx.enemies.some((x) => x.id === u.id);
  }

  /**
   * เตือนเมื่อเป้าที่ผู้เล่น "สั่ง" กับเป้าที่ "โดนจริง" ไม่ใช่ตัวเดียวกัน
   *
   * battle.ts เปลี่ยนเป้าที่ผิดฝั่งให้เองเสมอ (สกิลทำร้ายที่เล็งพวกเดียวกัน → ไปหาศัตรู
   * ที่เลือดน้อยสุด, สกิลช่วยเหลือที่เล็งศัตรู → กลับมาที่ตัวเอง) ซึ่งเดิมเงียบสนิท
   * ผู้เล่นรอบ 2T เขียน `attack(me)` แล้วเห็นก็อบลินตาย จึงเชื่อว่าตัวเองเข้าใจถูกแล้ว
   *
   * ตอนนี้ validate บล็อกท่านี้ตั้งแต่ตอนบันทึกแล้ว คำเตือนนี้จึงเหลือไว้สำหรับ
   * โปรแกรมที่บันทึกไว้ก่อนหน้า และโปรแกรมที่ validate สรุปฝั่งไม่ได้ (ตัวแปรสลับฝั่ง)
   * — ไม่เปลี่ยนการตัดสินใจ เปลี่ยนแค่ให้บันทึกการรบพูดออกมา
   */
  private warnWrongSide(verb: string, fix: string): void {
    this.warn(`${verb} — ระบบเลือกเป้าให้เองแทน เป้าที่คุณเขียนไม่ได้ถูกใช้ · ${fix}`);
  }

  // ------------------------------------------------------------- statements
  run(stmts: Stmt[]): void {
    for (const s of stmts) this.stmt(s);
  }

  private stmt(s: Stmt): void {
    this.charge();
    switch (s.kind) {
      case 'pass':
        return;
      case 'expr':
        this.eval(s.value);
        return;
      case 'assign':
        this.scope.set(s.target, this.eval(s.value));
        return;
      case 'if': {
        if (truthy(this.eval(s.test))) this.run(s.body);
        else this.run(s.orelse);
        return;
      }
      case 'for': {
        const it = this.eval(s.iter);
        if (!isList(it)) throw new Abort('for วนได้เฉพาะลิสต์ (enemies / allies)');
        for (const item of it) {
          this.charge();
          this.scope.set(s.target, item);
          this.run(s.body);
        }
        return;
      }
    }
  }

  // ------------------------------------------------------------ expressions
  private eval(e: Expr): Val {
    this.charge();
    switch (e.kind) {
      case 'num': return e.value;
      case 'str': return e.value;
      case 'name': {
        switch (e.id) {
          case 'me': return this.ctx.me;
          case 'enemies': return this.ctx.enemies;
          case 'allies': return this.ctx.allies;
          case 'turn_no': return this.ctx.turn_no;
          default: {
            const v = this.scope.get(e.id);
            if (v === undefined) throw new Abort(`ตัวแปร '${e.id}' ยังไม่มีค่าตอนถูกใช้`);
            return v;
          }
        }
      }
      case 'attr': {
        const obj = this.eval(e.obj);
        if (!isUnit(obj)) throw new Abort(`ใช้ .${e.attr} กับค่านี้ไม่ได้`);
        return unitAttr(obj, e.attr);
      }
      case 'compare': {
        const l = this.eval(e.left);
        const r = this.eval(e.right);
        return compare(e.op, l, r);
      }
      case 'boolop': {
        // ลัดวงจรเหมือน Python: and คืนตัวแรกที่เท็จ, or คืนตัวแรกที่จริง
        let last: Val = e.op === 'and';
        for (const v of e.values) {
          last = this.eval(v);
          if (e.op === 'and' && !truthy(last)) return last;
          if (e.op === 'or' && truthy(last)) return last;
        }
        return last;
      }
      case 'unary': {
        const v = this.eval(e.operand);
        if (e.op === 'not') return !truthy(v);
        if (typeof v !== 'number' && typeof v !== 'boolean') {
          throw new Abort('ใส่เครื่องหมายลบหน้าค่านี้ไม่ได้');
        }
        return -Number(v);
      }
      case 'binop': {
        const l = this.eval(e.left);
        const r = this.eval(e.right);
        if (typeof l === 'string' || typeof r === 'string' || isUnit(l) || isUnit(r)
          || isList(l) || isList(r)) {
          throw new Abort(`ใช้ ${e.op} กับค่าที่ไม่ใช่ตัวเลขไม่ได้`);
        }
        const a = Number(l);
        const b = Number(r);
        switch (e.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/':
            if (b === 0) throw new Abort('หารด้วยศูนย์ไม่ได้');
            return a / b;
        }
        return 0;
      }
      case 'call':
        return this.call(e);
    }
  }

  private list(e: Expr, fn: string): RuntimeUnit[] {
    const v = this.eval(e);
    if (!isList(v)) throw new Abort(`${fn}() ต้องรับลิสต์ (enemies หรือ allies)`);
    return v;
  }

  private text(e: Expr, fn: string): string {
    const v = this.eval(e);
    if (typeof v !== 'string') throw new Abort(`${fn}() ต้องรับชื่อเป็นข้อความ`);
    return v;
  }

  private call(e: Extract<Expr, { kind: 'call' }>): Val {
    switch (e.func) {
      case 'weakest': return pickBy(this.list(e.args[0], 'weakest'), (u) => u.hp, 'min', 'weakest');
      case 'strongest': return pickBy(this.list(e.args[0], 'strongest'), (u) => u.hp, 'max', 'strongest');
      case 'deadliest': return pickBy(this.list(e.args[0], 'deadliest'), (u) => u.atk, 'max', 'deadliest');
      case 'fastest': return pickBy(this.list(e.args[0], 'fastest'), (u) => u.speed, 'max', 'fastest');
      case 'random_of': {
        const l = this.list(e.args[0], 'random_of');
        if (l.length === 0) throw new Abort('random_of() ต้องมีสมาชิกอย่างน้อย 1 ตัว');
        return l[Math.floor(this.ctx.rng() * l.length)];
      }
      case 'count':
      case 'len':
        return this.list(e.args[0], e.func).length;
      case 'has_buff': return (this.ctx.buffs ?? []).includes(this.text(e.args[0], 'has_buff'));
      case 'has_debuff': return (this.ctx.debuffs ?? []).includes(this.text(e.args[0], 'has_debuff'));
      case 'can_cast': {
        const info = this.skill(this.text(e.args[0], 'can_cast'));
        if (!info) return false;
        return this.ctx.availableSkills.includes(info.id) && this.ctx.me.mp >= info.mpCost;
      }
      case 'attack': {
        const t = this.eval(e.args[0]);
        if (this.action) return true;
        if (!isUnit(t)) {
          this.warn('attack() ต้องเล็งตัวละครทีละตัว เช่น attack(weakest(enemies)) — ข้ามคำสั่งนี้');
          return true;
        }
        if (!this.isEnemy(t)) {
          this.warnWrongSide(
            'attack() เล็งฝ่ายเดียวกับคุณไม่ได้',
            'เขียน attack(weakest(enemies)) หรือ attack(deadliest(enemies))',
          );
        }
        this.action = { action: 'attack', targetId: this.targetIdOf(t), line: e.line };
        return true;
      }
      case 'cast': {
        const name = this.text(e.args[0], 'cast');
        const target = this.eval(e.args[1]);
        if (this.action) return true;
        return this.doCast(name, target, e.line);
      }
      case 'defend':
      case 'wait': {
        if (this.action) return true;
        this.action = { action: e.func === 'defend' ? 'defend' : 'wait', line: e.line };
        return true;
      }
      default:
        throw new Abort(`ไม่รู้จักฟังก์ชัน '${e.func}()'`);
    }
  }

  private doCast(name: string, target: Val, line: number): Val {
    const info = this.skill(name);
    if (!info || !this.ctx.availableSkills.includes(info.id)) {
      this.warn(`ยังไม่มีบล็อกสกิล '${name}' — ข้ามคำสั่งนี้ (ไม่เสียเทิร์น)`);
      return true;
    }
    if (this.ctx.me.mp < info.mpCost) {
      this.warn(
        `MP ไม่พอสำหรับ '${name}' (ต้องใช้ ${info.mpCost} MP มี ${Math.floor(this.ctx.me.mp)} MP)`
        + ' — ข้ามคำสั่งนี้ (ไม่เสียเทิร์น)',
      );
      return true;
    }
    if (isList(target)) {
      if (!info.aoe) {
        this.warn(`'${name}' ไม่ใช่สกิลวงกว้าง — เล็งลิสต์ไม่ได้ ข้ามคำสั่งนี้ (ไม่เสียเทิร์น)`);
        return true;
      }
      this.action = { action: 'skill', skillId: info.id, line };
      return true;
    }
    if (!isUnit(target)) {
      this.warn(`cast('${name}') ต้องระบุเป้าหมาย — ข้ามคำสั่งนี้ (ไม่เสียเทิร์น)`);
      return true;
    }
    const wantsAlly = info.kind === 'heal' || info.kind === 'shield';
    const hurts = info.kind === 'physical' || info.kind === 'magic';
    if (hurts && !this.isEnemy(target)) {
      this.warnWrongSide(
        `'${name}' เป็นสกิลทำร้าย เล็งฝ่ายเดียวกับคุณไม่ได้`,
        `เขียน cast("${name}", weakest(enemies))`,
      );
    } else if (wantsAlly && this.isEnemy(target)) {
      this.warnWrongSide(
        `'${name}' เป็นสกิลช่วยเหลือ เล็งศัตรูไม่ได้`,
        `เขียน cast("${name}", me) หรือ cast("${name}", weakest(allies))`,
      );
    }
    this.action = { action: 'skill', skillId: info.id, targetId: this.targetIdOf(target), line };
    return true;
  }
}

function unitAttr(u: RuntimeUnit, attr: string): number {
  switch (attr) {
    case 'hp': return u.hp;
    case 'mp': return u.mp;
    case 'hp_pct': return u.maxHp > 0 ? (u.hp / u.maxHp) * 100 : 0;
    case 'mp_pct': return u.maxMp > 0 ? (u.mp / u.maxMp) * 100 : 0;
    case 'level': return u.level;
    case 'atk': return u.atk;
    case 'matk': return u.matk;
    case 'defense': return u.def;
    case 'magic_defense': return u.mdef;
    case 'speed': return u.speed;
    // `def` เป็นคำสงวนของ Python — ต้องไม่รองรับ ไม่งั้นโค้ดที่เกมรับจะรัน CPython ไม่ได้
    default: throw new Abort(`ไม่รู้จักคุณสมบัติ '.${attr}'`);
  }
}

function truthy(v: Val): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (isList(v)) return v.length > 0;
  return true;
}

function compare(op: string, l: Val, r: Val): boolean {
  if (typeof l === 'string' || typeof r === 'string') {
    if (op === '==') return l === r;
    if (op === '!=') return l !== r;
    throw new Abort(`ใช้ ${op} กับข้อความไม่ได้`);
  }
  if (isUnit(l) || isUnit(r) || isList(l) || isList(r)) {
    if (op === '==') return l === r;
    if (op === '!=') return l !== r;
    throw new Abort(`ใช้ ${op} กับค่านี้ไม่ได้`);
  }
  const a = Number(l);
  const b = Number(r);
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '==': return a === b;
    case '!=': return a !== b;
    default: return false;
  }
}

/** ตัวแรกที่ค่าต่ำ/สูงสุด — เสมอกันเอาตัวที่เจอก่อน (ตรงกับ min()/max() ของ Python) */
function pickBy(
  list: RuntimeUnit[],
  key: (u: RuntimeUnit) => number,
  mode: 'min' | 'max',
  fn: string,
): RuntimeUnit {
  if (list.length === 0) throw new Abort(`${fn}() ต้องมีสมาชิกอย่างน้อย 1 ตัว`);
  let best = list[0];
  for (let i = 1; i < list.length; i++) {
    const v = key(list[i]);
    const b = key(best);
    if (mode === 'min' ? v < b : v > b) best = list[i];
  }
  return best;
}

/** การกระทำสำรองเมื่อโปรแกรมไม่ได้สั่งอะไร: attack(weakest(enemies)) */
function fallbackDecision(ctx: TurnContext, warnings: string[]): TurnDecision {
  const alive = ctx.enemies;
  if (alive.length === 0) {
    return { action: 'wait', line: 0, usedFallback: true, ...(warnings.length ? { warnings } : {}) };
  }
  let best = alive[0];
  for (const u of alive) if (u.hp < best.hp) best = u;
  return {
    action: 'attack',
    targetId: best.id === ctx.me.id ? SELF_TARGET : best.id,
    line: 0,
    usedFallback: true,
    ...(warnings.length ? { warnings } : {}),
  };
}

/** รันโปรแกรม 1 เทิร์น — ไม่มีทางโยน exception ออกมา และหยุดเสมอ */
export function runTurn(program: Program, ctx: TurnContext): TurnDecision {
  const interp = new Interpreter(ctx);
  try {
    interp.run(program.turn);
  } catch (e) {
    if (e instanceof Abort) interp.warnings.push(e.warning);
    else throw e;
  }
  const warnings = interp.warnings;
  const a = interp.action;
  if (!a) return fallbackDecision(ctx, warnings);
  return {
    action: a.action,
    ...(a.skillId ? { skillId: a.skillId } : {}),
    ...(a.targetId ? { targetId: a.targetId } : {}),
    line: a.line,
    usedFallback: false,
    ...(warnings.length ? { warnings } : {}),
  };
}
