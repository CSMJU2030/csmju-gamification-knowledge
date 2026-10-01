/**
 * เอฟเฟกต์สกิลทั้ง 12 ตัวตาม EFFECT_ANIMATIONS — วาดด้วยโค้ดล้วน ไม่มีไฟล์ภาพ
 * ทุกฟังก์ชันรับ progress t (0..1) ของเอฟเฟกต์ แล้ววาดลง backbuffer 256x160
 * คืนค่าเพื่อขอ "จอสั่น" / "แฟลชทั้งจอ" / "ผลักเป้าถอยหลัง" ให้ตัวเรนเดอร์จัดการต่อ
 *
 * สีในไฟล์นี้เป็นสีของภาพเวทีเกม (ไม่ใช่สี UI) — อยู่ในขอบเขตคำขอ exception D1 (docs/issues/D1-game-stage-ui-exception.md)
 */
import { EFFECT_ANIMATIONS, SCENE, TIMING } from '../sprites/schema';
import type { EffectAnimation } from '../sprites/schema';
import { Pix, clamp01, easeIn, easeOut, hash01, lerp } from './pixel';
import type { Vec } from './pixel';

const W = SCENE.baseW;
const H = SCENE.baseH;

/** จังหวะที่เอฟเฟกต์ "ลงเป้า" — ตรงกับตอนที่ตัวเล่นสลับเป้าเป็นสถานะ hit */
export const HIT_T = TIMING.effect / (TIMING.effect + TIMING.impact);

export interface EffectInput {
  p: Pix;
  /** ความคืบหน้า 0..1 */
  t: number;
  /** เวลาสะสมของฉาก (ms) ใช้ทำการสั่นไหวเล็ก ๆ */
  now: number;
  from: Vec;
  targets: Vec[];
  /** เอฟเฟกต์เขียนแรงผลัก (พิกเซล) ต่อเป้าแต่ละตัวลงอาเรย์นี้ */
  pushes: number[];
  seed: number;
}

export interface EffectOut {
  shake?: number;
  flash?: { color: string; alpha: number };
}

export type EffectFn = (i: EffectInput) => EffectOut | void;

// ---------- helpers ----------

const dirTo = (a: Vec, b: Vec): Vec => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
};

/** ช่วง fade มาตรฐาน: โผล่เร็ว จางท้าย */
const fadeOut = (t: number, start: number): number =>
  t <= start ? 1 : clamp01(1 - (t - start) / (1 - start));

/** สามเหลี่ยมชี้ขึ้น/ลง (ใช้ทำเขี้ยว/หนามกระแทก) */
function fang(p: Pix, x: number, y: number, w: number, h: number, down: boolean, color: string, alpha: number) {
  for (let i = 0; i < h; i++) {
    const hw = Math.max(0, Math.round((w / 2) * (1 - i / h)));
    const yy = down ? y + i : y - i;
    p.fill(x - hw, yy, hw * 2 + 1, 1, color, alpha);
  }
}

function sparks(
  p: Pix,
  c: Vec,
  count: number,
  radius: number,
  t: number,
  seed: number,
  colors: string[],
  alpha = 1,
) {
  for (let i = 0; i < count; i++) {
    const a = hash01(seed + i * 13) * Math.PI * 2;
    const spd = 0.55 + hash01(seed + i * 7) * 0.75;
    const r = radius * spd * easeOut(t);
    const x = c.x + Math.cos(a) * r;
    const y = c.y + Math.sin(a) * r * 0.8 - t * 3;
    const col = colors[i % colors.length];
    p.px(x, y, col, alpha * (1 - t));
    if (i % 3 === 0) p.px(x + 1, y, col, alpha * (1 - t) * 0.6);
  }
}

// ---------- 1. slash ----------
const slash: EffectFn = ({ p, t, targets }) => {
  const k = clamp01((t - 0.08) / 0.5);
  const fade = fadeOut(t, 0.62);
  for (const c of targets) {
    const a0 = -2.5;
    const a1 = 0.45;
    const a = lerp(a0, a1, easeOut(k));
    p.arc(c.x + 1, c.y, 13, 15, a0, a, '#f4fbff', 0.9 * fade, 2);
    p.arc(c.x, c.y + 1, 10, 12, a0 + 0.3, Math.max(a0 + 0.3, a - 0.2), '#8fd4ff', 0.65 * fade, 1);
    if (k > 0 && k < 1) {
      const ex = c.x + 1 + Math.cos(a) * 13;
      const ey = c.y + Math.sin(a) * 15;
      p.diamond(ex, ey, 1, '#ffffff', fade);
    }
  }
  return {};
};

