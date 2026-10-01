/**
 * BloxCode — เทสของโมดูลภาษา (tokenizer / parser / validate / evaluator / printer)
 * ครอบคลุม: ทางสุขทุกไวยากรณ์ · error ทุกคลาสพร้อมข้อความ · round-trip
 *           · การปลดล็อกตามชั้น · งบโหนดต่อเทิร์น · กฎการทำงานทุกข้อในเอกสาร
 *
 * (19 ก.ย. 2026) เทสต์ชุด "การนับ MB" ถูกลบทั้งหมดพร้อมระบบ Memory ตาม §3.1 —
 * ดูเหตุผลที่ท้ายไฟล์ตรงที่เคยเป็น describe('memory (MB) accounting')
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ACTION, FEATURE_UNLOCK, MAX_PROGRAM_LINES, NODE_BUDGET_PER_TURN,
  unlockedFeatures,
} from '../src/lang/spec';
import type { Feature, LangError, Program, Stmt, ValidateOptions } from '../src/lang/spec';
import { tokenize } from '../src/lang/tokenizer';
import { parse } from '../src/lang/parser';
import { toPython } from '../src/lang/printer';
import { validate } from '../src/lang/validate';
import { runTurn, type RuntimeUnit, type TurnContext } from '../src/lang/evaluator';
import { fromRules } from '../src/lang/fromRules';
import { clearMonsterProgramCache, monsterProgramFor } from '../src/lang/monsterAi';
import { resolveSkillName } from '../src/lang/skills';
import { BUFF_NAMES, DEBUFF_NAMES } from '../src/lang/validate';
import { gamedata } from '../src/data';
import { runBattle } from '../src/battle';
import { buildDerivedStats } from '../src/stats';
import { mulberry32 } from '../src/rng';
import type { ClassId, Combatant, Rule } from '../src/types';

// ------------------------------------------------------------------ helpers
const ALL_FEATURES = new Set(Object.keys(FEATURE_UNLOCK) as Feature[]);
const ALL_SKILLS = gamedata.skills.map((s) => s.id);

function opts(over: Partial<ValidateOptions> = {}): ValidateOptions {
  return {
    features: ALL_FEATURES,
    availableSkills: ALL_SKILLS,
    ...over,
  };
}

function ok(src: string): Program {
  const r = parse(src);
  expect(r.errors, `unexpected parse errors in:\n${src}`).toEqual([]);
  expect(r.program).not.toBeNull();
  return r.program!;
}

function firstError(src: string) {
  const r = parse(src);
  expect(r.errors.length, `expected a parse error in:\n${src}`).toBeGreaterThan(0);
  return r.errors[0];
}

function unit(over: Partial<RuntimeUnit> = {}): RuntimeUnit {
  return {
    // mdef เคยหายไปจาก helper นี้ (vitest ไม่ typecheck จึงไม่มีใครเห็น จนกว่าจะมี
    // script `typecheck` เมื่อ 19 ก.ย. 2026) — เป็นบั๊กคลาสเดียวกับที่ differential test
    // เคยเจอใน makeUnit: ค่าที่ขาดกลายเป็น NaN แล้วเงื่อนไขที่อ้างถึงมันเพี้ยนเงียบ ๆ
    id: 'u', hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    level: 5, atk: 20, matk: 15, def: 10, mdef: 8, speed: 20, ...over,
  };
}

function ctx(over: Partial<TurnContext> = {}): TurnContext {
  const me = over.me ?? unit({ id: 'hero' });
  return {
    me,
    enemies: [unit({ id: 'e1', hp: 80 }), unit({ id: 'e2', hp: 30 }), unit({ id: 'e3', hp: 60 })],
    allies: [me],
    turn_no: 1,
    rng: mulberry32(7),
    availableSkills: ALL_SKILLS,
    buffs: [],
    debuffs: [],
    ...over,
  };
}

const run = (src: string, c: Partial<TurnContext> = {}) => runTurn(ok(src), ctx(c));

// ================================================================ tokenizer
describe('tokenizer', () => {
  it('emits INDENT/DEDENT/NEWLINE with 1-based line and col', () => {
    const { tokens } = tokenize('def turn():\n    attack(me)\n');
    const kinds = tokens.map((t) => `${t.type}:${t.value}`);
    // คำสงวนมีชนิดของตัวเอง (KEYWORD) ไม่ใช่ NAME — parser จึงเอาไปใช้เป็นชื่อไม่ได้เลย
    expect(kinds).toEqual([
      'KEYWORD:def', 'NAME:turn', 'OP:(', 'OP:)', 'OP::', 'NEWLINE:\n',
      'INDENT:    ', 'NAME:attack', 'OP:(', 'NAME:me', 'OP:)', 'NEWLINE:\n',
      'DEDENT:', 'EOF:',
    ]);
    const attack = tokens.find((t) => t.value === 'attack')!;
    expect([attack.line, attack.col]).toEqual([2, 5]);
  });

  it('treats a tab as an advance to the next multiple of 4 columns', () => {
    const withTab = tokenize('def turn():\n\tattack(me)\n').tokens.map((t) => t.type);
    const withSpaces = tokenize('def turn():\n    attack(me)\n').tokens.map((t) => t.type);
    expect(withTab).toEqual(withSpaces);
  });

  it('skips comments and blank lines without emitting NEWLINE for them', () => {
    const { tokens, leadingComments } = tokenize('# หัวเรื่อง\n\ndef turn():\n\n    # ตี\n    wait()\n');
    expect(leadingComments).toEqual(['# หัวเรื่อง']);
    expect(tokens.filter((t) => t.type === 'NEWLINE')).toHaveLength(2);
  });

  it('reads strings, numbers and two-character operators', () => {
    const { tokens } = tokenize('def turn():\n    if 3.5 <= me.hp and "a\\nb" != "c":\n        wait()\n');
    expect(tokens.find((t) => t.type === 'NUMBER')!.value).toBe('3.5');
    expect(tokens.filter((t) => t.type === 'STRING').map((t) => t.value)).toEqual(['a\nb', 'c']);
    expect(tokens.some((t) => t.type === 'OP' && t.value === '<=')).toBe(true);
  });

  it('joins lines inside parentheses (implicit continuation)', () => {
    const p = ok('def turn():\n    attack(\n        weakest(enemies)\n    )\n');
    expect(p.turn).toHaveLength(1);
  });
});

// =================================================================== parser
describe('parser — happy paths', () => {
  it('parses the reference program from the docs', () => {
    const p = ok(
      'def turn():\n'
      + '    if me.hp_pct < 30:\n'
      + '        cast("heal", me)\n'
      + '    elif count(enemies) >= 3:\n'
      + '        cast("blizzard", enemies)\n'
      + '    else:\n'
      + '        attack(weakest(enemies))\n',
    );
    expect(p.turn).toHaveLength(1);
    const top = p.turn[0] as Extract<Stmt, { kind: 'if' }>;
    expect(top.kind).toBe('if');
    // elif = If ที่ซ้อนอยู่ใน orelse เหมือน ast ของ CPython
    expect(top.orelse).toHaveLength(1);
    expect(top.orelse[0].kind).toBe('if');
    expect(top.orelse[0].col).toBe(top.col);
    const nested = top.orelse[0] as Extract<Stmt, { kind: 'if' }>;
    expect(nested.orelse.map((s) => s.kind)).toEqual(['expr']);
  });

  it('distinguishes elif from a plain else containing an if (column decides)', () => {
    const elifP = ok('def turn():\n    if turn_no > 1:\n        wait()\n    elif turn_no > 2:\n        defend()\n');
    const elseP = ok('def turn():\n    if turn_no > 1:\n        wait()\n    else:\n        if turn_no > 2:\n            defend()\n');
    const a = elifP.turn[0] as Extract<Stmt, { kind: 'if' }>;
    const b = elseP.turn[0] as Extract<Stmt, { kind: 'if' }>;
    expect(a.orelse[0].col).toBe(a.col);
    expect(b.orelse[0].col).toBe(b.col + 4);
  });

  it('keeps the top-of-file comment as the program header', () => {
    const p = ok('# แผนของฉัน\n# บรรทัดสอง\ndef turn():\n    wait()\n');
    expect(p.header).toBe('# แผนของฉัน\n# บรรทัดสอง');
  });

  it('parses for / assign / pass', () => {
    const p = ok('def turn():\n    t = weakest(enemies)\n    for e in enemies:\n        pass\n    attack(t)\n');
    expect(p.turn.map((s) => s.kind)).toEqual(['assign', 'for', 'expr']);
  });

  it('flattens and/or chains like CPython and respects precedence', () => {
    const p = ok('def turn():\n    if turn_no > 1 and turn_no < 5 and me.hp > 1 or me.mp > 2:\n        wait()\n');
    const test = (p.turn[0] as Extract<Stmt, { kind: 'if' }>).test;
    expect(test.kind).toBe('boolop');
    if (test.kind !== 'boolop') throw new Error('unreachable');
    expect(test.op).toBe('or');
    expect(test.values).toHaveLength(2);
    expect(test.values[0].kind).toBe('boolop');
  });

  it('binds arithmetic tighter than comparison and unary minus tighter than *', () => {
    const p = ok('def turn():\n    if 1 + 2 * 3 < -me.hp:\n        wait()\n');
    const t = (p.turn[0] as Extract<Stmt, { kind: 'if' }>).test;
    expect(t.kind).toBe('compare');
    if (t.kind !== 'compare') throw new Error('unreachable');
    expect(t.left.kind).toBe('binop');
    expect(t.right.kind).toBe('unary');
  });
});

// ================================================================== errors
describe('error classes and their Thai messages', () => {
  it('IndentationError — missing indent after if', () => {
    const e = firstError('def turn():\n    if me.hp > 1:\n    wait()\n');
    expect(e.name).toBe('IndentationError');
    expect(e.messageTh).toContain('ต้องเยื้องเข้าไป 4 ช่องหลัง if');
    expect(e.line).toBe(3);
  });

  it('IndentationError — dedent that matches no level', () => {
    const e = firstError('def turn():\n    if me.hp > 1:\n        wait()\n      defend()\n');
    expect(e.name).toBe('IndentationError');
    expect(e.messageTh).toContain('ไม่ตรงกับระดับใด');
    expect(e.line).toBe(4);
  });

  it('SyntaxError — missing colon, chained comparison, = vs ==, unterminated string', () => {
    expect(firstError('def turn():\n    if me.hp > 1\n        wait()\n').messageTh)
      .toContain('ลืมเครื่องหมาย :');
    expect(firstError('def turn():\n    if 1 < me.hp < 9:\n        wait()\n').messageTh)
      .toContain('การเปรียบเทียบต่อกัน');
    expect(firstError('def turn():\n    if me.hp = 1:\n        wait()\n').messageTh)
      .toContain("ใช้ '==' (สองตัว)");
    const s = firstError('def turn():\n    cast("heal, me)\n');
    expect(s.name).toBe('SyntaxError');
    expect(s.messageTh).toContain('ยังไม่ปิดเครื่องหมายคำพูด');
  });

  it('SyntaxError — Python features outside the subset explain themselves', () => {
    expect(firstError('def turn():\n    while True:\n        wait()\n').messageTh).toContain('while');
    expect(firstError('def turn():\n    return 1\n').messageTh).toContain('return');
    expect(firstError('def turn():\n    x = enemies[0]\n').messageTh).toContain('[ ]');
    expect(firstError('def turn():\n    x = me.hp % 2\n').messageTh).toContain('%');
    expect(firstError('def turn():\n    x = enemies.sort()\n').messageTh).toContain('เมธอด');
  });

  it('SyntaxError — program longer than MAX_PROGRAM_LINES', () => {
    const src = `def turn():\n${'    wait()\n'.repeat(MAX_PROGRAM_LINES + 5)}`;
    const e = firstError(src);
    expect(e.name).toBe('SyntaxError');
    expect(e.messageTh).toContain(String(MAX_PROGRAM_LINES));
  });

  it('LockedFeatureError — extra functions are not allowed yet', () => {
    const e = firstError('def helper():\n    wait()\n');
    expect(e.name).toBe('LockedFeatureError');
    expect(e.messageTh).toContain('turn');
  });

  it('NameError — unknown global suggests the closest known name', () => {
    const [e] = validate(ok('def turn():\n    attack(weakest(enemys))\n'), opts()).errors;
    expect(e.name).toBe('NameError');
    expect(e.messageTh).toBe("ไม่รู้จัก 'enemys' — คุณหมายถึง 'enemies' หรือเปล่า?");
    expect(e.line).toBe(2);
  });

  it('NameError — unknown attribute and unknown function', () => {
    const attr = validate(ok('def turn():\n    if me.hpp < 5:\n        wait()\n'), opts()).errors[0];
    expect(attr.name).toBe('NameError');
    expect(attr.messageTh).toContain("'.hp'");
    const fn = validate(ok('def turn():\n    attack(weakes(enemies))\n'), opts()).errors[0];
    expect(fn.name).toBe('NameError');
    expect(fn.messageTh).toContain("'weakest()'");
  });

  it('NameError — unit attributes are a smaller set than me attributes', () => {
    expect(validate(ok('def turn():\n    if me.matk > 1:\n        wait()\n'), opts()).errors).toEqual([]);
    const e = validate(ok('def turn():\n    if weakest(enemies).matk > 1:\n        wait()\n'), opts()).errors[0];
    expect(e.name).toBe('NameError');
    expect(e.messageTh).toContain('me');
  });

  it('TypeError — arity, argument type, attribute on a list, AoE misuse', () => {
    const arity = validate(ok('def turn():\n    attack(me, me)\n'), opts()).errors[0];
    expect(arity.name).toBe('TypeError');
    expect(arity.messageTh).toBe('attack() ต้องการ 1 argument แต่ได้รับ 2');

    const argT = validate(ok('def turn():\n    attack(enemies)\n'), opts()).errors[0];
    expect(argT.name).toBe('TypeError');
    expect(argT.messageTh).toContain('ต้องการตัวละคร');

    const onList = validate(ok('def turn():\n    if enemies.hp < 3:\n        wait()\n'), opts()).errors[0];
    expect(onList.name).toBe('TypeError');
    expect(onList.messageTh).toContain('weakest(enemies).hp');

    const aoe = validate(ok('def turn():\n    cast("firebolt", enemies)\n'), opts()).errors[0];
    expect(aoe.name).toBe('TypeError');
    expect(aoe.messageTh).toContain('ไม่ใช่สกิลวงกว้าง');

    expect(validate(ok('def turn():\n    cast("blizzard", enemies)\n'), opts()).errors).toEqual([]);
  });

  it('ValueError — unknown skill name and a skill the player does not own', () => {
    const unknown = validate(ok('def turn():\n    cast("firebalt", me)\n'), opts()).errors[0];
    expect(unknown.name).toBe('ValueError');
    expect(unknown.messageTh).toContain("คุณหมายถึง 'firebolt'");

    const notOwned = validate(
      ok('def turn():\n    cast("firebolt", weakest(enemies))\n'),
      opts({ availableSkills: ['w_power_strike'] }),
    ).errors[0];
    expect(notOwned.name).toBe('ValueError');
    expect(notOwned.messageTh).toContain("ยังใช้สกิล 'firebolt' ไม่ได้");
  });

  /**
   * ลบเทสต์ 'MemoryError — reports usage, capacity and the line that broke the budget'
   * เมื่อ 19 ก.ย. 2026: มันตรึงพฤติกรรมของระบบ Memory ที่ถูกถอดทั้งระบบตาม §3.1
   * โปรแกรมเดียวกัน (อ้าง 3 สกิลรวม 13 MB) ตอนนี้ต้องผ่าน validate โดยไม่มี error
   */
  it('อ้างหลายสกิลในโปรแกรมเดียวไม่มีเพดานอีกแล้ว (MB ถูกถอดตาม §3.1)', () => {
    const src = 'def turn():\n'
      + '    if me.hp_pct < 20:\n'
      + '        cast("power_strike", weakest(enemies))\n'
      + '    elif me.hp_pct < 50:\n'
      + '        cast("whirlwind", enemies)\n'
      + '    else:\n'
      + '        cast("execute", weakest(enemies))\n';
    expect(validate(ok(src), opts()).errors).toEqual([]);
  });
});

