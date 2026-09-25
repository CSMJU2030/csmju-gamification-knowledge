/**
 * ตัวถอดรหัสสไปรต์แบบสแตนด์อโลนสำหรับ "UI ทั่วไป" (อวาตาร์ / ตุ๊กตาแต่งตัว / การ์ดอาชีพ)
 *
 * ทำไมไม่ใช้ battle/spriteCache.ts ซ้ำ:
 *   spriteCache ถูกออกแบบให้เป็นสมบัติของฉากต่อสู้ (คืน <canvas> สด ๆ ต่อเฟรม,
 *   มี tint/placeholder/สถานะแอนิเมชัน, และถูกเซ็นอนุมัติในรอบ 2A ห้ามแตะ)
 *   ถ้า UI ไปดึงใช้ จะกลายเป็นการผูก presentation layer เข้ากับ battle internals
 *   ซึ่งทำให้แก้ฉากต่อสู้รอบหน้าแล้ว UI พังตาม
 * ไฟล์นี้จึงอ่าน sprites.json ก้อนเดียวกัน แต่ decode ด้วยตัวเอง แล้วคืน "data URL"
 * ที่เอาไปใส่ <img> ได้ตรง ๆ (แคชถาวรต่อ id+state+frame+scale)
 *
 * รูปแบบข้อมูลเหมือน sprites/schema.ts: frames[state][i] = อาเรย์ของสตริง 1 ตัวอักษร = 1 พิกเซล
 * '.' = โปร่งใส, ตัวอักษรอื่นเปิดสีจาก palette
 */
import spritesRaw from './sprites.json';
import type { AnimState, Frame, SpriteDef } from './schema';

type Sheet = Record<string, SpriteDef>;

/** cast ผ่าน unknown เพราะ TS จะ infer ชนิดตามตัวอักษรจริงใน JSON (ใหญ่และไม่ตรง schema) */
const SHEET = spritesRaw as unknown as Sheet;

const urlCache = new Map<string, string>();

export function hasSprite(id: string): boolean {
  return !!SHEET[id];
}

export function spriteSize(id: string): { w: number; h: number } | null {
  const def = SHEET[id];
  return def ? { w: def.w, h: def.h } : null;
}

/** id ของสไปรต์อาชีพ — ใช้ที่เดียวกันทั้ง avatar / paper doll / การ์ดสมัครสมาชิก */
export function classSpriteId(classId: string): string {
  return `class:${classId}`;
}

function pickFrame(def: SpriteDef, state: AnimState, frame: number): Frame {
  const list = def.frames?.[state]?.length ? def.frames[state] : def.frames?.idle;
  if (!list || list.length === 0) return [];
  const i = ((frame % list.length) + list.length) % list.length;
  return list[i] ?? [];
}

/**
 * วาดสไปรต์เป็น PNG data URL
 * @param scale ตัวคูณจำนวนเต็ม — ขยายในแคนวาสเลย (คมกว่าปล่อยให้เบราว์เซอร์ย่อ/ขยายเอง)
 * คืน null ถ้าไม่มีสไปรต์ id นั้น หรืออยู่นอกเบราว์เซอร์ (ผู้เรียกต้องมี fallback เสมอ)
 */
export function spriteDataUrl(
  id: string,
  state: AnimState = 'idle',
  frame = 0,
  scale = 1,
): string | null {
  const def = SHEET[id];
  if (!def) return null;
  const s = Math.max(1, Math.round(scale));
  const key = `${id}|${state}|${frame}|${s}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const rows = pickFrame(def, state, frame);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, def.w * s);
  canvas.height = Math.max(1, def.h * s);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  for (let y = 0; y < Math.min(def.h, rows.length); y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length && x < def.w) {
      const ch = row[x];
      const color = ch === '.' ? undefined : def.palette[ch];
      if (!color) {
        x++;
        continue;
      }
      // รวมพิกเซลสีเดียวกันที่ติดกันเป็นแถบเดียว = fillRect น้อยลงมาก
      let run = 1;
      while (x + run < row.length && x + run < def.w && row[x + run] === ch) run++;
      ctx.fillStyle = color;
      ctx.fillRect(x * s, y * s, run * s, s);
      x += run;
    }
  }

  let url: string;
  try {
    url = canvas.toDataURL('image/png');
  } catch {
    return null;
  }
  urlCache.set(key, url);
  return url;
}