// ---------- 2. slash_heavy ----------
const slashHeavy: EffectFn = ({ p, t, targets }) => {
  const k = clamp01((t - 0.05) / 0.45);
  const k2 = clamp01((t - 0.25) / 0.45);
  const fade = fadeOut(t, 0.6);
  for (const c of targets) {
    const sweep = (a0: number, a1: number, kk: number, r: number) => {
      if (kk <= 0) return;
      const a = lerp(a0, a1, easeOut(kk));
      p.arc(c.x, c.y, r, r + 3, a0, a, '#fff6d8', fade, 3);
      p.arc(c.x, c.y, r - 3, r, a0 + 0.2, Math.max(a0 + 0.2, a - 0.1), '#ffd05a', 0.8 * fade, 2);
    };
    sweep(-2.7, 0.5, k, 19);
    sweep(0.4, -2.8, k2, 16);
  }
  const boom = t > HIT_T - 0.1 ? clamp01(1 - (t - (HIT_T - 0.1)) / 0.35) : 0;
  return {
    shake: 3 * boom,
    flash: boom > 0 ? { color: '#fff4de', alpha: 0.24 * boom } : undefined,
  };
};

// ---------- 3. bash ----------
const bash: EffectFn = ({ p, t, targets, pushes }) => {
  const fade = fadeOut(t, 0.5);
  targets.forEach((c, i) => {
    const k = easeOut(clamp01(t / 0.62));
    const r = lerp(3, 22, k);
    p.ellipseStroke(c.x, c.y, r, r * 0.82, '#ffe9b0', fade * 0.95, 2);
    p.ellipseStroke(c.x, c.y, r * 0.6, r * 0.5, '#ffffff', fade * 0.6, 1);
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2 + 0.2;
      const r0 = r * 0.9;
      const r1 = r * 1.35;
      p.line(
        c.x + Math.cos(a) * r0,
        c.y + Math.sin(a) * r0 * 0.8,
        c.x + Math.cos(a) * r1,
        c.y + Math.sin(a) * r1 * 0.8,
        '#ffd88a',
        fade * 0.8,
      );
    }
    // ผลักถอยหลัง: ตัวเรนเดอร์จะเอาทิศ (จากผู้ใช้ไปหาเป้า) มาคูณเอง
    pushes[i] = t < HIT_T ? 0 : 7 * (1 - (t - HIT_T) / (1 - HIT_T));
  });
  const boom = t > HIT_T - 0.15 ? clamp01(1 - (t - (HIT_T - 0.15)) / 0.4) : 0;
  return { shake: 2 * boom };
};

// ---------- 4. bite ----------
const bite: EffectFn = ({ p, t, targets, seed }) => {
  const close = easeIn(clamp01(t / HIT_T));
  const fade = fadeOut(t, HIT_T);
  for (const c of targets) {
    const gap = lerp(11, 2, close);
    for (const dx of [-5, 4]) {
      fang(p, c.x + dx, c.y - gap, 5, 7, true, '#fffbe8', fade);
      fang(p, c.x + dx, c.y + gap, 5, 7, false, '#fffbe8', fade);
    }
    if (t > HIT_T) {
      const g = clamp01((t - HIT_T) / (1 - HIT_T));
      for (const off of [-4, 3]) {
        p.line(c.x + off - 2, c.y - 7, c.x + off + 2, c.y + 7, '#e2404a', (1 - g) * 0.95, 2);
      }
      sparks(p, c, 6, 12, g, seed, ['#e2404a', '#ff8a6a'], 0.9);
    }
  }
  return {};
};

