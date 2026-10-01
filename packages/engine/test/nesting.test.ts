/**
 * นิพจน์ซ้อนลึก — ต้องเป็น SyntaxError ที่อ่านรู้เรื่อง ไม่ใช่ stack ล้น (MAX_EXPR_DEPTH ใน lang/spec.ts)
 * พบจากการทดสอบแบบพยายามล้ม backend ใหม่: วงเล็บ ~1,000 ชั้นยังสั้นกว่าเพดาน 20,000 ตัวอักษร
 */
import { describe, expect, it } from 'vitest';
import { MAX_AST_DEPTH, MAX_EXPR_DEPTH, parse, validate, unlockedFeatures } from '../src/index';

const wrapParens = (d: number) => `def turn():\n    attack(${'('.repeat(d)}weakest(enemies)${')'.repeat(d)})\n`;

describe('เพดานความลึกของนิพจน์', () => {
  it('ซ้อนตื้นกว่าเพดานยัง parse ได้ตามปกติ', () => {
    expect(parse(wrapParens(MAX_EXPR_DEPTH - 5)).errors).toEqual([]);
  });

  it.each([
    ['วงเล็บ 1,000 ชั้น', wrapParens(1000)],
    ['วงเล็บ 5,000 ชั้น', wrapParens(5000)],
    ['not ซ้อน 3,000 ครั้ง', `def turn():\n    if ${'not '.repeat(3000)}True:\n        defend()\n`],
    ['ลบนำหน้า 3,000 ครั้ง', `def turn():\n    if me.hp > ${'-'.repeat(3000)}1:\n        defend()\n`],
  ])('%s → SyntaxError ไม่ใช่ exception', (_label, source) => {
    const result = parse(source);
    expect(result.program).toBeNull();
    expect(result.errors[0].name).toBe('SyntaxError');
    expect(result.errors[0].messageTh).toContain(`${MAX_EXPR_DEPTH}`);
  });
});

describe('เพดานความลึกของต้นไม้ (สายยาวที่ parser สร้างด้วยลูป)', () => {
  const sum = (n: number) => `def turn():\n    attack(${Array(n).fill('1').join('+')})\n`;

  it('บวกกัน 50 ตัวยัง parse และ validate ได้', () => {
    const r = parse(sum(50));
    expect(r.errors).toEqual([]);
    expect(() => validate(r.program!, { features: unlockedFeatures(10), availableSkills: [] })).not.toThrow();
  });

  it.each([
    ['1+1+… 9,900 ตัว', sum(9900)],
    ['1*1*… 5,000 ตัว', `def turn():\n    attack(${Array(5000).fill('1').join('*')})\n`],
    ['me.hp.hp… 3,000 ชั้น', `def turn():\n    if me${'.hp'.repeat(3000)} > 1:\n        defend()\n`],
  ])('%s → SyntaxError (เดิม validator ทำ stack ล้น)', (_label, source) => {
    const r = parse(source);
    expect(r.program).toBeNull();
    expect(r.errors[0].name).toBe('SyntaxError');
    expect(r.errors[0].messageTh).toContain(`${MAX_AST_DEPTH}`);
  });
});