// ======================================= รอบ 2F §3.4 — ความผิดพลาดแบบเงียบ
/**
 * หกอาการที่รอบ 2T วัดได้ว่า "เขียนผิดแล้วเกมไม่บอก" — ทุกตัวต้องมีข้อความที่บอกวิธีแก้
 *
 * เทสต์ในชุดนี้ยืนยันสามอย่างเสมอ ไม่ใช่แค่ "มี error":
 *   1. ฟ้องจริง และเป็นชนิดที่ถูก
 *   2. ข้อความมี "ทางแก้" อยู่ในนั้น ไม่ใช่แค่บอกว่าผิด
 *   3. โค้ดตัวอย่างในข้อความ validate ผ่านจริง — กันกับดักแบบ `.length` ในรอบ 2T
 *      ที่ข้อความแนะนำ `weakest(enemies).length` ซึ่งเองก็ใช้ไม่ได้
 *
 * ส่วน describe ถัดไป ('ยังต้องบันทึกได้') คือด้านกลับของชุดนี้ — โปรแกรมที่ถูกต้อง
 * และอยู่ใกล้เส้นแบ่งต้องไม่ถูกบล็อก เพราะ error ที่ฟ้องเกินแย่กว่าไม่ฟ้องเลย
 */
describe('รอบ 2F §3.4 — อาการเงียบต้องกลายเป็นข้อความที่บอกวิธีแก้', () => {
  /**
   * ดึงโค้ดตัวอย่างในข้อความออกมาแล้วยืนยันว่ามันบันทึกได้จริง
   * ข้ามการ "เอ่ยชื่อฟังก์ชัน" เปล่า ๆ เช่น "attack() ที่อยู่ใน for" ซึ่งเป็นการพูดถึง
   * ไม่ใช่บรรทัดให้พิมพ์ตาม — ส่วน defend() / wait() ไม่มี argument จริง ๆ จึงยังนับ
   */
  const ZERO_ARG = new Set(['defend', 'wait']);
  const CALL_RE =
    /\b(attack|cast|defend|wait|count|weakest|strongest|deadliest|fastest|random_of|has_buff|has_debuff|can_cast)\(([^)]*)\)+/g;
  const suggestionsIn = (msg: string): string[] =>
    [...msg.matchAll(CALL_RE)]
      .filter((m) => m[2].trim() !== '' || ZERO_ARG.has(m[1]))
      .map((m) => m[0]);

  /**
   * ตรวจว่าโปรแกรมนี้ "ถูกปฏิเสธจริง" ก่อนจะไปดูเนื้อข้อความ
   *
   * ทำไมต้องมีชั้นนี้: ทุกเทสต์ในชุดนี้มีไว้เพื่อ "อาการเงียบต้องไม่เงียบอีก"
   * ถ้าใครถอดการตรวจออก สิ่งที่เกิดคือ errors ว่าง ซึ่งเป็นอาการที่เรากำลังกันอยู่พอดี
   * จึงต้องฟ้องด้วยประโยคที่บอกว่าเกิดอะไรขึ้น ไม่ใช่พังเป็น undefined ให้คนอ่านเดาเอง
   */
  function rejected(src: string, over: Partial<ValidateOptions> = {}): LangError[] {
    const errs = validate(ok(src), opts(over)).errors;
    expect(errs.length, `โปรแกรมนี้ต้องถูกปฏิเสธ แต่ผ่านแบบเงียบ ๆ:\n${src}`).toBeGreaterThan(0);
    return errs;
  }

  function expectSuggestionsValid(msg: string, over: Partial<ValidateOptions> = {}): void {
    const found = suggestionsIn(msg);
    expect(found.length, `ข้อความไม่มีโค้ดตัวอย่างให้ทำตาม: ${msg}`).toBeGreaterThan(0);
    for (const snippet of found) {
      const res = validate(ok(`def turn():\n    ${snippet}\n`), opts(over));
      expect(res.errors, `ข้อความแนะนำโค้ดที่ใช้ไม่ได้: ${snippet}\nจาก: ${msg}`).toEqual([]);
    }
  }

  it('#1 attack(me) — เล็งตัวเองไม่ได้ และบอกว่าต้องเล็งอะไรแทน', () => {
    const [e, ...rest] = rejected('def turn():\n    attack(me)\n');
    expect(rest).toEqual([]);
    expect(e.name).toBe('TypeError');
    expect(e.line).toBe(2);
    expect(e.messageTh).toContain('ต้องเล็งศัตรู');
    expect(e.messageTh).toContain('me คือตัวคุณเอง');
    expectSuggestionsValid(e.messageTh);
  });

  it('#1 attack(weakest(allies)) — ฝ่ายเดียวกันก็ตีไม่ได้ ถึงจะไม่ใช่ me', () => {
    const [e] = rejected('def turn():\n    attack(weakest(allies))\n');
    expect(e.name).toBe('TypeError');
    expect(e.messageTh).toContain('ฝ่ายเดียวกับคุณ');
    expectSuggestionsValid(e.messageTh);
  });

  it('#1 cast() ผิดฝั่งทั้งสองทาง — สกิลทำร้ายใส่ตัวเอง / สกิลช่วยเหลือใส่ศัตรู', () => {
    const [hurt] = rejected('def turn():\n    cast("firebolt", me)\n');
    expect(hurt.name).toBe('TypeError');
    expect(hurt.messageTh).toContain('สกิลทำร้าย');
    expectSuggestionsValid(hurt.messageTh);

    const [help] = rejected('def turn():\n    cast("heal", weakest(enemies))\n');
    expect(help.name).toBe('TypeError');
    expect(help.messageTh).toContain('สกิลช่วยเหลือ');
    expectSuggestionsValid(help.messageTh);
  });

  it('#2 defend() แล้ว attack() — บอกกฎ "1 การกระทำต่อเทิร์น" และชี้บรรทัดต้นเหตุ', () => {
    const [e, ...rest] = rejected('def turn():\n    defend()\n    attack(weakest(enemies))\n');
    expect(rest).toEqual([]);
    expect(e.name).toBe('TypeError');
    expect(e.line).toBe(3);                       // ชี้บรรทัดที่หายไป ไม่ใช่บรรทัดแรก
    expect(e.messageTh).toContain('1 การกระทำต่อเทิร์น');
    expect(e.messageTh).toContain('ไม่มีวันทำงาน');
    expect(e.messageTh).toContain('บรรทัด 2');     // บอกด้วยว่าใครสั่งไปก่อน
    expect(e.messageTh).toContain('if / else');
  });

  it('#2 attack() สามบรรทัดติดกัน (เคสจริงของ newbie §6) ก็ต้องฟ้อง', () => {
    const src = `def turn():\n${'    attack(weakest(enemies))\n'.repeat(3)}`;
    const errs = rejected(src);
    expect(errs).toHaveLength(1);                 // ฟ้องครั้งเดียวต่อบล็อก ไม่ท่วม gutter
    expect(errs[0].line).toBe(3);
  });

  it('#2 ตอน if/else ยังล็อก ต้องไม่แนะนำ if/else — ใช้ถ้อยคำ "ยังไม่ปลดล็อก" แทน', () => {
    const [e] = rejected(
      'def turn():\n    defend()\n    attack(weakest(enemies))\n',
      { features: unlockedFeatures(0) },
    );
    expect(e.messageTh).toContain('ยังไม่ปลดล็อก');
    expect(e.messageTh).toContain(`ต้องผ่านชั้น ${FEATURE_UNLOCK.if_else} ก่อน`);
    expect(e.messageTh).toContain('เก็บไว้บรรทัดเดียว');
  });

  it('#3 for e in enemies: attack(e) — บอกว่าวนแล้วสั่งได้ครั้งเดียว', () => {
    const [e, ...rest] = rejected('def turn():\n    for e in enemies:\n        attack(e)\n');
    expect(rest).toEqual([]);
    expect(e.name).toBe('TypeError');
    expect(e.line).toBe(3);
    expect(e.messageTh).toContain('1 การกระทำต่อเทิร์น');
    expect(e.messageTh).toContain('รอบแรก');
    expect(e.messageTh).toContain('if คัดตัว');   // บอกวิธีทำให้ for มีประโยชน์
    expectSuggestionsValid(e.messageTh);
  });

  /**
   * เดิมเทสต์นี้ชื่อ "ต้องฟ้องพร้อมบอกวิธีได้มา" แล้วตรึงข้อความ "อัพเลเวลหรือหาบล็อกจากมอนสเตอร์"
   * ซึ่งเป็นเท็จสองชั้น: บล็อกดรอปจากมอนยังไม่มีในเกม (รอบ 2C) และนักรบอัพเลเวลไปเท่าไรก็ไม่ได้ heal
   * — ความผิดพลาดตระกูลเดียวกับ "ต้องผ่านชั้น 13" · เทสต์จึงตรึงความจริงแทน และกันคำสัญญาเท็จไม่ให้กลับมา
   */
  it('#4 cast() สกิลที่ยังไม่มีในมือ ต้องบอกความจริงของสกิล และสิ่งที่ใช้ได้ตอนนี้', () => {
    const [e] = rejected('def turn():\n    cast("heal", me)\n', { availableSkills: ['m_firebolt'] });
    expect(e.name).toBe('ValueError');
    expect(e.messageTh).toContain('เป็นสกิลของจอมเวท');        // ของอาชีพไหน
    expect(e.messageTh).toMatch(/ปลดที่เลเวล \d+/);            // ปลดเมื่อไร
    expect(e.messageTh).toContain('สกิลที่คุณใช้ได้ตอนนี้');     // แล้วตอนนี้ใช้อะไรได้
    expect(e.messageTh).not.toContain('มอนสเตอร์');              // คำสัญญาที่เกมให้ไม่ได้ ห้ามกลับมา
  });

  it('#4b ไม่มีสกิลเลยสักตัว ต้องชี้ไปที่ attack() ไม่ใช่ปล่อยให้ลิสต์ว่าง', () => {
    const [e] = rejected('def turn():\n    cast("heal", me)\n', { availableSkills: [] });
    expect(e.messageTh).toContain('ยังไม่มีสกิลเลย');
    expect(e.messageTh).toContain('attack()');
  });

  it('#5 has_buff("bananas") — ลิสต์สถานะที่มีจริงให้ดูในข้อความ', () => {
    const [e] = rejected('def turn():\n    if has_buff("bananas"):\n        defend()\n');
    expect(e.name).toBe('ValueError');
    expect(e.line).toBe(2);
    expect(e.messageTh).toContain("ไม่มีสถานะชื่อ 'bananas'");
    for (const s of BUFF_NAMES) expect(e.messageTh).toContain(s);
  });

  it('#5 has_buff สะกดผิดได้คำแนะนำ', () => {
    const [typo] = rejected('def turn():\n    if has_buff("sheild"):\n        defend()\n');
    expect(typo.messageTh).toContain("คุณหมายถึง 'shield'");
  });

  /**
   * รอบ 2M: has_debuff มีคลังของตัวเอง (สถานะร้ายที่ศัตรูใส่ให้) — แยกจากบัฟ
   * เพราะ has_debuff("shield") ไม่มีวันจริง การรับไว้เฉย ๆ คืออาการเงียบแบบ "bananas"
   */
  it('#5 has_debuff ใช้คลังสถานะร้าย · marked บันทึกได้ · สะกดผิดได้คำแนะนำ', () => {
    for (const d of DEBUFF_NAMES) {
      expect(validate(ok(`def turn():\n    if has_debuff("${d}"):\n        defend()\n`), opts({})).errors).toEqual([]);
    }
    const [bad] = rejected('def turn():\n    if has_debuff("poison"):\n        defend()\n');
    expect(bad.name).toBe('ValueError');
    for (const d of DEBUFF_NAMES) expect(bad.messageTh).toContain(d);

    const [typo] = rejected('def turn():\n    if has_debuff("marker"):\n        defend()\n');
    expect(typo.messageTh).toContain("คุณหมายถึง 'marked'");
  });

  it('#5 ชื่อถูกแต่ผิดฟังก์ชัน — บอกให้ย้ายไปอีกฟังก์ชัน ไม่ใช่บอกว่าไม่มีชื่อนี้', () => {
    const [wrongDebuff] = rejected('def turn():\n    if has_debuff("shield"):\n        defend()\n');
    expect(wrongDebuff.messageTh).toContain('has_buff("shield")');
    expect(wrongDebuff.messageTh).not.toContain('ไม่มีสถานะชื่อ');
    const [wrongBuff] = rejected('def turn():\n    if has_buff("marked"):\n        defend()\n');
    expect(wrongBuff.messageTh).toContain('has_debuff("marked")');
  });

  it('#6 NameError ของฟังก์ชันต้องลิสต์ฟังก์ชันให้ครบ ไม่ใช่ไล่ไปหน้าช่วยเหลือ', () => {
    const [e] = rejected('def turn():\n    flee()\n');
    expect(e.name).toBe('NameError');
    expect(e.messageTh).not.toContain('หน้าช่วยเหลือ');
    // ทุกฟังก์ชันที่ผู้เล่นคนนี้เรียกได้ต้องอยู่ในข้อความ — นี่คือ "คู่มือ" เพียงที่เดียวในเกม
    for (const fn of [
      'attack', 'cast', 'defend', 'wait',
      'weakest', 'strongest', 'deadliest', 'fastest', 'random_of',
      'count', 'len', 'has_buff', 'has_debuff', 'can_cast',
    ]) {
      expect(e.messageTh, `ข้อความต้องเอ่ยถึง ${fn}`).toContain(fn);
    }
    // และต้องสอนกฎ "หนึ่งการกระทำต่อเทิร์น" ไปในตัว เพราะไม่มีที่อื่นบอกกฎนี้เลย
    expect(e.messageTh).toContain('ต่อเทิร์น');
  });

  it('#6 ฟังก์ชันที่ยังล็อกอยู่ต้องไม่ถูกลิสต์ — เคย "แนะนำ len() ที่ยังล็อก"', () => {
    const [e] = rejected('def turn():\n    flee()\n', { features: unlockedFeatures(0) });
    expect(e.messageTh).toContain('count');
    expect(e.messageTh).not.toContain('len');
  });

  it('#6 เลิกเดาจากตัวสะกดของคำสั้น ๆ (flee→len, rest→cast ต้องหายไป)', () => {
    for (const bogus of ['flee', 'rest', 'idle']) {
      const [e] = rejected(`def turn():\n    ${bogus}()\n`);
      expect(e.messageTh, `${bogus}() ไม่ควรมีคำแนะนำมั่ว ๆ`).not.toContain('คุณหมายถึง');
    }
    // คำยาวที่ใกล้เคียงจริงยังต้องแนะนำเหมือนเดิม (ผู้เล่นรอบ 2T บอกว่าอันนี้ช่วยได้)
    const [good] = rejected('def turn():\n    attack(nearest(enemies))\n');
    expect(good.messageTh).toContain("คุณหมายถึง 'weakest()'");
  });

  it('#6 ชื่อสกิลที่พิมพ์เป็นฟังก์ชัน ต้องชี้ไป cast() ด้วยความหมาย ไม่ใช่ตัวสะกด', () => {
    const [owned] = rejected('def turn():\n    heal()\n',
      { availableSkills: ['m_firebolt', 'm_heal'] });
    expect(owned.messageTh).toContain('เป็นชื่อสกิล');
    expectSuggestionsValid(owned.messageTh, { availableSkills: ['m_firebolt', 'm_heal'] });

    // ไม่มีสกิลนั้นในมือ → ห้ามยื่นบรรทัดที่ทำตามแล้วเจอ error ใหม่
    const [notOwned] = rejected('def turn():\n    heal()\n',
      { availableSkills: ['w_power_strike'] });
    expect(notOwned.messageTh).not.toContain('เป็นชื่อสกิล');
  });

  /**
   * กับดักที่ปิดถาวร: ถ้าใครเพิ่มสถานะใหม่ใน battle.ts แล้วลืมบอก validate
   * `has_buff("ชื่อใหม่")` จะถูกปฏิเสธทั้งที่ของมีจริง — เทสต์นี้จะแดงก่อนถึงมือผู้เล่น
   * (อ่านซอร์สแทนการ import เพราะชื่อบัฟถูกเขียนเป็นสตริงตรง ๆ ไม่มีตารางให้ import)
   */
  it('คลังชื่อสถานะต้องครอบคลุมทุกชื่อที่ battle.ts สร้างได้', () => {
    const src = readFileSync(join(__dirname, '../src/battle.ts'), 'utf8');
    for (const [list, vocab, fn] of [
      ['buffs', BUFF_NAMES, 'has_buff'], ['debuffs', DEBUFF_NAMES, 'has_debuff'],
    ] as const) {
      const pushed = [...src.matchAll(new RegExp(`\\b${list}\\.push\\('([^']+)'\\)`, 'g'))].map((m) => m[1]);
      expect(pushed.length, `หา ${list}.push ใน battle.ts ไม่เจอเลย — รูปแบบโค้ดเปลี่ยนไปแล้วหรือเปล่า?`)
        .toBeGreaterThan(0);
      for (const name of pushed) {
        expect(
          vocab as readonly string[],
          `battle.ts สร้าง ${list} '${name}' ได้ แต่คลังชื่อใน validate.ts ไม่รู้จัก`
          + ` — เพิ่ม '${name}' เข้าไป ไม่งั้น ${fn}("${name}") จะถูกปฏิเสธทั้งที่ถูกต้อง`,
        ).toContain(name);
      }
    }
  });
});

