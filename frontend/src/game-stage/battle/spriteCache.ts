/**
 * โหลด sprites.json (char-grid + palette) แล้วแปลงเป็น <canvas> ออฟสกรีน แคชไว้ครั้งเดียวต่อ
 * (spriteId, animState, frame, tint)
 *
 * sprites.json อาจมีไม่ครบทุกตัว (มอนตัวใหม่มาก่อนภาพเสมอ)
 * โมดูลนี้จึงต้อง "ไม่พังและไม่จอเปล่า": id ไหนหาย → วาดกล่อง placeholder สีชมพูจ๊าบ
 * ขนาดเท่าของจริงพร้อมเครื่องหมาย ? ให้เห็นชัดว่าสไปรต์ขาด
 */
import type { AnimState, Frame, SpriteDef, SpriteSheet } from '../sprites/schema';

const ANIM_STATES: AnimState[] = ['idle', 'act', 'hit', 'down'];

function isFrame(v: unknown): v is Frame {
  return Array.isArray(v) && v.every((r) => typeof r === 'string');
}

/** ตรวจ shape ตาม schema — entry ที่ผิดรูปจะถูกตัดทิ้ง ไม่ทำให้ทั้งชีตพัง */
function sanitize(raw: unknown): SpriteSheet {
  const out: SpriteSheet = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const def = value as Partial<SpriteDef>;
    if (typeof def.w !== 'number' || typeof def.h !== 'number') continue;
    if (!def.palette || typeof def.palette !== 'object') continue;
    if (!def.frames || typeof def.frames !== 'object') continue;

    const frames = {} as Record<AnimState, Frame[]>;
    let ok = true;
    for (const st of ANIM_STATES) {
      const list = (def.frames as Record<string, unknown>)[st];
      const arr = Array.isArray(list) ? list.filter(isFrame) : [];
      if (arr.length === 0) {
        // สถานะขาด → ยืมจาก idle ทีหลัง (เติมตอน get) แต่ถ้า idle เองก็ขาด = ใช้ไม่ได้
        if (st === 'idle') ok = false;
        frames[st] = [];
      } else {
        frames[st] = arr;
      }
    }
    if (!ok) continue;
    for (const st of ANIM_STATES) {
      if (frames[st].length === 0) frames[st] = frames.idle;
    }
    const palette: Record<string, string> = {};
    for (const [ch, col] of Object.entries(def.palette as Record<string, unknown>)) {
      if (typeof col === 'string' && ch !== '.') palette[ch] = col;
    }
    out[id] = { w: def.w, h: def.h, palette, frames };
  }
  return out;
}

/**
 * โหลดชีตแบบ dynamic import — ไฟล์ JSON ~140KB จึงแยก chunk และมาเฉพาะตอนเวทีเปิด
 * (ของเดิมใช้ import.meta.glob ของ Vite เพื่อรอดตอนไฟล์ยังไม่มี · ตอนนี้ไฟล์มีแน่นอนแล้ว
 *  แต่ยังห่อ try/catch ไว้: โหลด chunk ไม่สำเร็จ = ฉากยังเล่นได้ด้วยกล่อง placeholder)
 */