// ---------- 5. spin (AoE รอบตัวผู้ใช้) ----------
const spin: EffectFn = ({ p, t, from, targets, now }) => {
  const fade = fadeOut(t, 0.62);
  for (let ring = 0; ring < 3; ring++) {
    const k = clamp01((t - ring * 0.12) / 0.6);
    if (k <= 0) continue;
    const r = lerp(6, 46, easeOut(k));
    p.ellipseStroke(from.x, from.y + 6, r, r * 0.34, '#cfd8ff', fade * (1 - k) * 0.9, 1);
  }
  const spinA = (now / 42) % (Math.PI * 2);
  for (let i = 0; i < 3; i++) {
    const a = spinA + (i * Math.PI * 2) / 3;
    const r = 26 + Math.sin(t * Math.PI) * 12;
    p.arc(from.x, from.y + 2, r, r * 0.4, a, a + 1.1, '#ffffff', fade * 0.85, 2);
    p.arc(from.x, from.y + 2, r - 5, r * 0.34, a + 0.2, a + 1.0, '#9fb4ff', fade * 0.55, 1);
  }
  if (t > HIT_T - 0.2) {
    const k = clamp01((t - (HIT_T - 0.2)) / 0.4);
    for (const c of targets) {
      const a0 = -2.2;
      const a1 = 0.6;
      p.arc(c.x, c.y, 11, 13, a0, lerp(a0, a1, easeOut(k)), '#ffffff', (1 - k) * 0.9, 2);
    }
  }
  return { shake: t < 0.5 ? 1 : 0 };
};

// ---------- 6. projectile_fire ----------
const projectileFire: EffectFn = ({ p, t, from, targets, seed }) => {
  const target = targets[0] ?? { x: W / 2, y: H / 2 };
  const k = clamp01(t / HIT_T);
  if (t <= HIT_T) {
    const e = easeIn(k) * 0.35 + k * 0.65;
    const x = lerp(from.x, target.x, e);
    const y = lerp(from.y, target.y, e) - Math.sin(e * Math.PI) * 16;
    // หางไฟ
    for (let i = 1; i <= 5; i++) {
      const te = Math.max(0, e - i * 0.055);
      const tx = lerp(from.x, target.x, te);
      const ty = lerp(from.y, target.y, te) - Math.sin(te * Math.PI) * 16;
      const r = Math.max(1, 4 - i * 0.6);
      p.ellipseFill(tx, ty, r, r, i < 3 ? '#ff8a2e' : '#8f3a12', 0.75 - i * 0.11);
    }
    p.ellipseFill(x, y, 5, 5, '#ff5c28', 1);
    p.ellipseFill(x, y, 3, 3, '#ffb03c', 1);
    p.ellipseFill(x + 1, y - 1, 2, 2, '#fff6c8', 1);
    for (let i = 0; i < 4; i++) {
      const a = hash01(seed + i) * Math.PI * 2 + t * 9;
      p.px(x + Math.cos(a) * 7, y + Math.sin(a) * 6, '#ffca6a', 0.7);
    }
  } else {
    const b = clamp01((t - HIT_T) / (1 - HIT_T));
    const r = lerp(4, 26, easeOut(b));
    p.ellipseStroke(target.x, target.y, r, r * 0.9, '#ffb03c', 1 - b, 2);
    p.ellipseFill(target.x, target.y, r * 0.55, r * 0.5, '#ff5c28', (1 - b) * 0.75);
    p.ellipseFill(target.x, target.y, r * 0.3, r * 0.28, '#fff2c0', (1 - b) * 0.9);
    sparks(p, target, 14, 30, b, seed + 5, ['#ffca6a', '#ff7a2e', '#fff2c0']);
    return {
      shake: 2 * (1 - b),
      flash: { color: '#ffb85c', alpha: 0.16 * (1 - b) },
    };
  }
  return {};
};

