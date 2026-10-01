/**
 * Differential test — ล่ามของเรา vs CPython จริง
 *
 * สุ่มสร้างโปรแกรม BloxCode ที่ถูกไวยากรณ์หลายร้อยตัวให้ครอบคลุมทุกฟีเจอร์
 * (if/elif/else · and/or/not · ตัวแปร · for · เลขคณิต · ฟังก์ชันทั้งหมด)
 * แล้วรันด้วย
 *   1. evaluator ของเรา (TypeScript)
 *   2. python3 จริง โดยมี test/pyshim/api.py จำลอง me/enemies/allies/attack()... ให้เหมือนกัน
 * การตัดสินใจ (action + skillId + targetId + line + usedFallback) ต้องตรงกันทุกเคส
 *
 * ไม่ตรง = ล่ามเราผิด ต้องแก้ (docs/bloxcode-language.md §7)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gamedata } from '../src/data';
import { mulberry32 } from '../src/rng';
import { parse } from '../src/lang/parser';
import { runTurn, type RuntimeUnit, type TurnContext } from '../src/lang/evaluator';
import { KNOWN_SKILL_NAMES, preferredSkillName, resolveSkillName } from '../src/lang/skills';
import { validate } from '../src/lang/validate';
import { FEATURE_UNLOCK, type Feature, type TurnDecision } from '../src/lang/spec';

const ALL_FEATURES = new Set(Object.keys(FEATURE_UNLOCK) as Feature[]);

const PYSHIM = join(__dirname, 'pyshim');
/** ปรับได้ด้วย env เพื่อรัน stress ยาว ๆ ตอนสงสัยว่าล่ามเพี้ยน (ค่าปริยายพอสำหรับ CI) */
const CASE_COUNT = Number(process.env.BLOXCODE_DIFF_CASES ?? 240);
const SEED = Number(process.env.BLOXCODE_DIFF_SEED ?? 0x51ceb10c);

