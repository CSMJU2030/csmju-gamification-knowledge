/**
 * Pixel-precise drawing helpers สำหรับ backbuffer ขนาด 256x160
 *
 * ทุกฟังก์ชันวาดแบบ "ล็อกกริดพิกเซล" (ปัดเป็นจำนวนเต็ม, ไม่พึ่ง path/arc ของ canvas
 * ที่จะสร้าง anti-alias) เพื่อให้ภาพยังคมเมื่อขยาย x5 แบบ nearest-neighbor
 */

export interface Vec {
  x: number;
  y: number;
}

export class Pix {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  /** สี่เหลี่ยมทึบ (พิกัดถูกปัดเป็น int เสมอ) */
  fill(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    if (alpha <= 0 || w <= 0 || h <= 0) return;
    const c = this.ctx;
    if (alpha < 1) c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (alpha < 1) c.globalAlpha = 1;
  }

  px(x: number, y: number, color: string, alpha = 1): void {
    this.fill(x, y, 1, 1, color, alpha);
  }

  /** วงรีทึบแบบ scanline — ใช้ทำแท่นยืน/ลูกไฟ */
  ellipseFill(cx: number, cy: number, rx: number, ry: number, color: string, alpha = 1): void {
    if (rx <= 0 || ry <= 0 || alpha <= 0) return;
    const c = this.ctx;
    if (alpha < 1) c.globalAlpha = alpha;
    c.fillStyle = color;
    const top = Math.round(cy - ry);
    const bot = Math.round(cy + ry);
    for (let y = top; y <= bot; y++) {
      const dy = (y - cy) / ry;
      const s = 1 - dy * dy;
      if (s <= 0) continue;
      const hw = Math.max(0, Math.floor(rx * Math.sqrt(s)));
      c.fillRect(Math.round(cx) - hw, y, hw * 2 + 1, 1);
    }
    if (alpha < 1) c.globalAlpha = 1;
  }

  /** เส้นขอบวงรีหนา 1px (ปิดหัว/ท้ายให้ต่อเนื่อง) */
  ellipseStroke(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: string,
    alpha = 1,
    thickness = 1,
  ): void {
    if (rx <= 0 || ry <= 0 || alpha <= 0) return;
    const c = this.ctx;
    if (alpha < 1) c.globalAlpha = alpha;
    c.fillStyle = color;
    const top = Math.round(cy - ry);
    const bot = Math.round(cy + ry);
    const icx = Math.round(cx);
    let prev = -1;
    for (let y = top; y <= bot; y++) {
      const dy = (y - cy) / ry;
      const s = 1 - dy * dy;
      const hw = s <= 0 ? 0 : Math.max(0, Math.floor(rx * Math.sqrt(s)));
      const gap = prev < 0 ? 0 : Math.abs(hw - prev);
      const span = Math.max(thickness, gap + 1);
      c.fillRect(icx - hw, y, span, 1);
      c.fillRect(icx + hw - span + 1, y, span, 1);
      prev = hw;
    }
    if (alpha < 1) c.globalAlpha = 1;
  }

  /** เส้นตรงแบบ Bresenham */
  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    alpha = 1,
    thickness = 1,
  ): void {
    if (alpha <= 0) return;
    const c = this.ctx;
    if (alpha < 1) c.globalAlpha = alpha;
    c.fillStyle = color;
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    const t = Math.max(1, Math.round(thickness));
    const o = Math.floor(t / 2);
    for (let guard = 0; guard < 1200; guard++) {
      c.fillRect(x - o, y - o, t, t);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    if (alpha < 1) c.globalAlpha = 1;
  }

  /**
   * ส่วนโค้ง (ใช้ทำรอยฟัน/คลื่น) — สุ่มจุดตามพารามิเตอร์แล้วแต้มทีละพิกเซล
   * a0/a1 เป็นเรเดียน, rx/ry แยกกันได้เพื่อให้บีบเป็นเพอร์สเปกทีฟ
   */
  arc(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    a0: number,
    a1: number,
    color: string,
    alpha = 1,
    thickness = 1,
  ): void {
    if (alpha <= 0) return;
    const c = this.ctx;
    if (alpha < 1) c.globalAlpha = alpha;
    c.fillStyle = color;
    const steps = Math.max(6, Math.round(Math.abs(a1 - a0) * Math.max(rx, ry) * 1.6));
    const t = Math.max(1, Math.round(thickness));
    const o = Math.floor(t / 2);
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const x = Math.round(cx + Math.cos(a) * rx);
      const y = Math.round(cy + Math.sin(a) * ry);
      c.fillRect(x - o, y - o, t, t);
    }
    if (alpha < 1) c.globalAlpha = 1;
  }

  /** สี่เหลี่ยมข้าวหลามตัด (เกล็ดน้ำแข็ง/ประกาย) */
  diamond(cx: number, cy: number, r: number, color: string, alpha = 1): void {
    if (alpha <= 0 || r <= 0) return;
    const c = this.ctx;
    if (alpha < 1) c.globalAlpha = alpha;
    c.fillStyle = color;
    const icx = Math.round(cx);
    const icy = Math.round(cy);
    const ir = Math.round(r);
    for (let dy = -ir; dy <= ir; dy++) {
      const hw = ir - Math.abs(dy);
      c.fillRect(icx - hw, icy + dy, hw * 2 + 1, 1);
    }
    if (alpha < 1) c.globalAlpha = 1;
  }
}

// ---------- utils ----------
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeIn = (t: number): number => t * t;

/** สุ่มแบบ deterministic จากจำนวนเต็ม — เอฟเฟกต์จะได้เหมือนเดิมทุกเฟรม */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
