/**
 * ตัวเรนเดอร์ฉาก — วาดลง backbuffer 256x160 แล้วขยายแบบ nearest-neighbor ไปยัง canvas จริง
 * (ย้ายจาก client/src/battle/renderer.ts)
 *
 * ต่างจากของเดิมสามอย่าง เพราะเวทีย้ายเข้าการ์ดมาตรฐานที่มีอัตราส่วนคงที่ (G0 ข้อ 5.3):
 *  1. canvas จริงไม่ได้เป็น 16:10 เท่าฉากแล้ว — 16:9 บนจอกว้าง (ตัดท้องฟ้าด้านบนออก 16px ฐาน
 *     ซึ่งไม่มีใครยืนอยู่) และ 4:3 บนมือถือ (ต่อท้องฟ้าขึ้นไปด้านบน) ฉากยึดขอบล่างเสมอ
 *     เพราะผู้เล่นยืนชิดขอบล่าง ถ้ายึดกลางจะโดนตัดเท้า
 *  2. ตัวเลขลอยกับแถบเลือดเหนือหัววาดลง canvas ที่ความละเอียดจริง (ไม่ใช่ DOM ทับ)
 *     ขนาดคิดเป็น px ของจอ จึงอ่านออกทั้งบนมือถือและจอกว้าง และไม่ต้องแปลงพิกัด % ตาม object-fit
 *  3. prefers-reduced-motion: ไม่มีท่าหายใจ/จอสั่น/ตัวเลขลอยขึ้น — ภาพนิ่งล้วน
 *
 * สีของฉากเป็นสีภาพ ไม่ใช่สี UI — อยู่ในขอบเขตคำขอ exception D1
 */
import { SCENE, SIZE } from '../sprites/schema';
import { getBackground } from './background';
import { FLOAT_LIFE } from './director';
import type { BattleDirector, EntityKind, FloatNum } from './director';
import { EFFECTS } from './effects';
import { spriteBoxFor } from './layout';
import type { Slot } from './layout';
import { Pix, clamp01, easeOut } from './pixel';
import type { SpriteCache, Tint } from './spriteCache';

const W = SCENE.baseW;
const H = SCENE.baseH;

/** ความกว้างของ canvas จริง — x5 ของฉากฐาน ความสูงขึ้นกับอัตราส่วนของกรอบ */
export const STAGE_CANVAS_W = W * SCENE.scale;

const STAND_OUTER = '#2b2f50';
const STAND_MID = '#4c5484';
const STAND_TOP = '#606a99';
const STAND_ACTIVE = '#c8a13a';

const IDLE_FRAME_MS = 460;
const ACT_FRAME_MS = 150;
const HIT_SHAKE_MS = 240;
const HIT_FLASH_MS = 200;

const FLOAT_STYLE: Record<FloatNum['kind'], { color: string; size: number }> = {
  dmg: { color: '#ff9c6b', size: 18 },
  crit: { color: '#ffd23e', size: 23 },
  miss: { color: '#d8d8e8', size: 16 },
  heal: { color: '#6be08a', size: 18 },
  shield: { color: '#6ba6ff', size: 16 },
  mark: { color: '#e8c14a', size: 16 },
};

interface HpBar {
  /** จุดกึ่งกลางด้านล่างของแถบ ในพิกัดฉากฐาน */
  x: number;
  y: number;
  w: number;
  pct: number;
}

export class SceneRenderer {
  private buf: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D | null;
  private pix: Pix | null;
  /** ฟอนต์ของหน้า (Noto Sans Thai) — อ่านจาก computed style เพราะชื่อ family ของ next/font ถูก hash */
  fontFamily = 'sans-serif';

  constructor(private readonly cache: SpriteCache) {
    this.buf = document.createElement('canvas');
    this.buf.width = W;
    this.buf.height = H;
    this.bctx = this.buf.getContext('2d');
    if (this.bctx) {
      this.bctx.imageSmoothingEnabled = false;
      this.pix = new Pix(this.bctx);
    } else {
      this.pix = null;
    }
  }