function pythonAvailable(): boolean {
  try {
    execFileSync('python3', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- generator
type Rand = () => number;

const pickOne = <T,>(r: Rand, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
const intIn = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** attribute ที่ใช้ได้กับหน่วยทั่วไป (ครบตาม spec — ทุกตัวเป็น Python ที่ถูกต้อง) */
const UNIT_ATTRS_SAFE = ['hp', 'hp_pct', 'level', 'atk', 'speed'] as const;
const ME_ATTRS_SAFE = [
  'hp', 'mp', 'hp_pct', 'mp_pct', 'level', 'atk', 'matk',
  'defense', 'magic_defense', 'speed',
] as const;

const ALL_SKILL_SHORT = gamedata.skills.map((s) => preferredSkillName(s.id));
const AOE_SKILL_SHORT = gamedata.skills.filter((s) => s.aoe).map((s) => preferredSkillName(s.id));
const BOGUS_NAMES = ['megaflare', 'poison_sting', 'fireball', 'hea1'];
const BUFF_NAMES = ['taunt', 'shield', 'rage', 'poison'];

interface GenState {
  availableShort: string[];
  unitVars: string[];
  numVars: string[];
  varSeq: number;
}

/** ยาวได้ไม่เกินนี้ เพื่อไม่ให้ชน MAX_PROGRAM_LINES และไม่กินงบโหนดต่อเทิร์นจนหมด */
const MAX_GEN_LINES = 16;

class ProgramGen {
  private readonly lines: string[] = [];
  private readonly st: GenState;

  constructor(private readonly r: Rand, availableShort: string[]) {
    this.st = { availableShort, unitVars: [], numVars: [], varSeq: 0 };
  }

  /**
   * ตัวแปรที่ประกาศในบล็อกย่อยจะหายไปเมื่อออกจากบล็อก
   * (เข้มกว่า Python เล็กน้อย แต่การันตีว่าไม่มีทางอ้างตัวแปรที่ยังไม่มีค่า)
   */
  private scoped(fn: () => void): void {
    const u = this.st.unitVars.length;
    const n = this.st.numVars.length;
    fn();
    this.st.unitVars.length = u;
    this.st.numVars.length = n;
  }

  private get full(): boolean {
    return this.lines.length >= MAX_GEN_LINES;
  }

  private list(): string {
    return this.r() < 0.7 ? 'enemies' : 'allies';
  }

  private unit(depth: number): string {
    const opts: (() => string)[] = [
      () => 'me',
      () => `weakest(${this.list()})`,
      () => `strongest(${this.list()})`,
      () => `deadliest(${this.list()})`,
      () => `fastest(${this.list()})`,
      () => `random_of(${this.list()})`,
    ];
    if (this.st.unitVars.length && depth > 0) {
      opts.push(() => pickOne(this.r, this.st.unitVars));
    }
    return pickOne(this.r, opts)();
  }

  private num(depth: number): string {
    const leaves: (() => string)[] = [
      () => String(intIn(this.r, 0, 100)),
      () => 'turn_no',
      () => `count(${this.list()})`,
      () => `len(${this.list()})`,
      () => {
        const u = this.unit(depth);
        const attrs = u === 'me' ? ME_ATTRS_SAFE : UNIT_ATTRS_SAFE;
        return `${u}.${pickOne(this.r, attrs)}`;
      },
    ];
    if (this.st.numVars.length) leaves.push(() => pickOne(this.r, this.st.numVars));
    if (depth >= 2 || this.r() < 0.55) return pickOne(this.r, leaves)();
    const op = pickOne(this.r, ['+', '-', '*', '/'] as const);
    if (op === '/') {
      // หารด้วยตัวเลขที่ไม่ใช่ศูนย์เท่านั้น — Python จะโยน ZeroDivisionError
      return `${this.num(depth + 1)} / ${pickOne(this.r, [2, 3, 4, 5, 10, 100])}`;
    }
    return `${this.num(depth + 1)} ${op} ${this.num(depth + 1)}`;
  }

  private bool(depth: number): string {
    if (depth < 2 && this.r() < 0.3) {
      const op = this.r() < 0.5 ? 'and' : 'or';
      return `${this.bool(depth + 1)} ${op} ${this.bool(depth + 1)}`;
    }
    if (depth < 2 && this.r() < 0.12) return `not (${this.bool(depth + 1)})`;
    const roll = this.r();
    if (roll < 0.1) return `has_buff("${pickOne(this.r, BUFF_NAMES)}")`;
    if (roll < 0.16) return `has_debuff("${pickOne(this.r, BUFF_NAMES)}")`;
    if (roll < 0.28) return `can_cast("${this.skillName()}")`;
    const op = pickOne(this.r, ['<', '<=', '>', '>=', '==', '!='] as const);
    return `${this.num(depth + 1)} ${op} ${this.num(depth + 1)}`;
  }

  private skillName(): string {
    const roll = this.r();
    if (roll < 0.7 && this.st.availableShort.length) {
      return pickOne(this.r, this.st.availableShort);
    }
    if (roll < 0.9) return pickOne(this.r, ALL_SKILL_SHORT);
    return pickOne(this.r, BOGUS_NAMES);
  }

  private action(): string {
    const roll = this.r();
    if (roll < 0.42) return `attack(${this.unit(1)})`;
    if (roll < 0.72) return `cast("${this.skillName()}", ${this.unit(1)})`;
    if (roll < 0.82) {
      // เล็งลิสต์ — ถูกเมื่อเป็นสกิล AoE, ถ้าไม่ใช่ทั้งสองฝั่งต้องข้ามเหมือนกัน
      const name = this.r() < 0.7 ? pickOne(this.r, AOE_SKILL_SHORT) : this.skillName();
      return `cast("${name}", enemies)`;
    }
    if (roll < 0.92) return 'defend()';
    return 'wait()';
  }

  private stmt(indent: string, depth: number): void {
    const roll = this.r();
    if (!this.full && depth < 2 && roll < 0.3) return this.ifChain(indent, depth);
    if (!this.full && depth < 2 && roll < 0.4) return this.forLoop(indent, depth);
    if (roll < 0.52) {
      const isUnit = this.r() < 0.5;
      const nm = `${isUnit ? 't' : 'n'}${++this.st.varSeq}`;
      this.lines.push(`${indent}${nm} = ${isUnit ? this.unit(1) : this.num(1)}`);
      (isUnit ? this.st.unitVars : this.st.numVars).push(nm);
      return;
    }
    if (roll < 0.55) {
      this.lines.push(`${indent}pass`);
      return;
    }
    this.lines.push(`${indent}${this.action()}`);
  }

  private body(indent: string, depth: number): void {
    this.scoped(() => {
      const n = this.full ? 1 : intIn(this.r, 1, 2);
      for (let i = 0; i < n; i++) this.stmt(`${indent}    `, depth + 1);
    });
  }

  private ifChain(indent: string, depth: number): void {
    this.lines.push(`${indent}if ${this.bool(0)}:`);
    this.body(indent, depth);
    if (this.r() < 0.4) {
      this.lines.push(`${indent}elif ${this.bool(0)}:`);
      this.body(indent, depth);
    }
    if (this.r() < 0.6) {
      this.lines.push(`${indent}else:`);
      this.body(indent, depth);
    }
  }

  private forLoop(indent: string, depth: number): void {
    const nm = `e${++this.st.varSeq}`;
    this.lines.push(`${indent}for ${nm} in ${this.list()}:`);
    this.scoped(() => {
      this.st.unitVars.push(nm);
      this.stmt(`${indent}    `, depth + 1);
    });
  }

  build(): string {
    const header = this.r() < 0.25 ? '# กลยุทธ์ที่สุ่มมาเพื่อทดสอบ\n' : '';
    const n = intIn(this.r, 1, 3);
    for (let i = 0; i < n; i++) this.stmt('    ', 0);
    if (this.lines.length === 0) this.lines.push('    wait()');
    return `${header}def turn():\n${this.lines.join('\n')}\n`;
  }
}

// ------------------------------------------------- คำสงวนในตำแหน่งของชื่อ
/**
 * รายการคำสงวนมาจาก keyword.kwlist ของ CPython ตัวที่กำลังรันอยู่ — ไม่เขียนเองและ
 * ไม่ import จาก tokenizer.ts ทั้งคู่เป็นกับดัก:
 *   · import จากโค้ดที่ทดสอบ → ลบคำออกจากโค้ด เทสต์ก็เลิกทดสอบคำนั้นตามไปด้วย
 *   · เขียนรายการเองในเทสต์   → คำที่ลืมใส่ไม่มีใครทดสอบ (แบบที่ as/from/await หลุดมาได้)
 * ถามเจ้าของภาษาโดยตรงจึงเป็นทางเดียวที่รายการจะครบเสมอ แม้ Python รุ่นใหม่เพิ่มคำสงวน
 */
function pythonKeywords(): { hard: string[]; soft: string[] } {
  const raw = execFileSync('python3', [join(PYSHIM, 'run.py'), '--keywords'], { encoding: 'utf8' });
  return JSON.parse(raw) as { hard: string[]; soft: string[] };
}

/**
 * คำสงวนที่เป็นไวยากรณ์ของ BloxCode เองด้วย — ที่เหลือใน kwlist คือฟีเจอร์ที่ภาษาเราไม่มีเลย
 * (ใช้สองอย่าง: เป็นคำที่ไม่ต้องฉีดทับ และเป็นเส้นแบ่งว่าการปฏิเสธแบบไหนคือ "ตั้งใจ")
 */
const BASE_SYNTAX_WORDS = ['def', 'if', 'elif', 'else', 'for', 'in', 'and', 'or', 'not', 'pass'];

/** ตำแหน่งที่ "ชื่อ" ปรากฏได้ในไวยากรณ์ของเรา — ต้องทดสอบให้ครบทุกแบบ */
type SlotRole = 'attr' | 'func' | 'funcdef' | 'loopvar' | 'var' | 'operand';
const ALL_SLOT_ROLES: SlotRole[] = ['attr', 'func', 'funcdef', 'loopvar', 'var', 'operand'];

interface NameSlot { start: number; end: number; role: SlotRole }

/**
 * แทนเนื้อในสตริงและคอมเมนต์ด้วยช่องว่าง (ความยาวเท่าเดิม ตำแหน่งจึงยังตรง)
 * ไม่งั้นชื่อสกิลใน cast("heal", ...) จะถูกนับเป็นตำแหน่งของชื่อ ทั้งที่สองฝั่งรับเหมือนกันอยู่แล้ว
 */
function maskLiterals(src: string): string {
  const out = src.split('');
  let quote: string | null = null;
  let comment = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\n') { quote = null; comment = false; continue; }
    if (comment) { out[i] = ' '; continue; }
    if (quote) {
      out[i] = ' ';
      if (ch === quote) { quote = null; out[i] = ' '; }
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out[i] = ' '; continue; }
    if (ch === '#') { comment = true; out[i] = ' '; }
  }
  return out.join('');
}

/** หาทุกตำแหน่งที่เป็น "ชื่อ" ในโปรแกรม พร้อมบอกว่าเป็นชื่อแบบไหน */
function nameSlots(src: string): NameSlot[] {
  const masked = maskLiterals(src);
  const slots: NameSlot[] = [];
  for (const m of masked.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const word = m[0];
    // ข้ามคำที่เป็นไวยากรณ์ของโปรแกรมตั้งต้นอยู่แล้ว (if / for / in / and / ...)
    // แทนที่คำพวกนี้คือการทำโครงสร้างพัง ไม่ใช่ "คำสงวนในตำแหน่งของชื่อ" ซึ่งเป็นสิ่งที่ทดสอบอยู่
    if (BASE_SYNTAX_WORDS.includes(word)) continue;
    const start = m.index;
    const end = start + word.length;
    const before = masked.slice(0, start);
    const after = masked.slice(end);
    let role: SlotRole;
    if (before.endsWith('.')) role = 'attr';
    else if (/\bdef\s+$/.test(before)) role = 'funcdef';
    else if (/\bfor\s+$/.test(before)) role = 'loopvar';
    else if (/^\(/.test(after)) role = 'func';
    else if (/^\s*=[^=]/.test(after)) role = 'var';
    else role = 'operand';
    slots.push({ start, end, role });
  }
  return slots;
}

const injectAt = (src: string, slot: NameSlot, kw: string): string =>
  src.slice(0, slot.start) + kw + src.slice(slot.end);

/**
 * โครงสร้างที่ CPython รับแต่ BloxCode ไม่รองรับมาตั้งแต่ต้น และไม่เกี่ยวกับการตรวจคำสงวน
 *
 * `not()` / `not("a", x)` ใน Python คือ not ของ tuple (วงเล็บหลัง not ไม่ใช่การเรียกฟังก์ชัน)
 * ภาษาเราไม่มี tuple เลย จึงปฏิเสธพร้อมบอกเหตุผล — ข้อยกเว้นนี้เขียนแคบที่สุดเท่าที่ทำได้
 * คือต้องเป็นวงเล็บที่ว่างหรือมีคอมมาระดับบนสุดจริง ๆ ไม่ใช่ยกเว้นทุกอย่างที่มีคำว่า not
 */
function usesTupleAfterNot(src: string): boolean {
  const masked = maskLiterals(src);
  for (const m of masked.matchAll(/\bnot\s*\(/g)) {
    let depth = 0;
    let hasTopLevelComma = false;
    let body = '';
    for (let i = m.index + m[0].length - 1; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === '(') { depth++; if (depth === 1) continue; }
      if (ch === ')') { depth--; if (depth === 0) break; }
      if (ch === ',' && depth === 1) hasTopLevelComma = true;
      body += ch;
    }
    if (hasTopLevelComma || body.trim() === '') return true;
  }
  return false;
}

// ------------------------------------------------------------------- state
type UnitJson = RuntimeUnit;

function makeUnit(r: Rand, id: string): UnitJson {
  const maxHp = intIn(r, 40, 400);
  const maxMp = intIn(r, 10, 90);
  return {
    id,
    hp: intIn(r, 1, maxHp),
    maxHp,
    mp: intIn(r, 0, maxMp),
    maxMp,
    level: intIn(r, 1, 30),
    atk: intIn(r, 5, 90),
    matk: intIn(r, 5, 90),
    def: intIn(r, 0, 40),
    // ต้องมี mdef ด้วย ไม่งั้น me.magic_defense ฝั่งเราเป็น undefined -> NaN
    // ขณะที่ shim ฝั่ง Python มองเป็น 0 แล้วผลจะเพี้ยน (differential test จับได้จริงเมื่อ 9 ก.ย.)
    mdef: intIn(r, 0, 30),
    speed: intIn(r, 8, 60) + (r() < 0.5 ? 0.5 : 0),
  };
}

interface CaseState {
  me: UnitJson;
  enemies: UnitJson[];
  allies: UnitJson[];
  turn_no: number;
  availableSkills: string[];
  skills: Record<string, { id: string; mpCost: number; aoe: boolean }>;
  buffs: string[];
  debuffs: string[];
  randoms: number[];
}

/** ตารางชื่อสกิล → ข้อมูล ให้ shim ตัดสินใจเหมือน resolveSkillName ฝั่ง TS เป๊ะ */
const SKILL_TABLE: CaseState['skills'] = {};
for (const n of KNOWN_SKILL_NAMES) {
  const info = resolveSkillName(n)!;
  SKILL_TABLE[n] = { id: info.id, mpCost: info.mpCost, aoe: info.aoe };
}

function makeState(r: Rand): CaseState {
  const me = makeUnit(r, 'hero');
  const enemies = Array.from({ length: intIn(r, 1, 4) }, (_, i) => makeUnit(r, `mob${i}`));
  const allies: UnitJson[] = [me];
  const extra = intIn(r, 0, 2);
  for (let i = 0; i < extra; i++) allies.push(makeUnit(r, `pal${i}`));
  const pool = gamedata.skills.map((s) => s.id);
  const availableSkills = pool.filter(() => r() < 0.45);
  if (availableSkills.length === 0) availableSkills.push(pool[Math.floor(r() * pool.length)]);
  return {
    me,
    enemies,
    allies,
    turn_no: intIn(r, 1, 12),
    availableSkills,
    skills: SKILL_TABLE,
    buffs: BUFF_NAMES.filter(() => r() < 0.3),
    debuffs: BUFF_NAMES.filter(() => r() < 0.3),
    randoms: Array.from({ length: 24 }, () => r()),
  };
}

function ctxFor(state: CaseState): TurnContext {
  let i = 0;
  return {
    me: state.me,
    enemies: state.enemies,
    allies: state.allies,
    turn_no: state.turn_no,
    rng: () => state.randoms[i++ % state.randoms.length],
    availableSkills: state.availableSkills,
    buffs: state.buffs,
    debuffs: state.debuffs,
  };
}

interface PyDecision {
  action: string;
  skillId?: string;
  targetId?: string;
  line: number;
  usedFallback: boolean;
  warnings: string[];
  randomsUsed: number;
}

const shape = (d: TurnDecision | PyDecision) => ({
  action: d.action,
  skillId: d.skillId ?? null,
  targetId: d.targetId ?? null,
  line: d.line,
  usedFallback: d.usedFallback,
});

// -------------------------------------------------------------------- test
describe('differential: BloxCode evaluator vs CPython', () => {
  const havePython = pythonAvailable();
  if (!havePython) {
    console.warn(
      '[differential] ข้าม: ไม่พบ python3 ในเครื่องนี้ — differential test ต้องมี CPython จริง'
      + ' (ติดตั้ง python3 แล้วรัน npm test ใหม่)',
    );
  }

  it.runIf(havePython)(
    `${CASE_COUNT} random programs decide identically in CPython`,
    () => {
      const r = mulberry32(SEED);
      const cases: { name: string; source: string; state: CaseState }[] = [];
      const ours: TurnDecision[] = [];

      while (cases.length < CASE_COUNT) {
        const state = makeState(r);
        const availableShort = state.availableSkills.map(preferredSkillName);
        const source = new ProgramGen(r, availableShort).build();

        const parsed = parse(source);
        expect(parsed.errors, `parser rejected generated program:\n${source}`).toEqual([]);
        expect(parsed.program).not.toBeNull();
        // โปรแกรมที่สุ่มมาต้องผ่าน validate ด้วย (ยกเว้นชื่อสกิลที่จงใจให้ไม่มีในมือ
        // ซึ่งเป็นเคสที่เราต้องการทดสอบ "ข้ามคำสั่ง ไม่เสียเทิร์น" ตอนรัน)
        const vErrors = validate(parsed.program!, {
          features: ALL_FEATURES,
          availableSkills: gamedata.skills.map((s) => s.id),
        }).errors.filter((e) => e.name !== 'ValueError' && e.name !== 'TypeError');
        expect(vErrors, `validate rejected generated program:\n${source}`).toEqual([]);

        const decision = runTurn(parsed.program!, ctxFor(state));
        // งบโหนดหมด = โปรแกรมที่ generator สร้างใหญ่เกินไป CPython ไม่มีงบแบบนี้
        // จึงเทียบกันไม่ได้ — ต้องไม่เกิดขึ้นเลย
        expect(
          (decision.warnings ?? []).some((w) => w.includes('งบประมวลผล')),
          `node budget exhausted by generated program:\n${source}`,
        ).toBe(false);

        cases.push({ name: `case${cases.length}`, source, state });
        ours.push(decision);
      }

      // ---- รันด้วย CPython จริงเป็นชุด ----
      const dir = mkdtempSync(join(tmpdir(), 'bloxcode-diff-'));
      const inPath = join(dir, 'cases.json');
      const outPath = join(dir, 'out.json');
      writeFileSync(inPath, JSON.stringify(cases), 'utf8');
      execFileSync('python3', [join(PYSHIM, 'run.py'), inPath, outPath], { stdio: 'pipe' });
      const theirs = JSON.parse(readFileSync(outPath, 'utf8')) as PyDecision[];

      expect(theirs).toHaveLength(cases.length);

      const mismatches: string[] = [];
      for (let i = 0; i < cases.length; i++) {
        const a = shape(ours[i]);
        const b = shape(theirs[i]);
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          mismatches.push(
            `#${i}\n${cases[i].source}ours   = ${JSON.stringify(a)}\n`
            + `python = ${JSON.stringify(b)}\nstate  = ${JSON.stringify(cases[i].state)}\n`,
          );
        }
      }
      expect(mismatches.slice(0, 3).join('\n---\n'), `${mismatches.length} mismatches`).toBe('');

      // ต้องกินเลขสุ่มเท่ากันด้วย ไม่งั้น replay ของการต่อสู้จะเพี้ยนแม้ผลเทิร์นนี้ตรงกัน
      const rngMismatch = cases.filter((_, i) => {
        const state = cases[i].state;
        let used = 0;
        const ctx = { ...ctxFor(state), rng: () => { used++; return state.randoms[(used - 1) % state.randoms.length]; } };
        runTurn(parse(cases[i].source).program!, ctx);
        return used !== theirs[i].randomsUsed;
      });
      expect(rngMismatch.map((c) => c.source).slice(0, 2).join('\n')).toBe('');
    },
    120_000,
  );

  it.runIf(havePython)('covers every feature of the language at least once', () => {
    const r = mulberry32(SEED);
    const seen = new Set<string>();
    for (let i = 0; i < CASE_COUNT; i++) {
      const state = makeState(r);
      const src = new ProgramGen(r, state.availableSkills.map(preferredSkillName)).build();
      for (const [feat, re] of [
        ['if', /\bif /], ['elif', /\belif /], ['else', /\belse:/], ['for', /\bfor /],
        ['and', /\band\b/], ['or', /\bor\b/], ['not', /\bnot /], ['assign', /^\s+[tn]\d+ = /m],
        ['arith', /[-+*/] /], ['attack', /attack\(/], ['cast', /cast\(/], ['defend', /defend\(/],
        ['wait', /wait\(/], ['weakest', /weakest\(/], ['strongest', /strongest\(/],
        ['deadliest', /deadliest\(/],
        ['fastest', /fastest\(/], ['random_of', /random_of\(/], ['count', /count\(/],
        ['len', /len\(/], ['has_buff', /has_buff\(/], ['has_debuff', /has_debuff\(/],
        ['can_cast', /can_cast\(/], ['aoe', /cast\("[a-z_]+", enemies\)/], ['pass', /^\s+pass$/m],
      ] as const) {
        if (re.test(src)) seen.add(feat);
      }
    }
    const missing = [
      'if', 'elif', 'else', 'for', 'and', 'or', 'not', 'assign', 'arith', 'attack', 'cast',
      'defend', 'wait', 'weakest', 'strongest', 'deadliest', 'fastest', 'random_of', 'count', 'len',
      'has_buff', 'has_debuff', 'can_cast', 'aoe', 'pass',
    ].filter((f) => !seen.has(f));
    expect(missing).toEqual([]);
  });

  /**
   * ตรึงการเชื่อมต่อของ me.<attr> ทีละตัวแบบ deterministic
   *
   * ทำไมต้องมี: การสุ่มโปรแกรมจับบั๊กระดับ attribute ได้บาง — ตอนทดสอบเมื่อ 9 ก.ย.
   * ผมจงใจสลับ magic_defense ให้ชี้ผิด แล้วต้องใช้ถึง 6,000 เคสกว่าจะเจอ 2 mismatch
   * (94 ครั้งที่ถูกสุ่มใช้ มีแค่ ~2% ที่พลิกผลการตัดสินใจ) ของแบบนี้หลุดขึ้น production ได้
   *
   * วิธีแก้: ให้ทุกสเตตัสมีค่า "ไม่ซ้ำกัน" แล้วเทียบกับเกณฑ์ที่คั่นตรงกลางพอดี
   * ถ้าต่อสายผิดแม้แต่ตัวเดียว ผลจะพลิกทันทีและ CPython จะไม่เห็นด้วย
   */
  it.runIf(havePython)('ตรึง me.<attr> ทุกตัวทีละตัวเทียบกับ CPython', () => {
    // ค่าไม่ซ้ำกันทุกช่อง → สลับสายเมื่อไรก็รู้ทันที
    const unit = {
      id: 'hero', hp: 11, maxHp: 100, mp: 22, maxMp: 100, level: 33,
      atk: 44, matk: 55, def: 66, mdef: 77, speed: 88,
    };
    // hp_pct = 11, mp_pct = 22 (เพราะ max = 100) — ก็ไม่ซ้ำกับตัวอื่นเช่นกัน
    const expected: Record<string, number> = {
      hp: 11, mp: 22, hp_pct: 11, mp_pct: 22, level: 33,
      atk: 44, matk: 55, defense: 66, magic_defense: 77, speed: 88,
    };

    const cases: { name: string; source: string; state: CaseState }[] = [];
    const ours: TurnDecision[] = [];
    for (const [attr, value] of Object.entries(expected)) {
      // เกณฑ์คร่อมค่าจริง: มากกว่า value-1 ต้องจริง, มากกว่า value+1 ต้องเท็จ
      for (const [threshold, label] of [[value - 1, 'above'], [value + 1, 'below']] as const) {
        const source = `def turn():\n    if me.${attr} > ${threshold}:\n        defend()\n    else:\n        wait()\n`;
        const parsed = parse(source);
        expect(parsed.errors, `parse failed for me.${attr}`).toEqual([]);
        const state: CaseState = {
          me: { ...unit },
          enemies: [{ ...unit, id: 'mob0' }],
          allies: [{ ...unit }],
          turn_no: 1,
          availableSkills: [],
          skills: {},
          buffs: [],
          debuffs: [],
          randoms: Array.from({ length: 8 }, (_, i) => (i + 1) / 9),
        };
        cases.push({ name: `${attr}-${label}`, source, state });
        ours.push(runTurn(parsed.program!, ctxFor(state)));
      }
    }

    const dir = mkdtempSync(join(tmpdir(), 'bloxcode-attr-'));
    const inPath = join(dir, 'cases.json');
    const outPath = join(dir, 'out.json');
    writeFileSync(inPath, JSON.stringify(cases), 'utf8');
    execFileSync('python3', [join(PYSHIM, 'run.py'), inPath, outPath], { stdio: 'pipe' });
    const theirs = JSON.parse(readFileSync(outPath, 'utf8')) as PyDecision[];

    const bad: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const a = shape(ours[i]);
      const b = shape(theirs[i]);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        bad.push(`${cases[i].name}: ours=${JSON.stringify(a)} python=${JSON.stringify(b)}`);
      }
      // และผลต้องเป็นไปตามที่คาดจริง ๆ ไม่ใช่แค่ "สองฝั่งผิดเหมือนกัน"
      const wantDefend = cases[i].name.endsWith('-above');
      if (a.action !== (wantDefend ? 'defend' : 'wait')) {
        bad.push(`${cases[i].name}: คาด ${wantDefend ? 'defend' : 'wait'} แต่ได้ ${a.action}`);
      }
    }
    expect(bad.join('\n')).toBe('');
  });
});

// =========================================================================
// คำสงวนในตำแหน่งของชื่อ — CPython ปฏิเสธที่ไหน เราต้องปฏิเสธที่นั่น
// =========================================================================
interface SyntaxVerdict { ok: boolean; error?: string; msg?: string; line?: number | null }

/** ถาม CPython ตัวจริงว่า compile ผ่านไหม (ไม่รัน) ผ่าน shim เดียวกับ differential test */
function cpythonSyntax(cases: { name: string; source: string }[]): SyntaxVerdict[] {
  const dir = mkdtempSync(join(tmpdir(), 'bloxcode-syntax-'));
  const inPath = join(dir, 'cases.json');
  const outPath = join(dir, 'out.json');
  writeFileSync(inPath, JSON.stringify(cases), 'utf8');
  execFileSync('python3', [join(PYSHIM, 'run.py'), '--syntax', inPath, outPath], { stdio: 'pipe' });
  return JSON.parse(readFileSync(outPath, 'utf8')) as SyntaxVerdict[];
}

interface KwCase {
  name: string;
  source: string;
  /** คำสงวนที่ถูกใส่ลงไป ('' = เคสควบคุมที่ไม่มีคำสงวนในตำแหน่งชื่อ) */
  kw: string;
  role: SlotRole | 'control';
}

/**
 * เคสที่เขียนมือ — ตรึงตำแหน่งที่ PM ระบุ บวกตำแหน่งที่สำรวจเจอเพิ่ม
 * มีเคสควบคุมที่ "ต้องผ่านทั้งสองฝั่ง" ปนอยู่ด้วย เพื่อจับการปฏิเสธเกินเหตุ
 * (เช่นถ้าใครทำให้ not(x) หรือ pass กลายเป็น SyntaxError เทสต์นี้ต้องแดง)
 */
const HAND_WRITTEN: KwCase[] = [
  // --- หลังจุด ---
  { name: 'attr-def', source: 'def turn():\n    if me.def > 5:\n        attack(weakest(enemies))\n', kw: 'def', role: 'attr' },
  { name: 'attr-if', source: 'def turn():\n    if me.if > 5:\n        wait()\n', kw: 'if', role: 'attr' },
  { name: 'attr-and', source: 'def turn():\n    t = weakest(enemies)\n    if t.and > 5:\n        wait()\n', kw: 'and', role: 'attr' },
  { name: 'attr-true', source: 'def turn():\n    if me.True > 5:\n        wait()\n', kw: 'True', role: 'attr' },
  { name: 'attr-chain-on-call', source: 'def turn():\n    if weakest(enemies).pass > 5:\n        wait()\n', kw: 'pass', role: 'attr' },
  { name: 'attr-nested', source: 'def turn():\n    if me.hp.else > 5:\n        wait()\n', kw: 'else', role: 'attr' },
  // --- เป้าของการกำหนดค่า ---
  { name: 'assign-if', source: 'def turn():\n    if = 5\n    wait()\n', kw: 'if', role: 'var' },
  { name: 'assign-and', source: 'def turn():\n    and = 3\n    wait()\n', kw: 'and', role: 'var' },
  { name: 'assign-not', source: 'def turn():\n    not = 3\n    wait()\n', kw: 'not', role: 'var' },
  { name: 'assign-def', source: 'def turn():\n    def = 3\n    wait()\n', kw: 'def', role: 'var' },
  { name: 'assign-true', source: 'def turn():\n    True = 1\n    wait()\n', kw: 'True', role: 'var' },
  { name: 'assign-none', source: 'def turn():\n    None = 1\n    wait()\n', kw: 'None', role: 'var' },
  // --- ตัวแปรของ for ---
  { name: 'for-if', source: 'def turn():\n    for if in enemies:\n        attack(if)\n', kw: 'if', role: 'loopvar' },
  { name: 'for-in', source: 'def turn():\n    for in in enemies:\n        wait()\n', kw: 'in', role: 'loopvar' },
  { name: 'for-true', source: 'def turn():\n    for True in enemies:\n        wait()\n', kw: 'True', role: 'loopvar' },
  { name: 'for-iter-pass', source: 'def turn():\n    for e in pass:\n        wait()\n', kw: 'pass', role: 'operand' },
  // --- ชื่อฟังก์ชันที่เรียก ---
  { name: 'call-not', source: 'def turn():\n    if not(me.hp > 5):\n        wait()\n', kw: 'not', role: 'func' },
  { name: 'call-pass', source: 'def turn():\n    pass(me)\n', kw: 'pass', role: 'func' },
  { name: 'call-else', source: 'def turn():\n    else(me)\n', kw: 'else', role: 'func' },
  { name: 'call-def', source: 'def turn():\n    def(me)\n', kw: 'def', role: 'func' },
  { name: 'call-and', source: 'def turn():\n    and(me)\n', kw: 'and', role: 'func' },
  // --- ชื่อฟังก์ชันที่ประกาศ ---
  { name: 'def-name-if', source: 'def if():\n    wait()\n', kw: 'if', role: 'funcdef' },
  { name: 'def-name-true', source: 'def True():\n    wait()\n', kw: 'True', role: 'funcdef' },
  // --- เป็นค่าเฉย ๆ ---
  { name: 'arg-pass', source: 'def turn():\n    attack(pass)\n', kw: 'pass', role: 'operand' },
  { name: 'arg-elif', source: 'def turn():\n    attack(elif)\n', kw: 'elif', role: 'operand' },
  { name: 'arg-for', source: 'def turn():\n    cast("heal", for)\n', kw: 'for', role: 'operand' },
  { name: 'operand-or', source: 'def turn():\n    if me.hp + or > 5:\n        wait()\n', kw: 'or', role: 'operand' },
  { name: 'operand-else', source: 'def turn():\n    if -else > 5:\n        wait()\n', kw: 'else', role: 'operand' },
  { name: 'operand-paren', source: 'def turn():\n    attack((in))\n', kw: 'in', role: 'operand' },
  { name: 'operand-not-rhs', source: 'def turn():\n    if not elif:\n        wait()\n', kw: 'elif', role: 'operand' },
  { name: 'assign-value-def', source: 'def turn():\n    t = def\n    wait()\n', kw: 'def', role: 'operand' },
  // --- เคสควบคุม: ทั้งสองฝั่งต้องรับ ---
  { name: 'control-plain', source: 'def turn():\n    attack(weakest(enemies))\n', kw: '', role: 'control' },
  { name: 'control-not-call', source: 'def turn():\n    if not (me.hp_pct < 50):\n        defend()\n', kw: '', role: 'control' },
  { name: 'control-not-tight', source: 'def turn():\n    if not(me.hp_pct < 50):\n        defend()\n', kw: '', role: 'control' },
  { name: 'control-pass-stmt', source: 'def turn():\n    if turn_no > 1:\n        pass\n    else:\n        wait()\n', kw: '', role: 'control' },
  { name: 'control-for', source: 'def turn():\n    for e in enemies:\n        attack(e)\n', kw: '', role: 'control' },
  { name: 'control-elif', source: 'def turn():\n    if turn_no > 2:\n        wait()\n    elif turn_no > 1:\n        defend()\n    else:\n        attack(me)\n', kw: '', role: 'control' },
  { name: 'control-defense', source: 'def turn():\n    if me.defense > me.magic_defense:\n        defend()\n', kw: '', role: 'control' },
  { name: 'control-and-or', source: 'def turn():\n    if me.hp > 1 and not (turn_no == 1 or me.mp < 2):\n        wait()\n', kw: '', role: 'control' },
];

const KW_CASE_COUNT = Number(process.env.BLOXCODE_DIFF_KEYWORD_CASES ?? 300);

describe('differential: คำสงวนในตำแหน่งของชื่อ vs CPython', () => {
  const havePython = pythonAvailable();

  it.runIf(havePython)(
    'CPython ปฏิเสธที่ไหน ล่าม BloxCode ต้องปฏิเสธที่นั่น (และไม่ปฏิเสธเกินกว่านั้น)',
    () => {
      const r = mulberry32(SEED ^ 0x5eed);
      const cases: KwCase[] = [...HAND_WRITTEN];
      const { hard: PY_KEYWORDS } = pythonKeywords();

      // ---- คลังโปรแกรมตั้งต้นที่ถูกไวยากรณ์ ใช้เป็นฐานของการฉีดคำสงวน ----
      const pool: string[] = [];
      while (pool.length < 80) {
        const state = makeState(r);
        pool.push(new ProgramGen(r, state.availableSkills.map(preferredSkillName)).build());
      }

      // ---- กวาดให้ครบทุกคู่ (คำสงวน × ตำแหน่ง) แบบไม่ต้องหวังพึ่งดวง ----
      for (const kw of PY_KEYWORDS) {
        for (const role of ALL_SLOT_ROLES) {
          const found = pool
            .map((src) => ({ src, slot: nameSlots(src).find((s) => s.role === role) }))
            .find((x) => x.slot !== undefined);
          if (!found || !found.slot) continue;
          cases.push({
            name: `sweep-${kw}-${role}`,
            source: injectAt(found.src, found.slot, kw),
            kw,
            role,
          });
        }
      }

      // ---- สุ่มเพิ่มเพื่อให้เจอรูปแบบที่ไม่ได้คิดไว้ล่วงหน้า ----
      while (cases.length < KW_CASE_COUNT) {
        const src = pickOne(r, pool);
        const slots = nameSlots(src);
        if (slots.length === 0) continue;
        const slot = pickOne(r, slots);
        const kw = pickOne(r, PY_KEYWORDS);
        cases.push({ name: `fuzz${cases.length}`, source: injectAt(src, slot, kw), kw, role: slot.role });
      }

      const theirs = cpythonSyntax(cases.map((c) => ({ name: c.name, source: c.source })));
      expect(theirs).toHaveLength(cases.length);

      const missedRejection: string[] = []; // CPython ปฏิเสธ แต่เรารับ = ผิดกติกาเหล็ก
      const overRejection: string[] = [];   // CPython รับ แต่เราปฏิเสธโดยไม่มีข้อยกเว้นรองรับ
      const wrongErrorKind: string[] = [];  // ปฏิเสธเหมือนกันแต่คนละชนิด error
      let rejectedByPython = 0;

      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const py = theirs[i];
        const errs = parse(c.source).errors;
        const weReject = errs.length > 0;
        if (!py.ok) rejectedByPython++;

        if (!py.ok && !weReject) {
          missedRejection.push(
            `[${c.name}] CPython: ${py.error} (${py.msg}) แต่ล่ามเรารับ:\n${c.source}`,
          );
          continue;
        }
        if (py.ok && weReject) {
          // ทิศทางนี้ยอมได้เฉพาะสองข้อที่จดไว้แล้วว่าเป็นการตัดสินใจ ไม่ใช่การตรวจพลาด:
          //   1. คำสงวนที่ BloxCode ไม่มีฟีเจอร์นั้นเลย (return / while / import / True / ...)
          //      ถูกปฏิเสธพร้อมเหตุผลตั้งแต่ชั้นเล็กซ์ — เป็นขอบเขตของภาษาย่อย
          //   2. tuple หลัง not ซึ่งภาษาเราไม่มี tuple มาตั้งแต่ต้น
          // คำที่เป็นไวยากรณ์ของเราเอง (def/if/for/and/not/...) ไม่มีข้อยกเว้น:
          // ตรงไหน CPython รับ เราต้องรับ เช่น not(x) ที่เป็น unary not ไม่ใช่การเรียกฟังก์ชัน
          // เคสควบคุม (kw === '') ไม่มีข้อยกเว้นใด ๆ — ต้องผ่านทั้งสองฝั่งเสมอ
          const deliberateGap = (c.kw !== '' && !BASE_SYNTAX_WORDS.includes(c.kw))
            || usesTupleAfterNot(c.source);
          if (!deliberateGap) {
            overRejection.push(
              `[${c.name}] CPython รับ แต่เราปฏิเสธ (${errs[0].name}: ${errs[0].messageTh}):\n${c.source}`,
            );
          }
          continue;
        }
        if (!py.ok && weReject) {
          // CPython แยกแค่ SyntaxError / IndentationError — ของเราต้องไม่ไปโผล่เป็น NameError
          const ourKind = errs[0].name;
          if (ourKind !== 'SyntaxError' && ourKind !== 'IndentationError' && ourKind !== 'LockedFeatureError') {
            wrongErrorKind.push(`[${c.name}] CPython: ${py.error} แต่เราได้ ${ourKind}\n${c.source}`);
          }
        }
      }

      expect(missedRejection.slice(0, 5).join('\n---\n'), `${missedRejection.length} เคสที่เรารับทั้งที่ CPython ปฏิเสธ`).toBe('');
      expect(overRejection.slice(0, 5).join('\n---\n'), `${overRejection.length} เคสที่เราปฏิเสธเกินกว่า CPython`).toBe('');
      expect(wrongErrorKind.slice(0, 5).join('\n---\n'), `${wrongErrorKind.length} เคสที่ปฏิเสธคนละชนิด error`).toBe('');

      // ---- เทสต์ต้องพิสูจน์ได้ว่าตัวเองมีของให้ทดสอบจริง ----
      // ถ้า generator เพี้ยนจนสร้างแต่โปรแกรมที่ถูกต้อง ข้อความข้างบนจะว่างเปล่าแบบหลอก ๆ
      expect(rejectedByPython, 'CPython แทบไม่ปฏิเสธอะไรเลย — generator ไม่ได้ฉีดคำสงวนจริง').toBeGreaterThan(
        cases.length / 2,
      );
      const seenKw = new Set(cases.filter((c) => c.kw).map((c) => c.kw));
      expect(PY_KEYWORDS.filter((k) => !seenKw.has(k)), 'คำสงวนของ CPython ที่ไม่เคยถูกทดสอบ').toEqual([]);
      const seenRole = new Set(cases.map((c) => c.role));
      expect(ALL_SLOT_ROLES.filter((s) => !seenRole.has(s)), 'ตำแหน่งชื่อที่ไม่เคยถูกทดสอบ').toEqual([]);
    },
    120_000,
  );

  /**
   * อีกด้านของกติกาเหล็ก: soft keyword (match / case / _) CPython ยังให้ใช้เป็นชื่อได้
   * ถ้าใครแก้บั๊กคำสงวนด้วยการเหวี่ยงแหปฏิเสธทุกคำที่ "ดูเหมือนคำสงวน" เทสต์นี้ต้องแดง
   */
  it.runIf(havePython)('soft keyword ของ Python ยังใช้เป็นชื่อได้ตามปกติ', () => {
    const soft = pythonKeywords().soft;
    expect(soft.length, 'CPython รุ่นนี้ไม่มี soft keyword ให้ทดสอบ').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const w of soft) {
      for (const src of [
        `def turn():\n    if me.${w} > 5:\n        wait()\n`,
        `def turn():\n    ${w} = weakest(enemies)\n    attack(${w})\n`,
        `def turn():\n    for ${w} in enemies:\n        attack(${w})\n`,
      ]) {
        const weReject = parse(src).errors.length > 0;
        const pyReject = !cpythonSyntax([{ name: w, source: src }])[0].ok;
        // ตรงนี้ไม่สนใจ validate (me.match ไม่มีจริงในเกม = NameError ทีหลัง) สนแค่ไวยากรณ์
        if (weReject !== pyReject) {
          bad.push(`'${w}': เรา${weReject ? 'ปฏิเสธ' : 'รับ'} CPython${pyReject ? 'ปฏิเสธ' : 'รับ'}\n${src}`);
        }
      }
    }
    expect(bad.join('\n---\n')).toBe('');
  });

  it.runIf(havePython)('ข้อความ error ของ me.def ต้องชี้ไปที่ me.defense ไม่ใช่ข้อความกลาง ๆ', () => {
    const e = parse('def turn():\n    if me.def > 5:\n        attack(weakest(enemies))\n').errors[0];
    expect(e.name).toBe('SyntaxError');
    expect(e.messageTh).toContain('คำสงวนของ Python');
    expect(e.messageTh).toContain('defense');
    // และ CPython ก็ต้องปฏิเสธจริง ไม่ใช่เราเข้มอยู่ฝ่ายเดียว
    expect(cpythonSyntax([{ name: 'me.def', source: 'def turn():\n    if me.def > 5:\n        wait()\n' }])[0].ok)
      .toBe(false);
  });
});