/**
 * ด้านกลับของ §3.4 — โปรแกรมที่ "ถูกต้องและอยู่ใกล้เส้นแบ่ง" ต้องบันทึกได้เหมือนเดิม
 * ทุกเคสในนี้เคยเป็นสิ่งที่การตรวจแบบหยาบจะบล็อกทิ้ง ซึ่งจะแย่กว่าปล่อยผ่านตั้งแต่แรก
 */
describe('รอบ 2F §3.4 — ยังต้องบันทึกได้ (กันการฟ้องเกิน)', () => {
  const cases: [string, string][] = [
    [
      'for ที่มี if คัดตัวอยู่ข้างใน แล้วมี attack สำรองต่อท้าย',
      'def turn():\n    for e in enemies:\n        if e.hp_pct < 20:\n            attack(e)\n'
      + '    attack(weakest(enemies))\n',
    ],
    [
      'cast แล้วตามด้วย attack — ท่าสำรองตอนไม่มีสกิล/MP ไม่พอ ซึ่งเอกสารภาษารับรองไว้',
      'def turn():\n    cast("firebolt", weakest(enemies))\n    attack(weakest(enemies))\n',
    ],
    [
      'if ที่ไม่มี else แล้วมี attack ต่อท้าย — สาขานั้นอาจไม่ทำงาน',
      'def turn():\n    if me.hp_pct < 30:\n        defend()\n    attack(weakest(enemies))\n',
    ],
    ['สกิลฟื้นฟูใส่ตัวเอง', 'def turn():\n    cast("heal", me)\n'],
    ['สกิลฟื้นฟูใส่เพื่อนที่เลือดน้อยสุด', 'def turn():\n    cast("heal", weakest(allies))\n'],
    ['สกิลวงกว้างใส่กองศัตรู', 'def turn():\n    cast("blizzard", enemies)\n'],
    ['ยั่วยุใส่ตัวเอง (สกิลออร่า)', 'def turn():\n    cast("taunt", me)\n'],
    [
      'has_buff ด้วยชื่อสถานะที่มีจริง',
      'def turn():\n    if has_buff("shield"):\n        attack(weakest(enemies))\n'
      + '    else:\n        defend()\n',
    ],
    [
      'ตัวแปรถือศัตรูแล้วเอาไปตี (โปรแกรมที่ดีที่สุดของ newbie §12)',
      'def turn():\n    t = weakest(enemies)\n    if t.hp < me.atk:\n        attack(t)\n'
      + '    else:\n        attack(deadliest(enemies))\n',
    ],
    [
      'ตัวแปรที่สลับฝั่งคนละสาขา — สรุปฝั่งไม่ได้ ต้องปล่อยผ่าน ไม่ใช่เดาแล้วบล็อก',
      'def turn():\n    t = weakest(enemies)\n    if turn_no > 3:\n        t = me\n'
      + '    cast("heal", t)\n',
    ],
  ];

  for (const [name, src] of cases) {
    it(name, () => {
      expect(validate(ok(src), opts()).errors, src).toEqual([]);
    });
  }
});

