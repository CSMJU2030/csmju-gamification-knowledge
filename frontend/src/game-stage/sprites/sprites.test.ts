import { describe, expect, it } from 'vitest';
import { gamedata, PLAYABLE_CLASSES } from '@tower/engine';
import { spriteIdCandidates } from '../battle/layout';
import spritesRaw from './sprites.json';
import { SIZE, type AnimState, type SpriteDef } from './schema';

const SHEET = spritesRaw as unknown as Record<string, SpriteDef>;
const STATES: AnimState[] = ['idle', 'act', 'hit', 'down'];

function boxFor(id: string): { w: number; h: number } {
  if (id.startsWith('class:')) return SIZE.player;
  if (id.startsWith('boss:')) return SIZE.boss;
  return SIZE.monster;
}

/** พิกเซลทึบของเฟรม เป็นชุด "x,y" */
function silhouette(frame: string[]): Set<string> {
  const out = new Set<string>();
  frame.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && out.add(`${x},${y}`)));
  return out;
}

describe('sprites.json — ทุกตัวที่ขึ้นฉากมีรูปจริง', () => {
  it('มอนทุกชนิดใน gamedata มีสไปรต์ — ไม่ขึ้นกล่อง "?" แทน (ยักษ์หินเคยไม่มีตั้งแต่ชั้น 2)', () => {
    const missing = gamedata.monsterArchetypes.map((a) => a.id).filter((id) => !SHEET[`mon:${id}`]);
    expect(missing).toEqual([]);
  });

  it('บอสทุกตัวหารูปเจอ (รูปบอสเอง หรือรูปของ archetype)', () => {
    const missing = gamedata.bosses
      .map((b) => b.id)
      .filter((id) => !spriteIdCandidates(`f1w10_boss_${id}`).some((sid) => SHEET[sid]));
    expect(missing).toEqual([]);
  });

  it('อาชีพทุกอาชีพ (รวมผู้ฝึกหัด) มีรูปมุมหลัง', () => {
    for (const c of [...PLAYABLE_CLASSES, 'novice']) expect(SHEET[`class:${c}`], c).toBeDefined();
  });

  it('ทุกสไปรต์: ขนาดตามมาตรฐาน · ครบ 4 สถานะ · ทุกแถวกว้างเท่ากล่อง · ทุกตัวอักษรมีสีใน palette', () => {
    for (const [id, def] of Object.entries(SHEET)) {
      const box = boxFor(id);
      expect({ id, w: def.w, h: def.h }).toEqual({ id, ...box });
      for (const st of STATES) {
        expect(def.frames[st]?.length, `${id} ${st}`).toBeGreaterThan(0);
        for (const f of def.frames[st]) {
          expect(f.length, `${id} ${st} สูง`).toBe(def.h);
          for (const row of f) {
            expect(row.length, `${id} ${st} กว้าง`).toBeLessThanOrEqual(def.w);
            for (const ch of row) if (ch !== '.') expect(def.palette[ch], `${id} ${st} '${ch}'`).toBeDefined();
          }
        }
      }
      expect(def.palette['.'], `${id} ใช้ '.' เป็นสี`).toBeUndefined();
    }
  });
});

describe('รูปอาชีพแยกกันออกด้วยรูปร่าง ไม่ใช่แค่สี (ผู้ใช้แจ้ง 8 ต.ค. 2569: "เหมือนกันเกินไป")', () => {
  it('เงาท่ายืนของสองอาชีพใดก็ได้ ซ้อนกันไม่เกิน 80%', () => {
    const ids = [...PLAYABLE_CLASSES, 'novice'];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = silhouette(SHEET[`class:${ids[i]}`].frames.idle[0]);
        const b = silhouette(SHEET[`class:${ids[j]}`].frames.idle[0]);
        const inter = [...a].filter((p) => b.has(p)).length;
        const iou = inter / (a.size + b.size - inter);
        expect(iou, `${ids[i]} กับ ${ids[j]}`).toBeLessThan(0.8);
      }
    }
  });
});
