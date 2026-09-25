import { describe, expect, it } from 'vitest';
import { detailsToRejection, parseErrorDetail } from './program-api';

describe('parseErrorDetail — แกะ "บรรทัด:คอลัมน์:ชื่อ:ข้อความไทย" จาก details ของ 400', () => {
  it('แกะรูปมาตรฐานได้ครบสี่ช่อง', () => {
    expect(parseErrorDetail('3:5:NameError:ไม่รู้จักชื่อ enemy — หมายถึง enemies หรือเปล่า')).toEqual({
      line: 3,
      col: 5,
      name: 'NameError',
      messageTh: 'ไม่รู้จักชื่อ enemy — หมายถึง enemies หรือเปล่า',
    });
  });

  it('ข้อความที่มี : อยู่ข้างในต้องได้ครบทั้งประโยค ไม่ถูกตัดที่ : ตัวที่สี่', () => {
    expect(parseErrorDetail('3:5:SyntaxError:ต้องมี : หลัง if')).toEqual({
      line: 3,
      col: 5,
      name: 'SyntaxError',
      messageTh: 'ต้องมี : หลัง if',
    });
    expect(parseErrorDetail('12:1:TypeError:cast("x", enemies): สกิลนี้เล็งได้ทีละตัว: ใช้ weakest(enemies)')?.messageTh).toBe(
      'cast("x", enemies): สกิลนี้เล็งได้ทีละตัว: ใช้ weakest(enemies)',
    );
  });

  it('ข้อความที่ขึ้นต้นหรือจบด้วย : ยังได้ข้อความถูกต้อง', () => {
    expect(parseErrorDetail('1:1:SyntaxError::')?.messageTh).toBe(':');
    expect(parseErrorDetail('2:4:IndentationError:')?.messageTh).toBe('');
  });

  it('รับคำนำหน้าชื่อฟิลด์ (แบบที่ฟอร์มโจทย์ได้จาก starterSource) โดยไม่ทำให้เลขบรรทัดเพี้ยน', () => {
    expect(parseErrorDetail('starterSource: 7:9:LockedFeatureError:ยังใช้ for ไม่ได้: ต้องผ่านชั้น 8 ก่อน')).toEqual({
      field: 'starterSource',
      line: 7,
      col: 9,
      name: 'LockedFeatureError',
      messageTh: 'ยังใช้ for ไม่ได้: ต้องผ่านชั้น 8 ก่อน',
    });
  });

  it('ข้อความที่ไม่ใช่รูปนี้คืน null (ต้องไปแสดงเป็นหมายเหตุ ไม่ใช่เดาบรรทัด)', () => {
    expect(parseErrorDetail('source ต้องเป็นข้อความ')).toBeNull();
    expect(parseErrorDetail('source: source ต้องเป็นข้อความ')).toBeNull();
    expect(parseErrorDetail('3:SyntaxError:ขาดคอลัมน์')).toBeNull();
    expect(parseErrorDetail('x:5:SyntaxError:บรรทัดไม่ใช่ตัวเลข')).toBeNull();
    expect(parseErrorDetail('3:5:9Error:ชื่อขึ้นต้นด้วยตัวเลข')).toBeNull();
  });
});

describe('detailsToRejection — รายการที่ ErrorPanel แสดง', () => {
  it('เรียงตามบรรทัด ยุบซ้ำด้วย groupErrors และแยกข้อความที่ไม่ใช่รูปมาตรฐานออกเป็นหมายเหตุ', () => {
    const r = detailsToRejection([
      '5:20:ValueError:ไม่มีสกิลชื่อ "fire" — หมายถึง "firebolt" หรือเปล่า',
      '2:9:SyntaxError:ต้องมี : หลัง if',
      '5:3:ValueError:ไม่มีสกิลชื่อ "fire": ลองดูรายการสกิลทางขวา',
      'source ห้ามมีอักขระ NUL (\\u0000)',
      '   ',
    ]);
    expect(r.errors).toEqual([
      { name: 'SyntaxError', line: 2, col: 9, messageTh: 'ต้องมี : หลัง if', count: 1 },
      // สองตัวบรรทัดเดียวกันชื่อเดียวกัน → ยุบเหลือตัวที่อยู่ซ้ายสุด (ใกล้ต้นเหตุที่สุด) และนับจำนวน
      { name: 'ValueError', line: 5, col: 3, messageTh: 'ไม่มีสกิลชื่อ "fire": ลองดูรายการสกิลทางขวา', count: 2 },
    ]);
    expect(r.notes).toEqual(['source ห้ามมีอักขระ NUL (\\u0000)']);
  });

  it('details ว่างได้รายการว่างทั้งสองฝั่ง', () => {
    expect(detailsToRejection([])).toEqual({ errors: [], notes: [] });
  });
});