export async function loadSpriteSheet(): Promise<{ sheet: SpriteSheet; missing: boolean }> {
  try {
    const mod: unknown = await import('../sprites/sprites.json');
    const raw = (mod as { default?: unknown }).default ?? mod;
    const sheet = sanitize(raw);
    return { sheet, missing: Object.keys(sheet).length === 0 };
  } catch (e) {
    console.warn('[battle] โหลด sprites.json ไม่สำเร็จ ใช้ placeholder แทน', e);
    return { sheet: {}, missing: true };
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function renderFrame(def: SpriteDef, frame: Frame): HTMLCanvasElement {
  const canvas = makeCanvas(def.w, def.h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (let y = 0; y < Math.min(def.h, frame.length); y++) {
    const row = frame[y];
    let x = 0;
    while (x < row.length && x < def.w) {
      const ch = row[x];
      const color = def.palette[ch];
      if (!color) {
        x++;
        continue;
      }
      // รวมพิกเซลสีเดียวกันที่ติดกันเป็นแถบเดียว = fillRect น้อยลง
      let run = 1;
      while (x + run < row.length && x + run < def.w && row[x + run] === ch) run++;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, run, 1);
      x += run;
    }
  }
  return canvas;
}

/** กล่องแทนสไปรต์ที่หาย — ลายทแยงชมพู + กรอบ + เครื่องหมาย ? ให้เห็นชัดว่าไม่ใช่ของจริง */
function renderPlaceholder(w: number, h: number): HTMLCanvasElement {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#2a1030';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ff3ea5';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x + y) % 8 === 0) ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = '#ff7ac6';
  ctx.fillRect(0, 0, w, 1);
  ctx.fillRect(0, h - 1, w, 1);
  ctx.fillRect(0, 0, 1, h);
  ctx.fillRect(w - 1, 0, 1, h);

  // '?' 5x7 เขียนด้วยพิกเซล
  const glyph = ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'];
  const gw = 5;
  const gh = glyph.length;
  const ox = Math.floor((w - gw) / 2);
  const oy = Math.floor((h - gh) / 2);
  ctx.fillStyle = '#ffe1f3';
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (glyph[y][x] === '#') ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  return canvas;
}

function tintCanvas(src: HTMLCanvasElement, color: string, alpha: number): HTMLCanvasElement {
  const out = makeCanvas(src.width, src.height);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return out;
}

export type Tint = 'none' | 'red' | 'white' | 'dark';

const TINTS: Record<Exclude<Tint, 'none'>, { color: string; alpha: number }> = {
  red: { color: '#ff3020', alpha: 0.72 },
  white: { color: '#ffffff', alpha: 0.7 },
  dark: { color: '#0a0a12', alpha: 0.45 },
};

export interface SpriteHandle {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** true = ของจริงจากชีต, false = กล่อง placeholder */
  real: boolean;
}

export class SpriteCache {
  private sheet: SpriteSheet = {};
  private cache = new Map<string, HTMLCanvasElement>();

  setSheet(sheet: SpriteSheet): void {
    this.sheet = sheet;
    this.cache.clear();
  }

  has(id: string): boolean {
    return !!this.sheet[id];
  }

  /** เลือก id แรกที่มีจริงในชีต (ใช้ทำ fallback chain: boss: -> mon:) */
  resolve(ids: string[]): string | null {
    for (const id of ids) if (this.sheet[id]) return id;
    return null;
  }

  frameCount(id: string, state: AnimState): number {
    const def = this.sheet[id];
    if (!def) return 1;
    return Math.max(1, def.frames[state]?.length ?? 1);
  }

  /** คืน canvas พร้อมวาดเสมอ — ถ้าไม่มีสไปรต์จะได้ placeholder ขนาดที่ขอ */
  get(
    id: string | null,
    state: AnimState,
    frame: number,
    fallbackW: number,
    fallbackH: number,
    tint: Tint = 'none',
  ): SpriteHandle {
    const def = id ? this.sheet[id] : undefined;
    if (!def) {
      const key = `__ph__|${fallbackW}x${fallbackH}|${tint}`;
      let canvas = this.cache.get(key);
      if (!canvas) {
        const base = renderPlaceholder(fallbackW, fallbackH);
        canvas = tint === 'none' ? base : tintCanvas(base, TINTS[tint].color, TINTS[tint].alpha);
        this.cache.set(key, canvas);
      }
      return { canvas, w: fallbackW, h: fallbackH, real: false };
    }

    const frames = def.frames[state]?.length ? def.frames[state] : def.frames.idle;
    const fi = frames.length > 0 ? ((frame % frames.length) + frames.length) % frames.length : 0;
    const key = `${id}|${state}|${fi}|${tint}`;
    let canvas = this.cache.get(key);
    if (!canvas) {
      const base =
        this.cache.get(`${id}|${state}|${fi}|none`) ?? renderFrame(def, frames[fi] ?? []);
      this.cache.set(`${id}|${state}|${fi}|none`, base);
      canvas = tint === 'none' ? base : tintCanvas(base, TINTS[tint].color, TINTS[tint].alpha);
      this.cache.set(key, canvas);
    }
    return { canvas, w: def.w, h: def.h, real: true };
  }
}
