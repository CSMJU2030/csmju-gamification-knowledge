/**
 * ฉากหลังคงที่ 256x160 — เรนเดอร์ครั้งเดียวเก็บเป็น canvas ออฟสกรีน แล้ว blit ทุกเฟรม
 * (พอร์ตแนวทางจากสคริปต์พิสูจน์แนวคิดของ PM: ไล่สีท้องฟ้า → ดาว → เส้นขอบฟ้า →
 *  พื้นที่มีเส้นสอบเข้าหาจุดรวมสายตา)
 */
import { SCENE } from '../sprites/schema';
import { VANISH } from './layout';

const W = SCENE.baseW;
const H = SCENE.baseH;
const HZ = SCENE.horizonY;

const STARS: Array<[number, number, number]> = [
  [18, 14, 1],
  [58, 34, 0],
  [104, 10, 1],
  [150, 26, 0],
  [198, 16, 1],
  [236, 40, 0],
  [128, 52, 0],
  [36, 58, 0],
  [176, 62, 0],
  [250, 8, 1],
  [72, 8, 0],
  [88, 46, 0],
  [214, 30, 1],
  [12, 40, 0],
  [166, 6, 0],
  [116, 30, 0],
];

/** เสาหินไกล ๆ ริมขอบฟ้า — ให้รู้ว่าอยู่ "ในหอคอย" ไม่ใช่ทุ่งโล่ง */
const PILLARS: Array<[number, number, number]> = [
  // x, กว้าง, สูงจากขอบฟ้าขึ้นไป
  [16, 10, 26],
  [40, 7, 18],
  [214, 9, 22],
  [238, 12, 30],
  [94, 6, 12],
  [136, 5, 10],
];

let cached: HTMLCanvasElement | null = null;

export function getBackground(): HTMLCanvasElement {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cached = canvas;
    return canvas;
  }
  const img = ctx.createImageData(W, H);
  const d = img.data;

  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  const add = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = Math.min(255, d[i] + r);
    d[i + 1] = Math.min(255, d[i + 1] + g);
    d[i + 2] = Math.min(255, d[i + 2] + b);
  };

  // ---- ท้องฟ้ากลางคืน + พื้น (ไล่สีแนวตั้ง) ----
  for (let y = 0; y < H; y++) {
    let r: number;
    let g: number;
    let b: number;
    if (y < HZ) {
      const t = y / HZ;
      r = Math.round(14 + 20 * t);
      g = Math.round(17 + 23 * t);
      b = Math.round(38 + 42 * t);
    } else {
      const t = (y - HZ) / (H - HZ);
      r = Math.round(30 + 26 * t);
      g = Math.round(33 + 27 * t);
      b = Math.round(58 + 34 * t);
    }
    for (let x = 0; x < W; x++) put(x, y, r, g, b);
  }

  // ---- ดวงจันทร์ + ออร่า ----
  const mx = 206;
  const my = 26;
  for (let y = my - 14; y <= my + 14; y++) {
    for (let x = mx - 14; x <= mx + 14; x++) {
      const dist = Math.hypot(x - mx, y - my);
      if (dist > 14) continue;
      if (dist <= 7) {
        const shade = dist > 5.4 ? 214 : 238;
        put(x, y, shade, shade - 6, shade - 26);
      } else {
        const f = 1 - (dist - 7) / 7;
        add(x, y, Math.round(26 * f), Math.round(28 * f), Math.round(40 * f));
      }
    }
  }
  // หลุมอุกกาบาตจาง ๆ
  for (const [cx, cy, rr] of [
    [mx - 2, my - 2, 2],
    [mx + 3, my + 2, 1],
    [mx - 1, my + 4, 1],
  ]) {
    for (let y = cy - rr; y <= cy + rr; y++) {
      for (let x = cx - rr; x <= cx + rr; x++) {
        if (Math.hypot(x - cx, y - cy) <= rr) put(x, y, 206, 200, 176);
      }
    }
  }

  // ---- ดาว ----
  for (const [sx, sy, big] of STARS) {
    put(sx, sy, 186, 198, 255);
    if (big) {
      add(sx - 1, sy, 40, 44, 70);
      add(sx + 1, sy, 40, 44, 70);
      add(sx, sy - 1, 40, 44, 70);
      add(sx, sy + 1, 40, 44, 70);
    }
  }

  // ---- เสาหินไกล ----
  for (const [px, pw, ph] of PILLARS) {
    for (let y = HZ - ph; y < HZ; y++) {
      for (let x = px; x < px + pw; x++) {
        const edge = x === px || x === px + pw - 1;
        put(x, y, edge ? 30 : 22, edge ? 33 : 25, edge ? 54 : 44);
      }
    }
    // หัวเสา
    for (let x = px - 1; x < px + pw + 1; x++) put(x, HZ - ph - 1, 36, 40, 62);
  }

  // ---- เส้นขอบฟ้า ----
  for (let x = 0; x < W; x++) {
    put(x, HZ, 108, 116, 172);
    put(x, HZ + 1, 74, 80, 124);
  }

  // ---- เส้นพื้นสอบเข้าหาจุดรวมสายตา ----
  for (let k = -7; k <= 7; k++) {
    if (k === 0) continue;
    for (let y = HZ + 2; y < H; y++) {
      const t = (y - HZ) / (H - HZ);
      const x = Math.round(VANISH.x + k * 26 * t);
      add(x, y, 16, 17, 22);
      if (t > 0.55) add(x + 1, y, 8, 8, 11);
    }
  }

  // ---- เส้นขวางแบบเพอร์สเปกทีฟ (ห่างขึ้นเรื่อย ๆ เมื่อเข้าใกล้กล้อง) ----
  let step = 2;
  for (let y = HZ + 4; y < H; y += step) {
    for (let x = 0; x < W; x++) add(x, y, 8, 8, 11);
    step = Math.min(16, step + 2);
  }

  // ---- ขอบจอมืดลง (vignette) ----
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - W / 2) / (W / 2);
      const dy = Math.abs(y - H / 2) / (H / 2);
      const v = Math.max(0, Math.hypot(dx, dy) - 0.72);
      if (v <= 0) continue;
      const f = Math.min(1, v * 1.5);
      const i = (y * W + x) * 4;
      d[i] = Math.round(d[i] * (1 - f * 0.55));
      d[i + 1] = Math.round(d[i + 1] * (1 - f * 0.55));
      d[i + 2] = Math.round(d[i + 2] * (1 - f * 0.5));
    }
  }

  ctx.putImageData(img, 0, 0);
  cached = canvas;
  return canvas;
}
