/**
 * แปลงกฎแบบเดิม (Gambit) → โปรแกรม BloxCode
 * ใช้ตอน migrate ผู้เล่นจาก MVP มาเฟส 2B-1 (ดู docs/api-spec.md "Migration")
 *
 * ผลลัพธ์การันตีว่า parse ผ่านเสมอ เพราะเราพิมพ์เป็นข้อความแล้ว parse กลับ
 * (ถ้าพังจะพังตอนเทส ไม่ใช่ตอนผู้เล่นเปิดหน้าเว็บ)
 */
import type { Expr, Program, Stmt } from './spec';
import type { Rule, TargetSelector } from '../types';
import { parse } from './parser';
import { toPython } from './printer';
import { preferredSkillName, resolveSkillName } from './skills';

export interface FromRulesOptions {
  /**
   * true  = ใช้ elif (อ่านง่าย แต่ต้องผ่านชั้น 4)
   * false = ใช้ else: + if ซ้อน (ต้องผ่านแค่ชั้น 1)
   */
  useElif?: boolean;
}

const P = { line: 1, col: 1 };

const num = (value: number): Expr => ({ kind: 'num', value, ...P });
const str = (value: string): Expr => ({ kind: 'str', value, ...P });
const name = (id: string): Expr => ({ kind: 'name', id, ...P });
const attr = (obj: Expr, a: string): Expr => ({ kind: 'attr', obj, attr: a, ...P });
const call = (func: string, ...args: Expr[]): Expr => ({ kind: 'call', func, args, ...P });
const cmp = (op: '<' | '>' | '>=' , left: Expr, right: Expr): Expr =>
  ({ kind: 'compare', op, left, right, ...P });

function targetExpr(sel: TargetSelector): Expr {
  switch (sel) {
    case 'lowest_hp_enemy': return call('weakest', name('enemies'));
    case 'highest_hp_enemy': return call('strongest', name('enemies'));
    case 'highest_atk_enemy': return call('deadliest', name('enemies'));
    case 'random_enemy': return call('random_of', name('enemies'));
    case 'self': return name('me');
    case 'lowest_hp_ally': return call('weakest', name('allies'));
    default: return call('weakest', name('enemies'));
  }
}

function conditionExpr(c: Rule['condition']): Expr | null {
  const v = num(c.value ?? 0);
  switch (c.type) {
    case 'always': return null;
    case 'self_hp_below': return cmp('<', attr(name('me'), 'hp_pct'), v);
    case 'self_mp_above': return cmp('>', attr(name('me'), 'mp_pct'), v);
    case 'ally_hp_below': return cmp('<', attr(call('weakest', name('allies')), 'hp_pct'), v);
    case 'enemy_count_gte': return cmp('>=', call('count', name('enemies')), v);
    case 'enemy_hp_below': return cmp('<', attr(call('weakest', name('enemies')), 'hp_pct'), v);
    case 'turn_gte': return cmp('>=', name('turn_no'), v);
    default: return null;
  }
}

function actionStmt(a: Rule['action']): Stmt | null {
  if (a.type === 'defend') {
    return { kind: 'expr', value: call('defend'), ...P };
  }
  if (a.type === 'attack') {
    return { kind: 'expr', value: call('attack', targetExpr(a.target)), ...P };
  }
  if (!a.skillId) return null; // กฎเก่าที่ไม่ระบุสกิล (เช่น monsterDefault) แปลงตรง ๆ ไม่ได้
  const info = resolveSkillName(a.skillId);
  if (!info) return null;
  let target = a.target;
  if (info.kind === 'heal' || info.kind === 'shield') {
    if (target !== 'self' && target !== 'lowest_hp_ally') target = 'lowest_hp_ally';
  } else if (info.kind === 'taunt') {
    target = 'self';
  }
  const tgt = info.aoe && info.kind !== 'taunt' && info.kind !== 'shield' && info.kind !== 'heal'
    ? name('enemies')
    : targetExpr(target);
  return {
    kind: 'expr',
    value: call('cast', str(preferredSkillName(info.id)), tgt),
    ...P,
  };
}

/**
 * แปลง Rule[] เป็น Program ที่ parse + validate ผ่าน
 * ลำดับกฎเดิม = ลำดับ if / elif / else ในโปรแกรมใหม่
 */
export function fromRules(rules: Rule[], opts: FromRulesOptions = {}): Program {
  const useElif = opts.useElif !== false;
  const branches: { test: Expr | null; stmt: Stmt }[] = [];
  for (const r of rules) {
    const stmt = actionStmt(r.action);
    if (!stmt) continue;
    const test = conditionExpr(r.condition);
    branches.push({ test, stmt });
    if (test === null) break; // กฎหลัง 'always' ไม่มีทางทำงาน
  }

  const fallback: Stmt = {
    kind: 'expr',
    value: call('attack', call('weakest', name('enemies'))),
    ...P,
  };
  if (branches.length === 0) return reparse({ turn: [fallback] });

  const build = (idx: number, col: number): Stmt[] => {
    const b = branches[idx];
    const isLast = idx === branches.length - 1;
    if (b.test === null) return [b.stmt];
    const orelse = isLast
      ? [fallback]
      : build(idx + 1, useElif ? col : col + 4);
    return [{ kind: 'if', test: b.test, body: [b.stmt], orelse, line: 1, col }];
  };

  return reparse({ turn: build(0, 5) });
}

/** พิมพ์แล้ว parse กลับ เพื่อให้ line/col ตรงกับข้อความจริงที่ผู้เล่นจะเห็น */
function reparse(p: Program): Program {
  const source = toPython(p);
  const res = parse(source);
  if (!res.program) {
    throw new Error(`fromRules produced unparsable source: ${res.errors[0]?.messageTh}\n${source}`);
  }
  return res.program;
}