// ==================================================== คำสงวนในตำแหน่งของชื่อ
/**
 * differential test เทียบกับ CPython แค่ระดับ "รับ/ไม่รับ" — ข้อความเป็นหน้าที่ของที่นี่
 * ทุกเคสในนี้ CPython ปฏิเสธด้วย SyntaxError ล่ามเราจึงต้องเป็น SyntaxError เหมือนกัน
 * ห้ามเป็น NameError เด็ดขาด เพราะ CPython ไม่เคยพูดแบบนั้นกับโปรแกรมพวกนี้
 */
describe('คำสงวนของ Python ใช้เป็นชื่อไม่ได้', () => {
  const HARD_KEYWORDS = ['def', 'if', 'elif', 'else', 'for', 'in', 'and', 'or', 'not', 'pass'];
  const CONSTANTS = ['True', 'False', 'None'];

  it('หลังจุด: me.def ต้องบอกให้ใช้ me.defense ไม่ใช่ข้อความกลาง ๆ', () => {
    const e = firstError('def turn():\n    if me.def > 5:\n        attack(weakest(enemies))\n');
    expect(e.name).toBe('SyntaxError');
    expect(e.messageTh).toContain("'def' เป็นคำสงวนของ Python");
    expect(e.messageTh).toContain('me.defense');
    expect([e.line, e.col]).toEqual([2, 11]);
  });

  it('หลังจุด: คำสงวนทุกตัวถูกปฏิเสธ ไม่ใช่แค่ def', () => {
    for (const kw of [...HARD_KEYWORDS, ...CONSTANTS]) {
      const e = firstError(`def turn():\n    if me.${kw} > 5:\n        wait()\n`);
      expect(e.name, `me.${kw}`).toBe('SyntaxError');
      expect(e.messageTh, `me.${kw}`).toContain('ชื่อคุณสมบัติหลังจุด');
    }
    // ใช้กับผลลัพธ์ของฟังก์ชันก็ต้องเหมือนกัน (x.and ตามที่ PM ระบุ)
    const e = firstError('def turn():\n    if weakest(enemies).and > 5:\n        wait()\n');
    expect(e.name).toBe('SyntaxError');
  });

  it('เป็นเป้าของการกำหนดค่า: if = 5 / and = 3 / True = 1', () => {
    for (const kw of [...HARD_KEYWORDS, ...CONSTANTS]) {
      const e = firstError(`def turn():\n    ${kw} = 5\n    wait()\n`);
      expect(e.name, `${kw} = 5`).toBe('SyntaxError');
      expect(e.messageTh, `${kw} = 5`).toContain('ชื่อตัวแปร');
      expect([e.line, e.col], `${kw} = 5`).toEqual([2, 5]);
    }
    // ค่าคงที่ต้องถูกเรียกว่า "ค่าคงที่" ไม่ใช่ "คำสงวน" — ตรงกับที่ CPython แยก cannot assign to True
    expect(firstError('def turn():\n    True = 1\n    wait()\n').messageTh).toContain('ค่าคงที่ของ Python');
  });

  it('เป็นชื่อตัวแปรของ for', () => {
    for (const kw of [...HARD_KEYWORDS, ...CONSTANTS]) {
      const e = firstError(`def turn():\n    for ${kw} in enemies:\n        wait()\n`);
      expect(e.name, `for ${kw}`).toBe('SyntaxError');
    }
    expect(firstError('def turn():\n    for if in enemies:\n        wait()\n').messageTh)
      .toContain('ชื่อตัวแปรของ for');
  });

  it('เป็นค่าหรือ argument เฉย ๆ', () => {
    for (const kw of [...HARD_KEYWORDS, ...CONSTANTS]) {
      expect(firstError(`def turn():\n    attack(${kw})\n`).name, `attack(${kw})`).toBe('SyntaxError');
      expect(firstError(`def turn():\n    t = ${kw}\n    wait()\n`).name, `t = ${kw}`).toBe('SyntaxError');
    }
  });

  it('เป็นชื่อฟังก์ชันที่ประกาศ: def if(): ไม่ใช่ LockedFeatureError แต่เป็น SyntaxError', () => {
    for (const kw of [...HARD_KEYWORDS, ...CONSTANTS]) {
      const e = firstError(`def ${kw}():\n    wait()\n`);
      expect(e.name, `def ${kw}()`).toBe('SyntaxError');
    }
    // ชื่อที่ไม่ใช่คำสงวนยังเป็น LockedFeatureError เหมือนเดิม (ฟังก์ชันของผู้เล่นยังไม่เปิด)
    expect(firstError('def attack_all():\n    wait()\n').name).toBe('LockedFeatureError');
  });

  it('เป็นชื่อฟังก์ชันที่เรียก — ตามที่ CPython ว่า ไม่ใช่ตามที่เราเดา', () => {
    // not(x) คือ unary not กับวงเล็บ CPython รับ เราจึงต้องรับด้วย
    expect(parse('def turn():\n    if not(me.hp_pct < 50):\n        defend()\n').errors).toEqual([]);
    // ที่เหลือ CPython ปฏิเสธหมด
    for (const kw of ['def', 'if', 'elif', 'else', 'for', 'in', 'and', 'or', 'pass']) {
      expect(firstError(`def turn():\n    ${kw}(me)\n`).name, `${kw}(me)`).toBe('SyntaxError');
    }
  });

  it('True / False / None ห้ามกลายเป็น NameError ไม่ว่าจะอยู่ตำแหน่งไหน', () => {
    const places = [
      'def turn():\n    if {k}:\n        wait()\n',
      'def turn():\n    attack({k})\n',
      'def turn():\n    t = {k}\n    wait()\n',
      'def turn():\n    if me.hp + {k} > 5:\n        wait()\n',
      'def turn():\n    {k} = 1\n    wait()\n',
      'def turn():\n    for {k} in enemies:\n        wait()\n',
      'def turn():\n    if me.{k} > 5:\n        wait()\n',
    ];
    for (const kw of CONSTANTS) {
      for (const tpl of places) {
        const src = tpl.replaceAll('{k}', kw);
        const r = parse(src);
        expect(r.errors[0]?.name, src).toBe('SyntaxError');
      }
    }
  });

  /**
   * คำสงวนที่ BloxCode ไม่มีฟีเจอร์นั้นเลย ก็ยังใช้เป็นชื่อไม่ได้อยู่ดี
   * เจอตอนตรวจงาน 18 ก.ย. 2026: as / async / await / except / finally / from / nonlocal
   * ไม่ได้อยู่ในรายการไหนเลย จึงถูกเล็กซ์เป็นชื่อธรรมดา แล้ว me.from ผ่านล่ามเราทั้งที่ CPython ปฏิเสธ
   * (differential.test.ts ดึงรายการจาก keyword.kwlist ของ CPython มาไล่ จึงกันคำที่จะตกหล่นในอนาคต)
   */
  it('คำสงวนของ Python ที่ภาษาเราไม่มีฟีเจอร์ ก็ยังใช้เป็นชื่อไม่ได้', () => {
    const noFeature = [
      'as', 'async', 'await', 'except', 'finally', 'from', 'nonlocal',
      'while', 'return', 'import', 'class', 'lambda', 'try', 'raise', 'global',
      'break', 'continue', 'yield', 'with', 'assert', 'del', 'is',
    ];
    for (const kw of noFeature) {
      for (const src of [
        `def turn():\n    if me.${kw} > 5:\n        wait()\n`,
        `def turn():\n    ${kw} = 5\n    wait()\n`,
        `def turn():\n    for ${kw} in enemies:\n        wait()\n`,
        `def turn():\n    attack(${kw})\n`,
      ]) {
        expect(firstError(src).name, src).toBe('SyntaxError');
      }
    }
  });

  it('soft keyword (match / case / _) ยังใช้เป็นชื่อได้ เพราะ CPython ก็ยังให้ใช้', () => {
    for (const w of ['match', 'case', '_']) {
      expect(parse(`def turn():\n    ${w} = weakest(enemies)\n    attack(${w})\n`).errors, w).toEqual([]);
      expect(parse(`def turn():\n    for ${w} in enemies:\n        attack(${w})\n`).errors, w).toEqual([]);
    }
  });

  it("'in' นอกคำสั่ง for บอกเหตุผล ไม่ใช่ฟ้องว่าลืมเครื่องหมาย :", () => {
    const e = firstError('def turn():\n    if me in enemies:\n        wait()\n');
    expect(e.name).toBe('SyntaxError');
    expect(e.messageTh).toContain("'in'");
    // for ... in ... ปกติต้องไม่ได้รับผลกระทบ
    expect(parse('def turn():\n    for e in enemies:\n        attack(e)\n').errors).toEqual([]);
  });

  it('tuple ที่ Python รับแต่เราไม่มี — ต้องบอกว่าไม่รองรับ tuple', () => {
    expect(firstError('def turn():\n    not()\n').messageTh).toContain('วงเล็บว่าง');
    expect(firstError('def turn():\n    not("heal", me)\n').messageTh).toContain('tuple');
    // วงเล็บจัดลำดับปกติต้องยังใช้ได้
    expect(parse('def turn():\n    if (me.hp + 1) * 2 > 5:\n        wait()\n').errors).toEqual([]);
  });
});

