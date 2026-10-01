/**
 * กฎข้อ 1 ของ schema.ts: source เป็นแหล่งความจริงเดียว บล็อกคือภาพฉายของ AST
 * เทสต์นี้ยืนยันว่าเดินทาง source → บล็อก → source แล้วได้ข้อความเดิมทุกตัวอักษร
 * และการแก้ผ่านบล็อก (ast.ts) ได้โปรแกรมที่ parse ผ่านเสมอ — ใช้ parse/toPython ของ engine ตัวเดียวกับเซิร์ฟเวอร์
 */
import { describe, expect, it } from 'vitest';
import { parse, toPython, validate, unlockedFeatures, type Program } from '@tower/engine/lang';
import { buildRows } from './BlockCanvas';
import { attachElse, insertAt, moveStmt, removeAt, replaceAt, stmtAt } from './ast';
import { applyHole, callExpr, nameExpr } from './holes';
import { BLOCK_CATALOG } from './schema';

const SAMPLES: Record<string, string> = {
  'โปรแกรมพื้นฐานของตัวละครใหม่': 'def turn():\n    attack(weakest(enemies))\n',
  'if/elif/else + cast + คอมเมนต์หัวไฟล์':
    '# โปรแกรมของจอมเวท\n' +
    'def turn():\n' +
    '    if has_debuff("marked"):\n' +
    '        defend()\n' +
    '    elif me.hp_pct < 40:\n' +
    '        cast("heal", me)\n' +
    '    else:\n' +
    '        cast("firebolt", weakest(enemies))\n',
  'ตัวแปร + for ซ้อน if':
    'def turn():\n' +
    '    t = weakest(enemies)\n' +
    '    for x in enemies:\n' +
    '        if x.hp_pct < 30:\n' +
    '            attack(x)\n' +
    '    attack(t)\n',
};

function mustParse(source: string): Program {
  const r = parse(source);
  expect(r.errors).toEqual([]);
  expect(r.program).not.toBeNull();
  return r.program as Program;
}

/** บรรทัดของทุกบล็อกที่วาด (ไม่นับช่องหย่อน) */
const blockLines = (p: Program) =>
  buildRows(p)
    .filter((r) => r.t === 'stmt')
    .map((r) => (r.t === 'stmt' ? r.line : 0));

describe('round-trip source → บล็อก → source', () => {
  for (const [label, source] of Object.entries(SAMPLES)) {
    it(label, () => {
      const program = mustParse(source);
      const rows = buildRows(program);
      expect(rows.some((r) => r.t === 'stmt')).toBe(true);

      // บล็อกแต่ละแถวชี้เลขบรรทัดเดียวกับมุมมองโค้ด — ไม่งั้นคลิกข้อผิดพลาดแล้วจะกระโดดผิดที่
      const lines = source.split('\n');
      for (const line of blockLines(program)) {
        expect(line).toBeGreaterThan(0);
        expect(lines[line - 1].trim()).not.toBe('');
      }

      // กลับเป็นข้อความได้ตรงทุกตัวอักษร และทำซ้ำแล้วไม่เปลี่ยน (idempotent)
      const back = toPython(program);
      expect(back).toBe(source);
      expect(toPython(mustParse(back))).toBe(back);
    });
  }

  it('แถวของ if/elif/else เรียงตรงกับบรรทัดในโค้ด (else อยู่บรรทัดก่อนคำสั่งแรกในสาขา)', () => {
    const p = mustParse(SAMPLES['if/elif/else + cast + คอมเมนต์หัวไฟล์']);
    const clauses = buildRows(p)
      .filter((r) => r.t === 'stmt')
      .map((r) => (r.t === 'stmt' ? `${r.line}:${r.clause ?? r.stmt.kind}` : ''));
    expect(clauses).toEqual(['3:if', '4:expr', '5:elif', '6:expr', '7:else', '8:expr']);
  });
});

describe('แก้ผ่านบล็อกแล้วยังเป็นโปรแกรมที่ถูกไวยากรณ์', () => {
  it('หย่อนบล็อกทุกชนิดจากถาดลงหัวโปรแกรมแล้ว parse ผ่าน', () => {
    const base = mustParse(SAMPLES['โปรแกรมพื้นฐานของตัวละครใหม่']);
    for (const def of BLOCK_CATALOG) {
      const next = insertAt(base, { parent: [], index: 0 }, def.make());
      const text = toPython(next);
      expect(parse(text).errors, `${def.id}\n${text}`).toEqual([]);
    }
  });

  it('ย้ายบล็อกลงล่างแล้ววางถูกช่อง (adjustSlot เลื่อน index ให้หลังถอดของต้นทาง)', () => {
    const p = mustParse(SAMPLES['ตัวแปร + for ซ้อน if']);
    // ย้าย t = ... (ตัวแรก) ไปไว้ท้ายสุด
    const moved = moveStmt(p, { path: [], index: 0 }, { parent: [], index: 3 });
    expect(toPython(moved)).toBe(
      'def turn():\n' +
        '    for x in enemies:\n' +
        '        if x.hp_pct < 30:\n' +
        '            attack(x)\n' +
        '    attack(t)\n' +
        '    t = weakest(enemies)\n',
    );
  });

  it('ลบคำสั่งสุดท้ายใน if แล้วเติม pass ให้ ไม่กลายเป็น IndentationError', () => {
    const p = mustParse(SAMPLES['ตัวแปร + for ซ้อน if']);
    const path = [
      { i: 1, br: 'body' as const },
      { i: 0, br: 'body' as const },
    ];
    const text = toPython(removeAt(p, path, 0));
    expect(parse(text).errors).toEqual([]);
    expect(text).toContain('        if x.hp_pct < 30:\n            pass\n');
  });

  it('เติม else ลงบน if ที่มี elif ต่อท้ายต้องไปต่อที่ปลายสาย และเติมซ้ำไม่ได้', () => {
    const src = 'def turn():\n    if me.hp_pct < 30:\n        defend()\n    elif me.mp < 5:\n        wait()\n';
    const p = mustParse(src);
    const res = attachElse(p, [], 0);
    expect(res.ok).toBe(true);
    const text = toPython(res.program);
    expect(text).toBe(src + '    else:\n        pass\n');
    expect(attachElse(mustParse(text), [], 0).ok).toBe(false);
  });

  it('เปลี่ยนค่าในช่อง (เมนูแตะเลือก) แล้วโปรแกรมผ่าน validate ของ engine', () => {
    const p = mustParse(SAMPLES['โปรแกรมพื้นฐานของตัวละครใหม่']);
    const stmt = stmtAt(p, [], 0);
    expect(stmt).not.toBeNull();
    const next = replaceAt(p, [], 0, applyHole(stmt!, { at: 'arg', index: 0 }, callExpr('strongest', [nameExpr('enemies')])));
    const text = toPython(next);
    expect(text).toBe('def turn():\n    attack(strongest(enemies))\n');
    const reparsed = mustParse(text);
    expect(validate(reparsed, { features: unlockedFeatures(0), availableSkills: [] }).errors).toEqual([]);
  });
});