  /**
   * @param cssScale จำนวน px ของ canvas ต่อ 1 px บนจอ — ใช้ตั้งขนาดตัวเลข/แถบให้คงที่ตามจอ
   */
  draw(out: CanvasRenderingContext2D, dir: BattleDirector, cssScale: number): void {
    const b = this.bctx;
    const p = this.pix;
    if (!b || !p) return;
    const reduced = dir.reduced;

    // ---- จอสั่น/แฟลช: อ่านผลจากเฟรมก่อนหน้าของเอฟเฟกต์ที่ยังทำงานอยู่ ----
    let shake = 0;
    let flash: { color: string; alpha: number } | null = null;
    if (!reduced) {
      for (const e of dir.fx) {
        if (e.outShake > shake) shake = e.outShake;
        if (e.outFlash && (!flash || e.outFlash.alpha > flash.alpha)) flash = e.outFlash;
      }
    }
    const sx = shake > 0 ? Math.round(Math.sin(dir.clock * 0.09) * shake) : 0;
    const sy = shake > 0 ? Math.round(Math.cos(dir.clock * 0.13) * shake * 0.6) : 0;

    b.globalAlpha = 1;
    b.clearRect(0, 0, W, H);
    b.drawImage(getBackground(), 0, 0);

    b.save();
    b.translate(sx, sy);

    // ---- เรียงตามความลึก: ไกล (y น้อย) วาดก่อน ----
    const ids = [...dir.slots.keys()].filter((id) => dir.play.combatants[id]);
    ids.sort((a, c) => (dir.slotOf(a)?.y ?? 0) - (dir.slotOf(c)?.y ?? 0));

    for (const id of ids) {
      const slot = dir.slotOf(id);
      if (!slot) continue;
      this.drawStand(p, slot, id === dir.play.activeActor);
    }
    const bars: HpBar[] = [];
    for (const id of ids) {
      const bar = this.drawEntity(b, p, dir, id, reduced);
      if (bar) bars.push({ ...bar, x: bar.x + sx, y: bar.y + sy });
    }

    // ---- เอฟเฟกต์ ----
    for (const e of dir.fx) {
      const fn = EFFECTS[e.name];
      if (!fn) continue;
      const t = Math.min(1, e.elapsed / e.dur);
      const res = fn({ p, t, now: dir.clock, from: e.from, targets: e.targets, pushes: e.pushes, seed: e.seed });
      e.outShake = res?.shake ?? 0;
      e.outFlash = res?.flash ?? null;
      // ส่งแรงผลักกลับไปที่ตัวละครเป้า
      e.targetIds.forEach((tid, i) => {
        const amount = e.pushes[i] ?? 0;
        if (amount <= 0) return;
        const fx = dir.ents.get(tid);
        if (!fx) return;
        const tp = e.targets[i];
        const dx = tp.x - e.from.x;
        const dy = tp.y - e.from.y;
        const len = Math.hypot(dx, dy) || 1;
        fx.push = amount;
        fx.pushDir = { x: dx / len, y: dy / len };
      });
    }

    b.restore();

    // ---- ขยายไป canvas จริง (ยึดขอบล่าง) ----
    const outW = out.canvas.width;
    const outH = out.canvas.height;
    const k = outW / W;
    const sceneH = H * k;
    const oy = outH - sceneH;

    out.imageSmoothingEnabled = false;
    out.globalAlpha = 1;
    out.clearRect(0, 0, outW, outH);
    if (oy > 0) {
      // กรอบสูงกว่าฉาก (4:3 บนมือถือ) — ยืดแถวบนสุดของท้องฟ้าขึ้นไปให้ต่อกันเนียน
      out.drawImage(this.buf, 0, 0, W, 1, 0, 0, outW, Math.ceil(oy));
    }
    out.drawImage(this.buf, 0, 0, W, H, 0, oy, outW, sceneH);

    if (flash && flash.alpha > 0.01) {
      // เพดานความสว่าง กันเอฟเฟกต์กลบฉากจนดูไม่ออกว่าใครอยู่ตรงไหน
      out.globalAlpha = Math.min(0.35, flash.alpha);
      out.fillStyle = flash.color;
      out.fillRect(0, 0, outW, outH);
      out.globalAlpha = 1;
    }

    this.drawBars(out, bars, k, oy, cssScale);
    this.drawFloats(out, dir, k, oy, cssScale, reduced);
  }