// ======================================================= ไม่มีเพดาน MB แล้ว
/**
 * ที่นี่เคยเป็น describe('memory (MB) accounting') — 5 เทสต์ที่ตรึงไว้ว่า
 * สกิลตัวไหนกิน MB เท่าไร · MB ที่มีโตยังไง · และ "สกิลครบชุดของทุกอาชีพ
 * ต้องใส่พร้อมกันไม่ได้" ทั้งหมดถูกลบเมื่อ 19 ก.ย. 2026 เพราะระบบ Memory
 * ถูกถอดทั้งระบบตาม docs/design-round2p.md §3.1 — เทสต์ที่ตรึงพฤติกรรมของ
 * ระบบที่ไม่มีแล้วไม่ได้ป้องกันอะไร มันแค่ทำให้ลบระบบไม่ได้
 *
 * เทสต์เดียวที่เหลือด้านล่างคือ "คำสัญญาที่กลับด้าน" ของเทสต์ตัวสุดท้ายในชุดนั้น:
 * สิ่งที่เคย *ห้าม* ตอนนี้ต้อง *ได้* — ถ้าใครเผลอใส่เพดานอะไรกลับเข้ามา ตัวนี้จะแดง
 */
describe('ไม่มีเพดานจำนวนสกิลต่อโปรแกรมแล้ว', () => {
  it('สกิลครบชุดของทุกอาชีพต้องอ้างพร้อมกันในโปรแกรมเดียวได้', () => {
    const fullSet: Record<string, string[]> = {
      warrior: ['power_strike', 'whirlwind', 'execute'],
      mage: ['firebolt', 'blizzard', 'heal'],
      guardian: ['shield_bash', 'taunt', 'barrier'],
    };
    // เป้าหมายต้องอยู่ฝั่งที่ถูกตั้งแต่รอบ 2F (§3.4) — เดิมฟิกซ์เจอร์นี้เล็ง me ทุกสกิล
    // รวมถึงสกิลทำร้าย ซึ่งตอนนั้นผ่านเพราะไม่มีใครตรวจ แล้วเอนจินก็เปลี่ยนเป้าให้เงียบ ๆ
    // เจตนาของเทสต์คือ "อ้างสกิลกี่ตัวก็ได้" ไม่ใช่ "เล็งใครก็ได้" จึงเลือกเป้าตามชนิดสกิล
    const targetFor = (short: string): string => {
      const info = resolveSkillName(short)!;
      return info.kind === 'heal' || info.kind === 'shield' || info.kind === 'taunt'
        ? 'me'
        : 'weakest(enemies)';
    };
    for (const [cls, names] of Object.entries(fullSet)) {
      const src = 'def turn():\n'
        + names
          .map((n, i) => `    ${i === 0 ? 'if' : 'elif'} turn_no > ${i}:\n`
            + `        cast("${n}", ${targetFor(n)})\n`)
          .join('');
      const skills = gamedata.skills.filter((s) => s.classId === cls).map((s) => s.id);
      const res = validate(ok(src), opts({ availableSkills: skills }));
      expect(res.errors, `${cls} ต้องใส่สกิลครบชุดได้:\n${src}`).toEqual([]);
    }
  });
});