// ---------- 7. projectile_dark ----------
const projectileDark: EffectFn = ({ p, t, from, targets, seed }) => {
  const target = targets[0] ?? { x: W / 2, y: H / 2 };
  const k = clamp01(t / HIT_T);
  if (t <= HIT_T) {
    const e = easeIn(k) * 0.25 + k * 0.75;
    const x = lerp(from.x, target.x, e);
    const y = lerp(from.y, target.y, e) - Math.sin(e * Math.PI) * 8;
    for (let i = 1; i <= 6; i++) {
      const te = Math.max(0, e - i * 0.05);
      const tx = lerp(from.x, target.x, te);
      const ty = lerp(from.y, target.y, te) - Math.sin(te * Math.PI) * 8;
      const wob = Math.sin(te * 22 + i) * 1.6;
      const r = Math.max(1, 3 - i * 0.4);
      p.ellipseFill(tx, ty + wob, r, r, i < 3 ? '#8f4ce0' : '#4a1f80', 0.7 - i * 0.09);
      p.px(tx, ty + wob + 2, '#3a1560', 0.5 - i * 0.06);
    }
    const d = dirTo(from, target);
    p.line(x - d.x * 7, y - d.y * 7, x + d.x * 5, y + d.y * 5, '#c48cff', 1, 3);
    p.diamond(x, y, 3, '#b46cff', 1);
    p.diamond(x, y, 2, '#efd6ff', 1);
    p.diamond(x, y, 1, '#ffffff', 1);
  } else {
    const b = clamp01((t - HIT_T) / (1 - HIT_T));
    const r = lerp(3, 22, easeOut(b));
    p.ellipseFill(target.x, target.y, r * 0.6, r * 0.55, '#2b0f4a', (1 - b) * 0.85);
    p.ellipseStroke(target.x, target.y, r, r * 0.85, '#b46cff', 1 - b, 2);
    p.ellipseStroke(target.x, target.y, r * 0.6, r * 0.5, '#efd6ff', (1 - b) * 0.7, 1);
    sparks(p, target, 12, 26, b, seed + 9, ['#b46cff', '#7a34c8', '#efd6ff']);
    return { flash: { color: '#6a2fb0', alpha: 0.14 * (1 - b) } };
  }
  return {};
};

// ---------- 8. rain_ice (AoE ทั้งจอ) ----------
const rainIce: EffectFn = ({ p, t, targets, seed }) => {
  const count = 46;
  for (let i = 0; i < count; i++) {
    const x = Math.round(hash01(seed + i * 3.7) * W);
    const delay = hash01(seed + i * 11.3) * 0.45;
    const k = clamp01((t - delay) / 0.55);
    if (k <= 0 || k >= 1) continue;
    const y0 = -10 + hash01(seed + i) * 20;
    const y1 = 96 + hash01(seed + i * 5.1) * 60;
    const y = lerp(y0, y1, easeIn(k) * 0.6 + k * 0.4);
    const a = 0.9 * (1 - k * 0.5);
    p.line(x, y - 5, x, y, '#9fe8ff', a * 0.55);
    p.diamond(x, y, 1, '#e8fbff', a);
    p.px(x, y + 1, '#5ab8e0', a * 0.8);
  }
  if (t > HIT_T - 0.2) {
    const b = clamp01((t - (HIT_T - 0.2)) / 0.5);
    for (const c of targets) {
      const r = lerp(2, 16, easeOut(b));
      p.ellipseStroke(c.x, c.y, r, r * 0.7, '#bfefff', 1 - b, 1);
      for (let s = 0; s < 5; s++) {
        const a = (s / 5) * Math.PI * 2;
        p.diamond(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.7, 1, '#ffffff', 1 - b);
      }
    }
  }
  return {
    shake: t < 0.3 ? 1 : 0,
    flash: { color: '#8fd8ff', alpha: 0.14 * (t < 0.35 ? t / 0.35 : fadeOut(t, 0.35)) },
  };
};

// ---------- 9. heal_ring ----------
const healRing: EffectFn = ({ p, t, targets, seed }) => {
  for (const c of targets) {
    for (let ring = 0; ring < 3; ring++) {
      const k = clamp01((t - ring * 0.16) / 0.72);
      if (k <= 0) continue;
      const y = c.y + 12 - k * 28;
      const r = lerp(13, 5, k);
      p.ellipseStroke(c.x, y, r, Math.max(2, r * 0.34), '#7dff9f', (1 - k) * 0.95, 1);
      p.ellipseStroke(c.x, y + 1, r * 0.6, Math.max(1, r * 0.2), '#d8ffe4', (1 - k) * 0.6, 1);
    }
    for (let i = 0; i < 8; i++) {
      const k = clamp01((t - hash01(seed + i * 3) * 0.4) / 0.6);
      if (k <= 0) continue;
      const x = c.x + (hash01(seed + i * 7) - 0.5) * 22 + Math.sin(k * 6 + i) * 2;
      const y = c.y + 12 - k * 32;
      p.diamond(x, y, hash01(seed + i) > 0.6 ? 1 : 0, '#c8ffd8', (1 - k) * 0.95);
    }
  }
  return {};
};