  private drawStand(p: Pix, slot: Slot, active: boolean): void {
    p.ellipseFill(slot.x, slot.y, slot.rx + 1, slot.ry + 1, STAND_OUTER, 1);
    p.ellipseFill(slot.x, slot.y - 1, slot.rx, slot.ry, STAND_MID, 1);
    p.ellipseFill(slot.x, slot.y - 1, Math.max(2, slot.rx - 4), Math.max(1, slot.ry - 1), STAND_TOP, 1);
    if (active) {
      p.ellipseStroke(slot.x, slot.y, slot.rx + 2, slot.ry + 1, STAND_ACTIVE, 0.85, 1);
    }
  }

  /** คืนตำแหน่งแถบเลือดเหนือหัว (ตัวที่ล้มแล้วไม่มีแถบ) */
  private drawEntity(
    b: CanvasRenderingContext2D,
    p: Pix,
    dir: BattleDirector,
    id: string,
    reduced: boolean,
  ): HpBar | null {
    const slot = dir.slotOf(id);
    const c = dir.play.combatants[id];
    const fx = dir.ents.get(id);
    if (!slot || !c || !fx) return null;

    const kind: EntityKind = dir.kindOf(id);
    const box = spriteBoxFor(kind);
    const spriteId = this.cache.resolve(dir.spriteCandidates(id));

    // ---- เลือกเฟรม ----
    let frame = 0;
    if (fx.anim === 'idle') frame = reduced ? 0 : Math.floor(dir.clock / IDLE_FRAME_MS);
    else if (fx.anim === 'act') frame = Math.floor(fx.animT / ACT_FRAME_MS);
    else if (fx.anim === 'down') frame = 999;

    // ---- ออฟเซ็ต: เขย่าตอนโดนตี + ผลัก + พุ่งเข้าหาเป้า + หายใจ ----
    let ox = 0;
    let oy = 0;
    if (!reduced) {
      if (fx.hitT < HIT_SHAKE_MS) {
        const k = 1 - fx.hitT / HIT_SHAKE_MS;
        ox += Math.round(Math.sin(fx.hitT * 0.08) * 3 * k);
        oy += Math.round(Math.cos(fx.hitT * 0.11) * 1.5 * k);
      }
      if (fx.push > 0) {
        ox += Math.round(fx.pushDir.x * fx.push);
        oy += Math.round(fx.pushDir.y * fx.push);
      }
      if (fx.lunge > 0 && (fx.anim === 'act' || fx.animT < 400)) {
        const reach = kind === 'player' ? 5 : 4;
        ox += Math.round(fx.lungeDir.x * reach * fx.lunge);
        oy += Math.round(fx.lungeDir.y * reach * fx.lunge);
      }
      if (fx.anim === 'idle' && c.alive) {
        oy += Math.sin(dir.clock / 520 + fx.bob) > 0.4 ? -1 : 0;
      }
    }

    const handle = this.cache.get(spriteId, fx.anim, frame, box.w, box.h, 'none');
    // บอสที่ยังไม่มีสไปรต์เฉพาะตัว → ยืมของ archetype แล้วขยายให้ใหญ่ขึ้น (ตามสัญญาใน schema)
    const mag = kind === 'boss' && spriteId?.startsWith('mon:') && handle.h > 0 ? Math.max(1, SIZE.boss.h / handle.h) : 1;
    const dw = Math.round(handle.w * mag);
    const dh = Math.round(handle.h * mag);
    const dx = Math.round(slot.x - dw / 2) + ox;
    const footPad = kind === 'player' ? 3 : 2;
    const dy = Math.round(slot.y - dh + footPad) + oy;

    if (!c.alive) {
      // ล้มแล้ว: จมลงบนแท่น + สีหม่น
      const dead = this.cache.get(spriteId, 'down', frame, box.w, box.h, 'dark');
      b.globalAlpha = 0.62;
      b.drawImage(dead.canvas, 0, 0, dead.w, dead.h, dx, dy + 2, dw, dh);
      b.globalAlpha = 1;
      return null;
    }

    b.drawImage(handle.canvas, 0, 0, handle.w, handle.h, dx, dy, dw, dh);

    // แฟลชแดงตอนโดนตี
    if (fx.hitT < HIT_FLASH_MS) {
      const a = 0.85 * (1 - fx.hitT / HIT_FLASH_MS);
      const red: Tint = 'red';
      const tinted = this.cache.get(spriteId, fx.anim, frame, box.w, box.h, red);
      b.globalAlpha = a;
      b.drawImage(tinted.canvas, 0, 0, tinted.w, tinted.h, dx, dy, dw, dh);
      b.globalAlpha = 1;
    }

    // มงกุฎบอส (วาดด้วยพิกเซล ไม่ต้องพึ่งสไปรต์)
    if (c.isBoss) {
      const cx = dx + Math.round(dw / 2);
      const cy = dy - 4;
      p.fill(cx - 4, cy + 2, 9, 2, '#e8c14a');
      p.fill(cx - 4, cy, 2, 2, '#e8c14a');
      p.fill(cx + 3, cy, 2, 2, '#e8c14a');
      p.fill(cx - 1, cy - 1, 2, 3, '#ffe98a');
    }

    // สไปรต์ยังไม่มีในชีต → ขีดเส้นใต้กล่อง placeholder ให้เห็นชัดว่าเป็นของชั่วคราว
    if (!handle.real) {
      p.fill(dx, dy + dh, dw, 1, '#ff3ea5', 0.9);
    }

    const pct = c.maxHp > 0 ? clamp01(c.hp / c.maxHp) : 0;
    return {
      x: dx + dw / 2,
      y: dy - (c.isBoss ? 7 : 3),
      w: kind === 'player' ? 26 : kind === 'boss' ? 26 : 18,
      pct,
    };
  }