// ========================================================== feature gating
describe('feature unlock ladder', () => {
  const featOpts = (floor: number) => opts({ features: unlockedFeatures(floor) });
  const errsAt = (src: string, floor: number) =>
    validate(ok(src), featOpts(floor)).errors.filter((e) => e.name === 'LockedFeatureError');

  const CASES: { feature: Feature; src: string }[] = [
    { feature: 'if_else', src: 'def turn():\n    if turn_no > 1:\n        wait()\n' },
    { feature: 'string', src: 'def turn():\n    if has_buff("x"):\n        wait()\n' },
    { feature: 'elif', src: 'def turn():\n    if turn_no > 1:\n        wait()\n    elif turn_no > 2:\n        defend()\n' },
    { feature: 'boolop', src: 'def turn():\n    if turn_no > 1 and turn_no < 5:\n        wait()\n' },
    { feature: 'variable', src: 'def turn():\n    t = weakest(enemies)\n    attack(t)\n' },
    { feature: 'for', src: 'def turn():\n    for e in enemies:\n        attack(e)\n' },
    { feature: 'arith', src: 'def turn():\n    if me.hp + 1 > 2:\n        wait()\n' },
  ];

  for (const { feature, src } of CASES) {
    it(`${feature} is locked below floor ${FEATURE_UNLOCK[feature]} and free at or above it`, () => {
      const floor = FEATURE_UNLOCK[feature];
      const locked = errsAt(src, floor - 1);
      expect(locked.length, `${feature} should be locked at floor ${floor - 1}`).toBeGreaterThan(0);
      expect(locked.some((e) => e.messageTh.includes(`ต้องผ่านชั้น ${floor} ก่อน`))).toBe(true);
      expect(errsAt(src, floor)).toEqual([]);
    });
  }

  it('plain calls work from floor 0', () => {
    expect(errsAt('def turn():\n    attack(weakest(enemies))\n', 0)).toEqual([]);
  });

  it('len() needs arithmetic (floor 13) while count() does not', () => {
    expect(errsAt('def turn():\n    if count(enemies) > 1:\n        wait()\n', 1)).toEqual([]);
    expect(errsAt('def turn():\n    if len(enemies) > 1:\n        wait()\n', 1).length).toBeGreaterThan(0);
  });
});

// ================================================================= printer
describe('printer round-trip', () => {
  const CANON = [
    'def turn():\n    wait()\n',
    '# แผนหลัก\n# บรรทัดสอง\ndef turn():\n    attack(weakest(enemies))\n',
    'def turn():\n'
    + '    t = weakest(enemies)\n'
    + '    if me.hp_pct < 30 and can_cast("heal"):\n'
    + '        cast("heal", me)\n'
    + '    elif count(enemies) >= 3:\n'
    + '        cast("blizzard", enemies)\n'
    + '    elif not has_buff("shield"):\n'
    + '        defend()\n'
    + '    else:\n'
    + '        for e in enemies:\n'
    + '            if e.hp_pct < 20:\n'
    + '                attack(e)\n'
    + '        attack(t)\n',
    'def turn():\n    n = me.hp + 10 * 2 - turn_no / 4\n    if n > (1 + 2) * 3:\n        pass\n    attack(me)\n',
    'def turn():\n    if -me.hp < 0 or not (turn_no == 1 and me.mp_pct > 50):\n        wait()\n',
    'def turn():\n    if turn_no > 1:\n        wait()\n    else:\n        if turn_no > 2:\n            defend()\n',
  ];

  for (const src of CANON) {
    it(`round-trips: ${src.split('\n')[0]}…`, () => {
      const p = ok(src);
      expect(toPython(p)).toBe(src);          // canonical form is a fixed point
      expect(ok(toPython(p))).toEqual(p);     // parse(toPython(p)) deep-equals p
    });
  }

  it('normalises indentation, quotes and spacing to the canonical form', () => {
    const messy = "def turn():\n  if me.hp_pct<30 :\n\t\tcast('heal',me)\n  else :\n   wait()\n";
    const canon = toPython(ok(messy));
    expect(canon).toBe(
      'def turn():\n    if me.hp_pct < 30:\n        cast("heal", me)\n    else:\n        wait()\n',
    );
    expect(toPython(ok(canon))).toBe(canon);
  });
});

// ================================================================ evaluator
describe('evaluator — runtime rules from the language doc', () => {
  it('records the deciding line and the target id', () => {
    const d = run('def turn():\n    pass\n    attack(weakest(enemies))\n');
    expect(d).toMatchObject({ action: 'attack', targetId: 'e2', line: 3, usedFallback: false });
  });

  it('targeting yourself reports __self__', () => {
    expect(run('def turn():\n    cast("heal", me)\n').targetId).toBe('__self__');
  });

  it('the first action wins; later actions are ignored', () => {
    const d = run('def turn():\n    defend()\n    attack(weakest(enemies))\n    wait()\n');
    expect(d.action).toBe('defend');
    expect(d.line).toBe(2);
  });

  it('running out without an action falls back to attack(weakest(enemies))', () => {
    const d = run('def turn():\n    if turn_no > 99:\n        defend()\n');
    expect(d).toMatchObject({ action: 'attack', targetId: 'e2', line: 0, usedFallback: true });
  });

  it('casting a skill you do not own is skipped and does NOT consume the turn', () => {
    const d = run(
      'def turn():\n    cast("firebolt", weakest(enemies))\n    defend()\n',
      { availableSkills: ['w_power_strike'] },
    );
    expect(d.action).toBe('defend');
    expect(d.usedFallback).toBe(false);
    expect(d.warnings![0]).toContain("ยังไม่มีบล็อกสกิล 'firebolt'");
    expect(d.warnings![0]).toContain('ไม่เสียเทิร์น');
  });

  it('casting without enough MP is skipped and does NOT consume the turn', () => {
    const d = run(
      'def turn():\n    cast("blizzard", enemies)\n    attack(weakest(enemies))\n',
      { me: unit({ id: 'hero', mp: 3 }) },
    );
    expect(d).toMatchObject({ action: 'attack', line: 3, usedFallback: false });
    expect(d.warnings![0]).toContain('MP ไม่พอ');
    expect(d.warnings![0]).toContain('16 MP');
  });

  it('an AoE skill accepts a list target and reports no single target', () => {
    const d = run('def turn():\n    cast("blizzard", enemies)\n');
    expect(d).toMatchObject({ action: 'skill', skillId: 'm_blizzard', line: 2 });
    expect(d.targetId).toBeUndefined();
  });

  it('a single-target skill aimed at a list is skipped with a warning', () => {
    const d = run('def turn():\n    cast("firebolt", enemies)\n    defend()\n');
    expect(d.action).toBe('defend');
    expect(d.warnings![0]).toContain('ไม่ใช่สกิลวงกว้าง');
  });

  it('can_cast reflects both ownership and current MP', () => {
    const owned = run(
      'def turn():\n    if can_cast("blizzard"):\n        cast("blizzard", enemies)\n    else:\n        defend()\n',
    );
    expect(owned.action).toBe('skill');
    const poor = run(
      'def turn():\n    if can_cast("blizzard"):\n        cast("blizzard", enemies)\n    else:\n        defend()\n',
      { me: unit({ id: 'hero', mp: 1 }) },
    );
    expect(poor.action).toBe('defend');
  });

  it('has_buff / has_debuff read the combat state', () => {
    const d = run(
      'def turn():\n    if has_buff("taunt") and not has_debuff("poison"):\n        defend()\n',
      { buffs: ['taunt'], debuffs: [] },
    );
    expect(d.action).toBe('defend');
  });

  /**
   * รอบ 2F §3.4 — เป้าที่ผิดฝั่งต้องไม่เงียบในบันทึกการรบ
   *
   * validate บล็อกท่านี้ตั้งแต่ตอนบันทึกแล้ว แต่โปรแกรมที่บันทึกไว้ก่อนหน้า (และโปรแกรม
   * ที่ validate สรุปฝั่งไม่ได้) ยังลงสนามได้ — เดิม battle.ts เปลี่ยนเป้าให้เองโดยไม่มี
   * บรรทัดไหนบอก ผู้เล่นจึงเชื่อว่า `attack(me)` ทำงานถูกแล้ว
   *
   * สำคัญ: เตือนอย่างเดียว "ห้ามเปลี่ยนการตัดสินใจ" — ไม่งั้นผลการรบจะขยับ
   * และ differential test กับ CPython จะไม่ตรงกัน
   */
  it('เป้าที่ผิดฝั่งต้องขึ้นคำเตือนในบันทึกการรบ โดยไม่เปลี่ยนการตัดสินใจ', () => {
    const self = run('def turn():\n    attack(me)\n');
    expect(self).toMatchObject({ action: 'attack', targetId: '__self__', line: 2 });
    expect(self.warnings!.join(' ')).toContain('ระบบเลือกเป้าให้เองแทน');
    expect(self.warnings!.join(' ')).toContain('attack(weakest(enemies))');

    const burnSelf = run('def turn():\n    cast("firebolt", me)\n');
    expect(burnSelf).toMatchObject({ action: 'skill', skillId: 'm_firebolt', targetId: '__self__' });
    expect(burnSelf.warnings!.join(' ')).toContain('สกิลทำร้าย');

    const healFoe = run('def turn():\n    cast("heal", weakest(enemies))\n');
    expect(healFoe).toMatchObject({ action: 'skill', skillId: 'm_heal', targetId: 'e2' });
    expect(healFoe.warnings!.join(' ')).toContain('สกิลช่วยเหลือ');
  });

  it('เป้าที่ถูกฝั่งต้องไม่มีคำเตือนอะไรเลย', () => {
    expect(run('def turn():\n    attack(weakest(enemies))\n').warnings).toBeUndefined();
    expect(run('def turn():\n    cast("heal", me)\n').warnings).toBeUndefined();
    expect(run('def turn():\n    cast("firebolt", weakest(enemies))\n').warnings).toBeUndefined();
    expect(run('def turn():\n    cast("taunt", me)\n').warnings).toBeUndefined();
  });

  it('random_of uses the battle rng, so the same seed gives the same target', () => {
    const src = 'def turn():\n    attack(random_of(enemies))\n';
    const a = run(src, { rng: mulberry32(99) });
    const b = run(src, { rng: mulberry32(99) });
    const c = run(src, { rng: mulberry32(1234) });
    expect(a.targetId).toBe(b.targetId);
    expect([a.targetId, c.targetId].every((x) => ['e1', 'e2', 'e3'].includes(x!))).toBe(true);
  });

  it('for loops iterate the real list and stop there', () => {
    const d = run(
      'def turn():\n    for e in enemies:\n        if e.hp_pct < 40:\n            attack(e)\n',
    );
    expect(d).toMatchObject({ action: 'attack', targetId: 'e2', line: 4 });
  });

  it('weakest / strongest / fastest keep the first tie like Python min()/max()', () => {
    const tie = {
      enemies: [unit({ id: 'a', hp: 50, speed: 10 }), unit({ id: 'b', hp: 50, speed: 10 })],
    };
    expect(run('def turn():\n    attack(weakest(enemies))\n', tie).targetId).toBe('a');
    expect(run('def turn():\n    attack(strongest(enemies))\n', tie).targetId).toBe('a');
    expect(run('def turn():\n    attack(fastest(enemies))\n', tie).targetId).toBe('a');
  });

  it('a runtime error stops the program and keeps any action already taken', () => {
    const d = run('def turn():\n    defend()\n    n = 1 / 0\n');
    expect(d.action).toBe('defend');
    expect(d.warnings!.some((w) => w.includes('หารด้วยศูนย์'))).toBe(true);
  });

  it('exceeding the node budget cuts the turn short and uses the fallback', () => {
    const many = Array.from({ length: 30 }, (_, i) => unit({ id: `m${i}`, hp: 100 - i }));
    const d = run(
      'def turn():\n'
      + '    for a in enemies:\n'
      + '        for b in enemies:\n'
      + '            n = a.hp + b.hp\n'
      + '    attack(weakest(enemies))\n',
      { enemies: many },
    );
    expect(d.usedFallback).toBe(true);
    expect(d.line).toBe(0);
    expect(d.targetId).toBe('m29');
    expect(d.warnings!.some((w) => w.includes('งบประมวลผล'))).toBe(true);
  });

  it('stays inside the node budget for a normal program', () => {
    expect(NODE_BUDGET_PER_TURN).toBe(300);
    const d = run(
      'def turn():\n'
      + '    for e in enemies:\n'
      + '        if e.hp_pct < 40:\n'
      + '            attack(e)\n'
      + '    attack(weakest(enemies))\n',
    );
    expect(d.warnings).toBeUndefined();
  });
});