// ---------- 10. shield_dome ----------
const shieldDome: EffectFn = ({ p, t, targets }) => {
  const grow = easeOut(clamp01(t / 0.35));
  const fade = fadeOut(t, 0.62);
  const pulse = 0.75 + Math.sin(t * Math.PI * 4) * 0.25;
  for (const c of targets) {
    const rx = 20 * grow;
    const ry = 24 * grow;
    p.ellipseFill(c.x, c.y + 2, rx * 0.96, ry * 0.96, '#4aa8ff', fade * 0.16 * pulse);
    p.arc(c.x, c.y + 2, rx, ry, Math.PI, Math.PI * 2, '#9fdcff', fade * pulse, 2);
    p.arc(c.x, c.y + 2, rx * 0.72, ry * 0.72, Math.PI, Math.PI * 2, '#dff2ff', fade * 0.6 * pulse, 1);
    p.ellipseStroke(c.x, c.y + 2, rx, Math.max(2, ry * 0.22), '#9fdcff', fade * 0.55, 1);
    for (let s = 0; s < 4; s++) {
      const a = Math.PI + (s / 3) * Math.PI;
      p.diamond(c.x + Math.cos(a) * rx, c.y + 2 + Math.sin(a) * ry, 1, '#ffffff', fade * pulse);
    }
  }
  return {};
};

// ---------- 11. taunt_aura ----------
const tauntAura: EffectFn = ({ p, t, from }) => {
  const fade = fadeOut(t, 0.6);
  for (let ring = 0; ring < 3; ring++) {
    const k = clamp01((t - ring * 0.14) / 0.66);
    if (k <= 0) continue;
    const r = lerp(5, 52, easeOut(k));
    p.ellipseStroke(from.x, from.y + 12, r, r * 0.32, '#ff9a3c', (1 - k) * fade, 2);
    p.ellipseStroke(from.x, from.y + 12, r * 0.85, r * 0.27, '#ffd28a', (1 - k) * fade * 0.6, 1);
  }
  // ไอคอนโกรธเหนือหัว (วาดด้วยพิกเซล)
  const pop = clamp01(t / 0.22);
  const s = Math.round(lerp(2, 6, easeOut(pop)));
  const ix = from.x;
  const iy = from.y - 26 - Math.sin(t * Math.PI) * 3;
  const a = fade * (t < 0.85 ? 1 : (1 - t) / 0.15);
  p.line(ix - s, iy - s, ix + s, iy + s, '#ff5a3c', a, 2);
  p.line(ix + s, iy - s, ix - s, iy + s, '#ff5a3c', a, 2);
  p.line(ix - s, iy, ix + s, iy, '#ffb08a', a * 0.8, 1);
  p.line(ix, iy - s, ix, iy + s, '#ffb08a', a * 0.8, 1);
  return {};
};

// ---------- 12. roar_wave (AoE ทั้งจอ) ----------
const roarWave: EffectFn = ({ p, t, from }) => {
  const fade = fadeOut(t, 0.55);
  for (let ring = 0; ring < 4; ring++) {
    const k = clamp01((t - ring * 0.1) / 0.7);
    if (k <= 0) continue;
    const r = lerp(8, 210, easeOut(k));
    p.ellipseStroke(from.x, from.y, r, r * 0.58, '#ffd98a', (1 - k) * fade * 0.9, ring === 0 ? 3 : 2);
    p.ellipseStroke(from.x, from.y, r * 0.9, r * 0.52, '#fff4d0', (1 - k) * fade * 0.45, 1);
  }
  const boom = clamp01(1 - t / 0.6);
  return {
    shake: 3 * boom,
    flash: { color: '#ffcf8a', alpha: 0.16 * boom },
  };
};

export const EFFECTS: Record<EffectAnimation, EffectFn> = {
  slash,
  slash_heavy: slashHeavy,
  bash,
  bite,
  spin,
  projectile_fire: projectileFire,
  projectile_dark: projectileDark,
  rain_ice: rainIce,
  heal_ring: healRing,
  shield_dome: shieldDome,
  taunt_aura: tauntAura,
  roar_wave: roarWave,
};

const EFFECT_SET = new Set<string>(EFFECT_ANIMATIONS);

/** ตรวจว่าค่าที่มาจาก gamedata เป็นชื่อเอฟเฟกต์ที่รองรับจริงไหม */
export function asEffect(name: string | undefined | null): EffectAnimation | null {
  return name && EFFECT_SET.has(name) ? (name as EffectAnimation) : null;
}