  /** แถบเลือดเหนือหัว — ช่วยจับคู่ "ตัวในฉาก" กับรายชื่อศัตรูใต้เวทีเมื่อมีมอนชนิดเดียวกันหลายตัว */
  private drawBars(out: CanvasRenderingContext2D, bars: HpBar[], k: number, oy: number, cssScale: number): void {
    const h = Math.max(3, Math.round(5 * cssScale));
    const pad = Math.max(1, Math.round(1 * cssScale));
    for (const bar of bars) {
      const w = Math.round(bar.w * k);
      const x = Math.round(bar.x * k - w / 2);
      const y = Math.round(bar.y * k + oy - h);
      out.fillStyle = '#0a0b16';
      out.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
      out.fillStyle = bar.pct <= 0.25 ? '#e05a5a' : bar.pct <= 0.55 ? '#e0b84a' : '#5ec584';
      out.fillRect(x, y, Math.round(w * bar.pct), h);
    }
  }

  private drawFloats(
    out: CanvasRenderingContext2D,
    dir: BattleDirector,
    k: number,
    oy: number,
    cssScale: number,
    reduced: boolean,
  ): void {
    if (dir.play.floats.length === 0) return;
    out.save();
    out.textAlign = 'center';
    out.textBaseline = 'alphabetic';
    out.lineJoin = 'round';
    for (const f of dir.play.floats) {
      const t = clamp01((dir.clock - f.born) / FLOAT_LIFE);
      const style = FLOAT_STYLE[f.kind];
      // ภาพนิ่ง: ตัวเลขอยู่กับที่ ทึบตลอดอายุ · ปกติ: ลอยขึ้น 42px แล้วจางหาย
      const rise = reduced ? 0 : 42 * easeOut(t) * cssScale;
      const alpha = reduced ? 1 : t < 0.15 ? t / 0.15 : 1 - clamp01((t - 0.55) / 0.45);
      if (alpha <= 0.01) continue;
      const size = Math.round(style.size * cssScale);
      out.font = `800 ${size}px ${this.fontFamily}`;
      out.globalAlpha = alpha;
      const x = f.x * k;
      const y = f.y * k + oy - rise;
      out.lineWidth = Math.max(2, Math.round(4 * cssScale));
      out.strokeStyle = 'rgba(0,0,0,0.9)';
      out.strokeText(f.text, x, y);
      out.fillStyle = style.color;
      out.fillText(f.text, x, y);
    }
    out.restore();
  }
}