// ================================= สัญญาที่ต้องไม่หลุด + ข้อจำกัดที่รู้ตัว
describe('contract corners worth pinning down', () => {
  it('FALLBACK_ACTION in spec.ts is what the evaluator actually does', () => {
    expect(FALLBACK_ACTION).toBe('attack(weakest(enemies))');
    const explicit = run(`def turn():\n    ${FALLBACK_ACTION}\n`);
    const implicit = run('def turn():\n    pass\n');
    expect(implicit.action).toBe(explicit.action);
    expect(implicit.targetId).toBe(explicit.targetId);
    expect(implicit.usedFallback).toBe(true);
    expect(explicit.usedFallback).toBe(false);
  });

  it('assigning over a game global is refused', () => {
    const e = validate(ok('def turn():\n    enemies = weakest(enemies)\n    wait()\n'), opts()).errors[0];
    expect(e.name).toBe('SyntaxError');
    expect(e.messageTh).toContain('ตัวแปรของเกม');
  });

  it('an action call cannot be used as a value', () => {
    const e = validate(ok('def turn():\n    if count(enemies) > 1:\n        attack(defend())\n'), opts()).errors[0];
    expect(e.name).toBe('TypeError');
    expect(e.messageTh).toContain('ใช้เป็นค่าในนิพจน์ไม่ได้');
  });

  it('variable types are inferred, so attack(list_variable) is caught statically', () => {
    const e = validate(ok('def turn():\n    t = enemies\n    attack(t)\n'), opts()).errors[0];
    expect(e.name).toBe('TypeError');
    expect(e.messageTh).toContain('ต้องการตัวละคร');
    expect(validate(ok('def turn():\n    t = weakest(enemies)\n    attack(t)\n'), opts()).errors)
      .toEqual([]);
    // t = me ต้องยังใช้คุณสมบัติเต็มชุดของ me ได้ (ไม่ฟ้องผิด)
    expect(validate(ok('def turn():\n    t = me\n    if t.matk > 1:\n        wait()\n'), opts()).errors)
      .toEqual([]);
    // กำหนดคนละชนิดคนละสาขา → ถอยเป็น "ไม่รู้ชนิด" แทนที่จะฟ้องมั่ว
    expect(validate(ok(
      'def turn():\n    if turn_no > 1:\n        t = me\n    else:\n        t = 5\n    attack(weakest(enemies))\n',
    ), opts()).errors).toEqual([]);
  });

  it('a variable used before it is set is a NameError, not a crash', () => {
    const e = validate(ok('def turn():\n    attack(t)\n    t = me\n'), opts()).errors[0];
    expect(e.name).toBe('NameError');
    expect(run('def turn():\n    attack(t)\n    t = me\n').usedFallback).toBe(true);
  });

  it('me.def ถูกปฏิเสธ เพราะ def เป็นคำสงวนของ Python (กฎเหล็ก: ต้องเป็น Python จริงเสมอ)', () => {
    // PM แก้สเปกเมื่อ 9 ก.ย. 2026: ME_ATTRS เปลี่ยนจาก 'def' เป็น 'defense'/'magic_defense'
    // เพราะ CPython แปล `me.def` ไม่ผ่าน — ห้ามมีโครงสร้างที่ล่ามเรารับแต่ Python ไม่รับ
    //
    // แก้ 18 ก.ย. 2026: เดิมเทสต์นี้ยอมรับ NameError ตอน validate ซึ่งคือตัวบั๊กเอง —
    // CPython ฟ้อง SyntaxError ตั้งแต่ compile จึงต้องตกตั้งแต่ parse และต้องบอกชื่อที่ถูกด้วย
    const e = firstError('def turn():\n    if me.def > 3:\n        wait()\n');
    expect(e.name).toBe('SyntaxError');
    expect(e.messageTh).toContain('คำสงวน');
    expect(e.messageTh).toContain('defense');
    expect([e.line, e.col]).toEqual([2, 11]);

    // ชื่อใหม่ต้องใช้ได้ทั้งคู่
    expect(validate(ok('def turn():\n    if me.defense > 3:\n        wait()\n'), opts()).errors).toEqual([]);
    expect(
      validate(ok('def turn():\n    if me.magic_defense > 3:\n        wait()\n'), opts()).errors,
    ).toEqual([]);
    expect(run('def turn():\n    if me.defense > 3:\n        defend()\n').action).toBe('defend');
  });

  it('KNOWN LIMITATION: only the header comment survives formatting', () => {
    const src = '# หัวเรื่อง\ndef turn():\n    # คอมเมนต์ในตัว\n    wait()\n';
    expect(toPython(ok(src))).toBe('# หัวเรื่อง\ndef turn():\n    wait()\n');
  });
});

// ================================================================ fromRules
describe('fromRules — migrating Gambit rules to BloxCode', () => {
  it('produces source that parses and validates', () => {
    for (const key of ['warrior', 'mage', 'guardian'] as const) {
      const rules = gamedata.defaultRules[key];
      const program = fromRules(rules);
      const src = toPython(program);
      expect(parse(src).errors, `${key}:\n${src}`).toEqual([]);
      const skills = gamedata.skills.filter((s) => s.classId === key).map((s) => s.id);
      const res = validate(program, opts({ availableSkills: skills }));
      expect(res.errors, `${key}:\n${src}`).toEqual([]);
    }
  });

  it('maps conditions, targets and actions one-for-one', () => {
    const rules: Rule[] = [
      { condition: { type: 'self_hp_below', value: 30 }, action: { type: 'skill', skillId: 'm_heal', target: 'self' } },
      { condition: { type: 'enemy_count_gte', value: 3 }, action: { type: 'skill', skillId: 'm_blizzard', target: 'random_enemy' } },
      { condition: { type: 'turn_gte', value: 4 }, action: { type: 'defend', target: 'self' } },
      { condition: { type: 'always' }, action: { type: 'attack', target: 'lowest_hp_enemy' } },
    ];
    expect(toPython(fromRules(rules))).toBe(
      'def turn():\n'
      + '    if me.hp_pct < 30:\n'
      + '        cast("heal", me)\n'
      + '    elif count(enemies) >= 3:\n'
      + '        cast("blizzard", enemies)\n'
      + '    elif turn_no >= 4:\n'
      + '        defend()\n'
      + '    else:\n'
      + '        attack(weakest(enemies))\n',
    );
  });

  it('useElif: false keeps the program inside floor-1 syntax (nested if/else)', () => {
    const rules: Rule[] = [
      { condition: { type: 'self_hp_below', value: 30 }, action: { type: 'defend', target: 'self' } },
      { condition: { type: 'turn_gte', value: 2 }, action: { type: 'attack', target: 'random_enemy' } },
      { condition: { type: 'always' }, action: { type: 'attack', target: 'lowest_hp_enemy' } },
    ];
    const src = toPython(fromRules(rules, { useElif: false }));
    expect(src).not.toContain('elif');
    const res = validate(ok(src), opts({ features: unlockedFeatures(1) }));
    expect(res.errors).toEqual([]);
  });

  it('drops rules that can never fire (after an always rule) and skill rules with no skill id', () => {
    const rules: Rule[] = [
      { condition: { type: 'always' }, action: { type: 'attack', target: 'random_enemy' } },
      { condition: { type: 'self_hp_below', value: 10 }, action: { type: 'defend', target: 'self' } },
    ];
    expect(toPython(fromRules(rules))).toBe('def turn():\n    attack(random_of(enemies))\n');
    expect(toPython(fromRules(gamedata.defaultRules.monsterDefault)))
      .toBe('def turn():\n    attack(random_of(enemies))\n');
  });

  it('falls back to a working program when there is nothing to convert', () => {
    expect(toPython(fromRules([]))).toBe('def turn():\n    attack(weakest(enemies))\n');
  });
});

// =============================================================== monster AI
describe('monster AI runs on BloxCode', () => {
  it('every monsterPrograms entry parses and validates', () => {
    for (const [key, src] of Object.entries(gamedata.monsterPrograms)) {
      const p = parse(src);
      expect(p.errors, `monsterPrograms.${key}`).toEqual([]);
      const res = validate(p.program!, opts({ availableSkills: ALL_SKILLS }));
      expect(res.errors, `monsterPrograms.${key}`).toEqual([]);
    }
  });

  it('there is a program for every archetype role plus a default', () => {
    const roles = new Set(gamedata.monsterArchetypes.map((a) => a.role));
    for (const role of roles) expect(gamedata.monsterPrograms[role], role).toBeTruthy();
    expect(gamedata.monsterPrograms.default).toBeTruthy();
    for (const a of gamedata.monsterArchetypes) {
      expect(monsterProgramFor(a.id), a.id).toBeTruthy();
    }
    expect(monsterProgramFor('does_not_exist')).toBeTruthy(); // ตกไปใช้ default
  });

  it('casters use dark_bolt while everyone else bites — matching skills[0]', () => {
    for (const a of gamedata.monsterArchetypes) {
      const src = toPython(monsterProgramFor(a.id)!);
      const expected = a.skills[0] === 'mon_dark_bolt' ? 'dark_bolt' : 'bite';
      expect(src, a.id).toContain(`cast("${expected}"`);
    }
  });
});

// ====================================================== battle integration
function makeHero(classId: ClassId, level: number, extra: Record<string, unknown> = {}): Combatant {
  const stats = { ...gamedata.classes[classId].baseStats, str: 40, vit: 30 };
  const skills = gamedata.skills
    .filter((s) => s.classId === classId && s.unlockLevel <= level)
    .map((s) => s.id);
  return {
    id: `hero_${classId}`,
    name: `Hero ${classId}`,
    side: 'party',
    classId,
    level,
    stats,
    derived: buildDerivedStats(classId, level, stats, []),
    skills,
    rules: gamedata.defaultRules[classId],
    ...extra,
  } as Combatant;
}

describe('battle integration', () => {
  it('a party member driven by BloxCode overrides the rule list', () => {
    const hero = makeHero('warrior', 20, { programSource: 'def turn():\n    defend()\n' });
    const r = runBattle([hero], 1, 4242);
    const mine = r.events.filter((e) => e.actorId === hero.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.action === 'defend')).toBe(true);
    expect(mine.every((e) => e.line === 2)).toBe(true);
  });

  it('emits the deciding line and code warnings onto CombatEvent', () => {
    const hero = makeHero('warrior', 20, {
      programSource: 'def turn():\n    cast("execute", weakest(enemies))\n    attack(weakest(enemies))\n',
      skills: ['w_power_strike'], // ไม่มี execute → ต้องถูกข้ามและเตือน
    });
    const r = runBattle([hero], 1, 99);
    const mine = r.events.filter((e) => e.actorId === hero.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.action === 'attack' && e.line === 3)).toBe(true);
    expect(mine[0].codeWarnings![0]).toContain("ยังไม่มีบล็อกสกิล 'execute'");
  });

  it('a program that never acts still attacks (fallback, line 0)', () => {
    const hero = makeHero('warrior', 20, { programSource: 'def turn():\n    pass\n' });
    const r = runBattle([hero], 1, 5);
    const mine = r.events.filter((e) => e.actorId === hero.id);
    expect(mine.every((e) => e.action === 'attack' && e.line === 0)).toBe(true);
  });

  it('monsters now decide with BloxCode and every monster event carries a line', () => {
    const r = runBattle([makeHero('warrior', 20)], 2, 777);
    const monsterEvents = r.events.filter(
      (e) => e.actorId !== 'system' && !e.actorId.startsWith('hero_'),
    );
    expect(monsterEvents.length).toBeGreaterThan(0);
    expect(monsterEvents.every((e) => typeof e.line === 'number')).toBe(true);
    // ตัวละครที่ยังใช้ rules เดิมต้องไม่มี field ใหม่ติดมา
    const heroEvents = r.events.filter((e) => e.actorId.startsWith('hero_'));
    expect(heroEvents.every((e) => e.line === undefined)).toBe(true);
  });

  it('switching monsters to BloxCode changed no battle outcome (byte-identical)', () => {
    const cases: [ClassId, number, number][] = [
      ['warrior', 1, 1], ['mage', 1, 1], ['guardian', 1, 1],
      ['warrior', 20, 3], ['mage', 12, 4], ['guardian', 8, 2], ['warrior', 14, 7],
    ];
    const seeds = [1, 2, 3, 7919, 424242];
    const strip = (json: string) => {
      const v = JSON.parse(json);
      for (const e of v.events) { delete e.line; delete e.codeWarnings; }
      return JSON.stringify(v);
    };

    const withPrograms = cases.flatMap(([c, lv, floor]) =>
      seeds.map((s) => strip(JSON.stringify(runBattle([makeHero(c, lv)], floor, s)))));

    const saved = gamedata.monsterPrograms;
    (gamedata as { monsterPrograms: Record<string, string> }).monsterPrograms = {};
    clearMonsterProgramCache();
    const withRules = cases.flatMap(([c, lv, floor]) =>
      seeds.map((s) => JSON.stringify(runBattle([makeHero(c, lv)], floor, s))));
    (gamedata as { monsterPrograms: Record<string, string> }).monsterPrograms = saved;
    clearMonsterProgramCache();

    expect(withPrograms).toEqual(withRules);
  });

  it('same seed + same program → byte-identical BattleResult', () => {
    const src = 'def turn():\n'
      + '    if me.hp_pct < 40 and can_cast("power_strike"):\n'
      + '        cast("power_strike", strongest(enemies))\n'
      + '    elif count(enemies) >= 3:\n'
      + '        cast("whirlwind", enemies)\n'
      + '    else:\n'
      + '        attack(random_of(enemies))\n';
    const a = runBattle([makeHero('warrior', 20, { programSource: src })], 3, 20260909);
    const b = runBattle([makeHero('warrior', 20, { programSource: src })], 3, 20260909);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.events.some((e) => e.actorId.startsWith('hero_') && e.action === 'skill')).toBe(true);
  });
});

/**
 * printer ต้องคายโค้ดที่ parse กลับได้ "เสมอ" แม้ AST จะมาจากที่อื่นที่ไม่ใช่ parse
 *
 * ทำไมต้องมีเทสต์นี้: เอดิเตอร์บล็อกสร้าง/แก้ AST เองแล้วเรียก toPython() ทุกครั้ง
 * ถ้า printer คายโค้ดที่ parse ไม่ผ่านแม้แค่กรณีเดียว ผู้เล่นจะเห็นโปรแกรมตัวเองพัง
 * ทั้งที่ไม่ได้พิมพ์อะไรผิดเลย — บล็อกว่างเป็นกรณีที่เกิดง่ายที่สุด (ลบตัวสุดท้ายออก)
 *
 * PM ตรวจแล้วเมื่อ 19 ก.ย. 2026 ว่าถ้าถอด `pass` ออกจาก bodyToLines เทสต์ชุดนี้ fail จริง
 * (ก่อนมีเทสต์นี้ ไม่มีอะไรจับได้เลย — เทสต์ round-trip เดิมเริ่มจาก parse จึงไม่มีทางมี body ว่าง)
 */
describe('printer: บล็อกว่างต้องได้ pass', () => {
  const P = { line: 0, col: 0 };
  const attackStmt: Stmt = {
    kind: 'expr',
    value: {
      kind: 'call',
      func: 'attack',
      args: [{ kind: 'call', func: 'weakest', args: [{ kind: 'name', id: 'enemies', ...P }], ...P }],
      ...P,
    },
    ...P,
  };
  const cond = {
    kind: 'compare' as const,
    op: '<' as const,
    left: { kind: 'attr' as const, obj: { kind: 'name' as const, id: 'me', ...P }, attr: 'hp_pct', ...P },
    right: { kind: 'num' as const, value: 50, ...P },
    ...P,
  };

  const cases: [string, Program][] = [
    ['if ที่ body ว่าง', { turn: [{ kind: 'if', test: cond, body: [], orelse: [attackStmt], ...P }] }],
    ['else ที่ว่าง', { turn: [{ kind: 'if', test: cond, body: [attackStmt], orelse: [], ...P }] }],
    ['if ว่างทั้งสองกิ่ง', { turn: [{ kind: 'if', test: cond, body: [], orelse: [], ...P }] }],
    ['for ที่ body ว่าง', {
      turn: [{ kind: 'for', target: 'x', iter: { kind: 'name', id: 'enemies', ...P }, body: [], ...P }],
    }],
    ['if ซ้อนที่ body ว่าง', {
      turn: [{
        kind: 'if', test: cond,
        body: [{ kind: 'if', test: cond, body: [], orelse: [], ...P }],
        orelse: [], ...P,
      }],
    }],
  ];

  for (const [name, program] of cases) {
    it(`${name} → parse กลับได้`, () => {
      const src = toPython(program);
      const back = parse(src);
      expect(back.errors, `${name}: ${src}`).toEqual([]);
      expect(back.program).not.toBeNull();
      // idempotent ด้วย: พิมพ์ผลที่ parse กลับมาแล้วต้องได้ข้อความเดิมเป๊ะ
      expect(toPython(back.program!)).toBe(src);
    });
  }
});
