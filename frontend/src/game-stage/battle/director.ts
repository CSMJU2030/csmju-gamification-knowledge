/**
 * ตัวกำกับฉากต่อสู้ — เดินไทม์ไลน์จาก event queue ของเอนจิน แล้วสั่งแอนิเมชัน
 * (ย้ายจาก client/src/battle/director.ts — เปลี่ยนแค่ import/type ให้ตรง API ใหม่ + โหมดทีละเทิร์น)
 *
 * ไทม์ไลน์ต่อ 1 event (หน่วยเป็น ms ที่ความเร็ว x1 ตาม TIMING):
 *   windup(180)  ผู้กระทำเข้าท่า act
 *   effect(420)  เอฟเฟกต์สกิลวิ่ง
 *   impact(160)  เป้าเข้าสถานะ hit + ตัวเลขลอย + อัปเดต HP + ขึ้น log
 *   settle(140)  กลับสู่ idle
 * ตัวเรียกใช้คูณ dt ด้วย speed multiplier ก่อนส่งเข้า advance() → x2 เร็วขึ้นทั้งระบบ
 *
 * โหมด "ทันที" (instant) ใช้กับสองกรณี: ผู้ใช้ตั้ง prefers-reduced-motion และปุ่ม → (เทิร์นถัดไป)
 * — ลงผลของ event ทั้งก้อนในเฟรมเดียวแล้วค้างภาพนิ่งไว้ ไม่มีท่าเข้า/เอฟเฟกต์/จอสั่นกลางเทิร์น
 *
 * สถานะเกม (HP/log/ดรอป) ยังคำนวณจาก event เดิมทุกอย่าง — เปลี่ยนแค่ "จังหวะ" ที่ลงมือ
 */
import type { AnimState, EffectAnimation } from '../sprites/schema';
import { TIMING } from '../sprites/schema';
import { isFallbackLine } from '../blox/schema';
import type { CombatEvent, SkillDef } from '@/lib/api/types';
import { fmt } from '@/lib/game/labels';
import { MAX_WAVE, describeEvent } from './battle-log';
import type { LogKind } from './battle-log';
import { HIT_T, asEffect } from './effects';
import { PLAYER_SLOT, anchorOf, enemySlots, spriteBoxFor, spriteIdCandidates } from './layout';
import type { Slot } from './layout';
import type { Vec } from './pixel';

export { MAX_WAVE };
export const PLAYER_KEY = '__player__';
/** actorId ที่เอนจินใช้กับ event ของระบบ (wave_start / wave_clear) — ไม่ใช่ตัวละครในฉาก */
const SYSTEM_ACTOR = 'system';

/** ค้างจอตอนขึ้นเวฟใหม่ / เคลียร์เวฟ (ms ที่ x1) */
const WAVE_START_HOLD = 950;
const WAVE_CLEAR_HOLD = 700;
/** ค้างภาพนิ่งหลังลงผลแบบทันที — โหมดลดการเคลื่อนไหวต้องนานพอให้อ่านตัวเลขทัน */
const STILL_HOLD = 1200;
/** ค้างหลังกด → ระหว่างเล่นอยู่ — สั้นกว่าภาพนิ่ง เพราะผู้ใช้เป็นคนเร่งเอง */
const STEP_HOLD = 450;
export const FLOAT_LIFE = 1100;
/** เก็บบันทึกย้อนหลังได้เท่านี้ — พอสำหรับการรบ 10 เวฟเต็ม ๆ โดยไม่ให้ DOM โตไม่รู้จบ */
const LOG_CAP = 600;
/** สกิลที่ไม่มี animation ใน game-data → ใช้ท่าโจมตีปกติ */
const BASIC_ATTACK: EffectAnimation = 'slash';

/**
 * สกิลที่ตัวกำกับต้องรู้จัก — รวม `SkillDef` เต็มจาก game-data กับ `SkillSummary` ย่อของตัวละคร
 * (ตัวย่อไม่มี animation จึงเป็น optional)
 */
export type StageSkill = Pick<SkillDef, 'id' | 'nameTh' | 'mpCost' | 'kind' | 'aoe'> & { animation?: string };

export interface CombatantView {
  id: string;
  name: string;
  side: 'party' | 'enemy';
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  isBoss: boolean;
  alive: boolean;
  /** รอบ 2M: มอนตัวนี้ตั้งท่าอยู่ — เทิร์นหน้าของมันจะทุบคนที่หมายไว้ */
  windingUp?: boolean;
  /** รอบ 2M: id ของมอนที่หมายหัวตัวนี้อยู่ (ว่าง = ไม่ถูกหมาย) = has_debuff("marked") ในโค้ด */
  markedBy?: string[];
}

/** สกิลทุบของกลไกหมายหัว (engine/src/battle.ts CRUSH_SKILL_ID) */
const CRUSH_SKILL_ID = 'mon_crush';

export interface FloatNum {
  id: number;
  combatantId: string;
  text: string;
  kind: 'dmg' | 'crit' | 'miss' | 'heal' | 'shield' | 'mark' | 'mp';
  /** พิกัดในระบบฉาก 256x160 */
  x: number;
  y: number;
  born: number;
}

export interface LogLine {
  id: number;
  text: string;
  kind: LogKind;
}

/**
 * บรรทัดโค้ดที่ทำให้เกิดสิ่งที่กำลังเล่นอยู่ (เฟส 2B-2 · blox/schema.ts §7)
 *
 * ทำไมต้องมี `active`: ไทม์ไลน์สลับระหว่างเทิร์นผู้เล่นกับเทิร์นมอนสเตอร์
 * มอนสเตอร์ก็ขับด้วยโปรแกรม และส่ง `line` มาเหมือนกัน
 * ถ้าไฮไลต์ตาม event ทุกตัวจะกลายเป็นชี้บรรทัดในโปรแกรม "คนละตัว" กับที่แสดงอยู่
 * จึงจับเฉพาะ event ที่ผู้กระทำอยู่ฝั่ง party และดับไฟ (active=false) เมื่อถึงตามอน
 * — ยังคงค่าบรรทัดล่าสุดไว้ เพื่อให้แผงไม่กะพริบว่างตอนสลับเทิร์น
 */
export interface CodeHighlight {
  /** บรรทัดในโปรแกรมของผู้เล่น (1-based) — undefined/0 = การกระทำสำรอง */
  line?: number;
  /** true = โปรแกรมไม่ได้สั่งอะไรเทิร์นนั้น ระบบเลยตีให้ (isFallbackLine) */
  fallback: boolean;
  /** true = event ของผู้เล่นกำลังเล่นอยู่ตอนนี้ */
  active: boolean;
  /** คำเตือนตอนรันโปรแกรมของเทิร์นนั้น เช่น "MP ไม่พอสำหรับ blizzard" */
  warnings: string[];
  /** นับขึ้นทุกครั้งที่เริ่มเทิร์นของผู้เล่น — บอกผู้ใช้ว่าเป็นเทิร์นใหม่แม้บรรทัดเดิมซ้ำ */
  nonce: number;
}

export interface PlayState {
  wave: number;
  combatants: Record<string, CombatantView>;
  partyOrder: string[];
  enemyOrder: string[];
  log: LogLine[];
  floats: FloatNum[];
  activeActor: string | null;
  /** null = ยังไม่มีเทิร์นของผู้เล่นเกิดขึ้นเลย */
  code: CodeHighlight | null;
  nextId: number;
}

/**
 * สองฝั่งของการดวล (รอบ 2W §5) — ต้องบอกตัวกำกับฉากล่วงหน้า **ก่อน** เดินไทม์ไลน์
 *
 * เหตุผล: event log ของ `runDuel` ไม่ได้ประกาศทั้งสองฝั่งเหมือน wave_start ของหอคอย
 * มันจับฝั่งที่ id น้อยกว่าเป็น "ปาร์ตี้" เสมอ ซึ่ง**อาจเป็นคู่ต่อสู้ ไม่ใช่ผู้เล่น**
 * ถ้าปล่อยให้เดาฝั่งจาก event เหมือนการรบปกติ ตัวผู้เล่นเองจะไปโผล่ในช่องศัตรู
 *
 * `maxHp` ทั้งคู่ต้องมาจากภายนอกด้วย เพราะการดวลขยายเลือดด้วย `balance.duelHpMult`
 * ของ engine — ตัวเลขในหน้าตัวละครจึงไม่ใช่เลือดที่ใช้จริงในสนามดวล
 */
export interface DuelSides {
  /** id ของผู้เล่นที่กำลังดู ใน event log ของการดวล */
  selfId: string;
  selfMaxHp: number;
  opponentId: string;
  opponentName: string;
  opponentClassId: string;
  opponentMaxHp: number;
}

export interface DirectorCtx {
  /** ชื่อตัวละครของผู้เล่น (displayName) — ใช้จับว่า event ไหนเป็นฝั่งผู้เล่น */
  username: string;
  classId: string;
  maxHp: number;
  maxMp: number;
  skills: StageSkill[];
  /** เว้นไว้ = การรบกับมอนตามปกติ · ใส่ = ฉากดวลกับผู้เล่นอีกคน */
  duel?: DuelSides;
  /** จำนวนเวฟทั้งหมดของฉากนี้ (เว้นไว้ = 10) */
  waveTotal?: number;
}

export interface EntFx {
  anim: AnimState;
  /** ms ตั้งแต่เริ่มสถานะปัจจุบัน */
  animT: number;
  /** ms ตั้งแต่โดนตีครั้งล่าสุด (สั่น+กะพริบแดง) */
  hitT: number;
  /** แรงผลักถอยหลัง (พิกเซล) + ทิศ */
  push: number;
  pushDir: Vec;
  /** ระยะพุ่งเข้าหาเป้าตอน act */
  lunge: number;
  lungeDir: Vec;
  bob: number;
}

export interface ActiveEffect {
  name: EffectAnimation;
  from: Vec;
  targets: Vec[];
  targetIds: string[];
  pushes: number[];
  elapsed: number;
  dur: number;
  seed: number;
  /** ผลลัพธ์เฟรมล่าสุด (จอสั่น/แฟลช) — ตัวเรนเดอร์อ่านต่อในเฟรมถัดไป */
  outShake: number;
  outFlash: { color: string; alpha: number } | null;
}

type Phase = 'boot' | 'windup' | 'effect' | 'impact' | 'settle' | 'hold';

export type EntityKind = 'player' | 'monster' | 'boss';

const zeroFx = (): EntFx => ({
  anim: 'idle',
  animT: 0,
  hitT: Number.POSITIVE_INFINITY,
  push: 0,
  pushDir: { x: 0, y: 0 },
  lunge: 0,
  lungeDir: { x: 0, y: 0 },
  bob: Math.random() * Math.PI * 2,
});

export class BattleDirector {
  readonly play: PlayState;
  readonly ents = new Map<string, EntFx>();
  readonly slots = new Map<string, Slot>();
  readonly fx: ActiveEffect[] = [];
  clock = 0;
  done = false;
  /** prefers-reduced-motion — ทุก event ลงผลทันทีแล้วค้างเป็นภาพนิ่ง ตัวเรนเดอร์ก็หยุดท่าหายใจ/จอสั่น */
  reduced = false;

  private idx = 0;
  private phase: Phase = 'boot';
  private remain = 0;
  private dirty = false;
  private seed = 1;

  constructor(
    private readonly events: CombatEvent[],
    private ctx: DirectorCtx,
    private readonly onChange: () => void,
  ) {
    // ฉากดวลรู้ id จริงของทั้งสองฝั่งตั้งแต่ต้น จึงไม่ต้องใช้ placeholder แล้ว re-key ทีหลัง
    const selfId = ctx.duel ? ctx.duel.selfId : PLAYER_KEY;
    this.play = {
      wave: 0,
      combatants: {
        [selfId]: {
          id: selfId,
          name: ctx.username,
          side: 'party',
          hp: ctx.maxHp,
          maxHp: ctx.maxHp,
          mp: ctx.maxMp,
          maxMp: ctx.maxMp,
          isBoss: false,
          alive: true,
        },
      },
      partyOrder: [selfId],
      enemyOrder: [],
      log: [],
      floats: [],
      activeActor: null,
      code: null,
      nextId: 1,
    };
    this.ents.set(selfId, zeroFx());
    this.slots.set(selfId, PLAYER_SLOT);

    if (ctx.duel) {
      const d = ctx.duel;
      this.play.combatants[d.opponentId] = {
        id: d.opponentId,
        name: d.opponentName,
        side: 'enemy',
        hp: d.opponentMaxHp,
        maxHp: d.opponentMaxHp,
        mp: 0,
        maxMp: 0,
        isBoss: false,
        alive: true,
      };
      this.play.enemyOrder = [d.opponentId];
      this.ents.set(d.opponentId, zeroFx());
      this.relayoutEnemies();
    }
  }

  // ---------------- public ----------------

  /** อัปเดต ctx ระหว่างทาง (เช่น game-data โหลดเสร็จทีหลัง) โดยไม่รีเซ็ตฉาก */
  updateCtx(ctx: DirectorCtx): void {
    this.ctx = ctx;
  }

  /** จำนวน event ทั้งหมด / ที่เล่นไปแล้ว — ใช้แสดงความคืบหน้าให้ผู้ใช้เห็น */
  get total(): number {
    return this.events.length;
  }

  get position(): number {
    return Math.min(this.idx + (this.phase === 'boot' ? 0 : 1), this.events.length);
  }

  kindOf(id: string): EntityKind {
    const c = this.play.combatants[id];
    if (!c) return 'monster';
    if (c.side === 'party') return 'player';
    // ฝั่งตรงข้ามในการดวลเป็นตัวละครของผู้เล่น ไม่ใช่มอน — ต้องได้กล่องสไปรต์ขนาดคน
    if (this.ctx.duel?.opponentId === id) return 'player';
    return c.isBoss ? 'boss' : 'monster';
  }

  spriteCandidates(id: string): string[] {
    const c = this.play.combatants[id];
    if (!c) return [];
    if (c.side === 'party') return [`class:${this.ctx.classId}`];
    // id ของคู่ดวลเป็น `u<seq>`/`s<seq>` ซึ่ง spriteIdCandidates อ่านไม่ออก
    // (มันถอดรูปแบบ id ของมอน) — คู่ดวลใช้สไปรต์ตามอาชีพของเขาเหมือนตัวผู้เล่นเอง
    if (this.ctx.duel?.opponentId === id) return [`class:${this.ctx.duel.opponentClassId}`];
    return spriteIdCandidates(id);
  }

  advance(dt: number): void {
    if (dt <= 0) return;
    this.clock += dt;
    this.tickFx(dt);

    let budget = dt;
    let guard = 0;
    while (!this.done && budget > 0 && guard++ < 400) {
      if (this.remain > budget) {
        this.remain -= budget;
        budget = 0;
        break;
      }
      budget -= this.remain;
      this.remain = 0;
      this.nextPhase();
    }
    this.flush();
  }

  /**
   * ปุ่ม → : ถ้ากำลังเล่นท่าของ event ปัจจุบันอยู่ = ข้ามแอนิเมชันให้จบทันที
   * ถ้า event ปัจจุบันลงผลไปแล้ว = ข้ามไปลงผล event ถัดไปทันที (หยุดอยู่ก็กดทีละครั้งได้)
   */
  stepEvent(): void {
    if (this.done) return;
    this.fx.length = 0;
    if (this.phase === 'windup' || this.phase === 'effect') {
      this.impact();
      this.settle();
      for (const fx of this.ents.values()) fx.hitT = Number.POSITIVE_INFINITY;
      this.phase = 'hold';
      this.remain = STEP_HOLD;
    } else {
      if (this.phase !== 'boot') this.idx++;
      // ตอนหยุดอยู่ นาฬิกาไม่เดิน ตัวเลขของเทิร์นก่อน ๆ จะค้างทับกันบนจอ — ล้างทิ้ง ให้เห็นแค่ของเทิร์นนี้
      this.play.floats = [];
      this.beginEvent(true);
    }
    this.dirty = true;
    this.flush();
  }

  /** ข้ามไปผลลัพธ์: ยิง event ที่เหลือทั้งหมดทันที แล้วหยุดที่สถานะสุดท้าย */
  skip(): void {
    if (this.done) return;
    // event ปัจจุบันลงผลไปแล้วถ้าผ่านจังหวะ impact มาแล้ว — ห้ามลงซ้ำ ไม่งั้น log ซ้ำสองบรรทัด
    const applied = this.phase === 'impact' || this.phase === 'settle' || this.phase === 'hold';
    const from = applied ? this.idx + 1 : this.idx;
    for (let i = from; i < this.events.length; i++) {
      this.registerEvent(this.events[i]);
      this.applyEvent(this.events[i]);
    }
    this.idx = this.events.length;
    this.fx.length = 0;
    this.play.floats = [];
    this.play.activeActor = null;
    // ข้ามฉาก = ไม่มีบรรทัดไหน "กำลังทำงาน" อีก (ผลลัพธ์ขึ้นแล้ว)
    this.play.code = null;
    for (const [id, fx] of this.ents) {
      const c = this.play.combatants[id];
      fx.anim = c && !c.alive ? 'down' : 'idle';
      fx.animT = 0;
      fx.hitT = Number.POSITIVE_INFINITY;
      fx.push = 0;
      fx.lunge = 0;
    }
    this.done = true;
    this.dirty = false;
    this.onChange();
  }

  // ---------------- timeline ----------------

  private flush(): void {
    if (this.dirty) {
      this.dirty = false;
      this.onChange();
    }
  }

  private tickFx(dt: number): void {
    for (const fx of this.ents.values()) {
      fx.animT += dt;
      if (fx.hitT !== Number.POSITIVE_INFINITY) fx.hitT += dt;
      if (fx.push > 0) fx.push = Math.max(0, fx.push - dt * 0.02);
      if (fx.lunge > 0) fx.lunge = Math.max(0, fx.lunge - dt * 0.0016);
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const e = this.fx[i];
      e.elapsed += dt;
      if (e.elapsed >= e.dur) this.fx.splice(i, 1);
    }
    const before = this.play.floats.length;
    if (before > 0) {
      this.play.floats = this.play.floats.filter((f) => this.clock - f.born < FLOAT_LIFE);
      if (this.play.floats.length !== before) this.dirty = true;
    }
  }

  private nextPhase(): void {
    switch (this.phase) {
      case 'windup':
        this.spawnEffect();
        this.phase = 'effect';
        this.remain = TIMING.effect;
        break;
      case 'effect':
        this.impact();
        this.phase = 'impact';
        this.remain = TIMING.impact;
        break;
      case 'impact':
        this.settle();
        this.phase = 'settle';
        this.remain = TIMING.settle;
        break;
      case 'boot':
        this.beginEvent(this.reduced);
        break;
      default:
        this.idx++;
        this.beginEvent(this.reduced);
        break;
    }
  }

  private beginEvent(instant: boolean): void {
    if (this.idx >= this.events.length) {
      this.done = true;
      this.play.activeActor = null;
      this.dimCode();
      this.dirty = true;
      return;
    }
    const ev = this.events[this.idx];

    if (ev.note === 'wave_start' || ev.note === 'wave_clear') {
      this.registerEvent(ev);
      this.applyEvent(ev);
      this.dimCode();
      this.play.activeActor = null;
      this.phase = 'hold';
      this.remain = ev.note === 'wave_start' ? WAVE_START_HOLD : WAVE_CLEAR_HOLD;
      return;
    }

    this.registerEvent(ev);
    const actorId = this.actorKey(ev);
    this.play.activeActor = actorId;
    this.markCode(ev, actorId);
    this.dirty = true;

    // wait(): ไม่มีท่าและไม่มีเป้า — ลงผลทันที (หลอด MP ขยับ + ตัวเลข MP ที่ฟื้นลอยขึ้น) แล้วค้างสั้น ๆ
    if (ev.action === 'wait') {
      this.applyEvent(ev);
      this.phase = 'hold';
      this.remain = this.reduced ? STILL_HOLD : STEP_HOLD;
      return;
    }

    if (instant) {
      // ลงผลทั้งก้อน แล้วค้างภาพนิ่ง — ผู้กระทำยังมีวงไฮไลต์บนแท่นให้รู้ว่าใครเพิ่งลงมือ
      this.impact();
      for (const [id, fx] of this.ents) {
        const c = this.play.combatants[id];
        fx.anim = c && !c.alive ? 'down' : 'idle';
        fx.animT = 0;
        fx.lunge = 0;
        fx.push = 0;
        // ภาพนิ่งไม่มีแฟลชแดง — ถ้าหยุดดูอยู่ แฟลชจะค้างทั้งตัวจนดูเหมือนสไปรต์เสีย
        fx.hitT = Number.POSITIVE_INFINITY;
      }
      this.phase = 'hold';
      this.remain = this.reduced ? STILL_HOLD : STEP_HOLD;
      return;
    }

    const fx = this.ents.get(actorId);
    if (fx && fx.anim !== 'down') {
      fx.anim = 'act';
      fx.animT = 0;
      fx.lunge = 1;
      const target = ev.targets[0] ? this.anchor(ev.targets[0].id) : null;
      const self = this.anchor(actorId);
      if (target && self) {
        const dx = target.x - self.x;
        const dy = target.y - self.y;
        const len = Math.hypot(dx, dy) || 1;
        fx.lungeDir = { x: dx / len, y: dy / len };
      } else {
        fx.lungeDir = { x: 0, y: -1 };
      }
    }
    this.phase = 'windup';
    this.remain = TIMING.actWindup;
  }

  private spawnEffect(): void {
    const ev = this.events[this.idx];
    if (!ev) return;
    const actorId = this.actorKey(ev);
    const from = this.anchor(actorId) ?? { x: PLAYER_SLOT.x, y: PLAYER_SLOT.y - 20 };

    const ids: string[] = [];
    const points: Vec[] = [];
    for (const t of ev.targets) {
      const a = this.anchor(t.id);
      if (!a) continue;
      ids.push(t.id);
      points.push(a);
    }
    if (points.length === 0) {
      // ท่าที่ไม่มีเป้า (เช่น ตั้งท่าป้องกัน) → ใช้ตัวเองเป็นเป้า
      ids.push(actorId);
      points.push(from);
    }

    this.fx.push({
      name: this.effectFor(ev),
      from,
      targets: points,
      targetIds: ids,
      pushes: points.map(() => 0),
      elapsed: 0,
      dur: TIMING.effect + TIMING.impact,
      seed: (this.seed = (this.seed * 16807) % 2147483647),
      outShake: 0,
      outFlash: null,
    });
  }

  private impact(): void {
    const ev = this.events[this.idx];
    if (!ev) return;
    this.applyEvent(ev);
    for (const t of ev.targets) {
      const fx = this.ents.get(t.id);
      const c = this.play.combatants[t.id];
      if (!fx || !c) continue;
      if (t.killed || !c.alive) {
        fx.anim = 'down';
        fx.animT = 0;
        fx.hitT = 0;
      } else if (!t.evaded && (t.damage ?? 0) > 0) {
        fx.anim = 'hit';
        fx.animT = 0;
        fx.hitT = 0;
      }
    }
  }

  private settle(): void {
    for (const [id, fx] of this.ents) {
      const c = this.play.combatants[id];
      if (c && !c.alive) {
        fx.anim = 'down';
        continue;
      }
      if (fx.anim === 'act' || fx.anim === 'hit') {
        fx.anim = 'idle';
        fx.animT = 0;
      }
    }
    this.play.activeActor = null;
    this.dirty = true;
  }

  // ---------------- ไฮไลต์บรรทัดโค้ด ----------------

  /**
   * เริ่มเทิร์นใหม่ — ติดไฟบรรทัดที่ตัดสินใจ ถ้าผู้กระทำคือฝั่งผู้เล่นเท่านั้น
   * เทิร์นของมอนสเตอร์แค่ดับไฟ เพราะมันใช้โปรแกรมคนละตัวกับที่เราแสดงอยู่
   */
  private markCode(ev: CombatEvent, actorId: string): void {
    if (this.play.combatants[actorId]?.side !== 'party') {
      this.dimCode();
      return;
    }
    this.play.code = {
      ...(ev.line !== undefined ? { line: ev.line } : {}),
      fallback: isFallbackLine(ev.line),
      active: true,
      warnings: ev.codeWarnings ?? [],
      nonce: (this.play.code?.nonce ?? 0) + 1,
    };
  }

  /** ไม่ใช่เทิร์นของผู้เล่นแล้ว — คงบรรทัดล่าสุดไว้แต่ไม่ใช่ "กำลังทำงาน" */
  private dimCode(): void {
    const cur = this.play.code;
    if (cur?.active) this.play.code = { ...cur, active: false };
  }

  // ---------------- scene bookkeeping ----------------

  private actorKey(ev: CombatEvent): string {
    return this.play.combatants[ev.actorId] ? ev.actorId : PLAYER_KEY;
  }

  slotOf(id: string): Slot | null {
    return this.slots.get(id) ?? null;
  }

  private anchor(id: string): Vec | null {
    const slot = this.slots.get(id);
    if (!slot) return null;
    const box = spriteBoxFor(this.kindOf(id));
    return anchorOf(slot, box.h);
  }

  /** จัดตำแหน่งศัตรูใหม่ทุกครั้งที่รายชื่อเปลี่ยน — บอสได้ช่องที่ใกล้กล้องที่สุด */
  private relayoutEnemies(): void {
    const order = this.play.enemyOrder;
    const slots = enemySlots(order.length);
    const bossIdx = order.findIndex((id) => this.play.combatants[id]?.isBoss);
    let nearest = 0;
    for (let i = 1; i < slots.length; i++) if (slots[i].y > slots[nearest].y) nearest = i;
    order.forEach((id, i) => {
      let si = i;
      if (bossIdx >= 0) {
        if (i === bossIdx) si = nearest;
        else if (i === nearest) si = bossIdx;
      }
      this.slots.set(id, slots[si] ?? slots[slots.length - 1]);
    });
  }

  /** ลงทะเบียนตัวละครที่ event อ้างถึง (ไม่แตะ HP/log) เพื่อให้มีตำแหน่งก่อนเอฟเฟกต์ออก */
  private registerEvent(ev: CombatEvent): void {
    // wave_start/wave_clear เป็น event ของระบบ (actorId = 'system') ไม่ใช่ตัวละคร
    if (ev.note === 'wave_start' || ev.note === 'wave_clear') return;
    this.ensure(ev.actorId, ev.actorName, 1);
    for (const t of ev.targets) this.ensure(t.id, t.name, t.hpAfter + (t.damage ?? 0));
  }

  private ensure(id: string, name: string, hpHint: number): void {
    const s = this.play;
    if (!id || id === SYSTEM_ACTOR || s.combatants[id]) return;

    if (name === this.ctx.username && s.combatants[PLAYER_KEY]) {
      // re-key placeholder ผู้เล่นเป็น id จริงที่เอนจินใช้
      const ph = s.combatants[PLAYER_KEY];
      delete s.combatants[PLAYER_KEY];
      s.combatants[id] = { ...ph, id, name };
      s.partyOrder = s.partyOrder.map((x) => (x === PLAYER_KEY ? id : x));
      const fx = this.ents.get(PLAYER_KEY) ?? zeroFx();
      this.ents.delete(PLAYER_KEY);
      this.ents.set(id, fx);
      this.slots.delete(PLAYER_KEY);
      this.slots.set(id, PLAYER_SLOT);
      this.dirty = true;
      return;
    }

    const isParty = name === this.ctx.username;
    const maxHp = Math.max(1, hpHint);
    s.combatants[id] = {
      id,
      name,
      side: isParty ? 'party' : 'enemy',
      hp: maxHp,
      maxHp,
      mp: 0,
      maxMp: 0,
      isBoss: false,
      alive: true,
    };
    this.ents.set(id, zeroFx());
    if (isParty) {
      s.partyOrder = [...s.partyOrder, id];
      this.slots.set(id, PLAYER_SLOT);
    } else {
      s.enemyOrder = [...s.enemyOrder, id];
      this.relayoutEnemies();
    }
    this.dirty = true;
  }

  private effectFor(ev: CombatEvent): EffectAnimation {
    if (ev.action === 'defend' || ev.note === 'defend') return 'shield_dome';
    if (ev.action === 'skill') {
      const def = this.ctx.skills.find((s) => s.id === ev.skillId);
      const named = asEffect(def?.animation);
      if (named) return named;
      if (def?.kind === 'heal') return 'heal_ring';
      if (def?.kind === 'shield') return 'shield_dome';
      if (def?.kind === 'taunt') return 'taunt_aura';
      if (def?.kind === 'magic') return def.aoe ? 'rain_ice' : 'projectile_fire';
      return def?.aoe ? 'spin' : 'slash_heavy';
    }
    return BASIC_ATTACK;
  }

  skillName = (skillId: string | undefined): string => {
    if (!skillId) return 'สกิล';
    return this.ctx.skills.find((s) => s.id === skillId)?.nameTh ?? skillId;
  };

  // ---------------- state reducer ----------------

  /** มอนตัวนี้ทุบไปแล้วหรือตายแล้ว — ถอดการหมายหัวของมันออกจากทุกคน */
  private clearMarksBy(monsterId: string): void {
    const s = this.play;
    const m = s.combatants[monsterId];
    if (m?.windingUp) s.combatants[monsterId] = { ...m, windingUp: false };
    for (const id of s.partyOrder) {
      const c = s.combatants[id];
      if (c?.markedBy?.includes(monsterId)) {
        s.combatants[id] = { ...c, markedBy: c.markedBy.filter((x) => x !== monsterId) };
      }
    }
    this.dirty = true;
  }

  private pushLogs(ev: CombatEvent): void {
    const s = this.play;
    const lines = describeEvent(ev, {
      skillName: this.skillName,
      duel: !!this.ctx.duel,
      ...(this.ctx.waveTotal ? { waveTotal: this.ctx.waveTotal } : {}),
    });
    if (lines.length === 0) return;
    s.log = [...s.log, ...lines.map((l) => ({ id: s.nextId++, text: l.text, kind: l.kind }))].slice(-LOG_CAP);
    this.dirty = true;
  }

  private pushFloat(id: string, text: string, kind: FloatNum['kind'], order: number): void {
    const s = this.play;
    const slot = this.slots.get(id);
    const box = spriteBoxFor(this.kindOf(id));
    const x = slot ? slot.x : 128;
    const y = (slot ? slot.y - box.h : 60) - 6 - order * 9;
    s.floats = [...s.floats.slice(-10), { id: s.nextId++, combatantId: id, text, kind, x, y, born: this.clock }];
    this.dirty = true;
  }

  private applyEvent(ev: CombatEvent): void {
    const s = this.play;
    const ctxDuel = this.ctx.duel;
    this.dirty = true;
    this.pushLogs(ev);

    /*
     * การดวลมีผู้เล่นสองคนที่ลงทะเบียนไว้ครบตั้งแต่สร้างตัวกำกับแล้ว และไม่ได้มี 10 เวฟ
     * ถ้าปล่อยให้เดินเส้นทางปกติ เป้าของ wave_start จะถูกลงทะเบียนเป็น "ศัตรู" ทับของเดิม
     * ซึ่งครึ่งหนึ่งของการดวลเป้านั้นคือตัวผู้เล่นเอง (runDuel จัดฝั่งตาม id ไม่ใช่ตามมุมมอง)
     */
    if (ctxDuel && (ev.note === 'wave_start' || ev.note === 'wave_clear')) return;

    if (ev.note === 'wave_start') {
      // หมายหัวไม่ข้ามเวฟ — มอนที่หมายไว้หายไปพร้อมเวฟเก่า
      for (const id of s.partyOrder) {
        if (s.combatants[id]) s.combatants[id] = { ...s.combatants[id], markedBy: [] };
      }
      for (const id of s.enemyOrder) {
        delete s.combatants[id];
        this.ents.delete(id);
        this.slots.delete(id);
      }
      s.enemyOrder = [];
      s.wave = ev.wave;
      for (const t of ev.targets) {
        const maxHp = Math.max(1, t.hpAfter);
        s.combatants[t.id] = {
          id: t.id,
          name: t.name,
          side: 'enemy',
          hp: maxHp,
          maxHp,
          mp: 0,
          maxMp: 0,
          isBoss: ev.wave === MAX_WAVE,
          alive: true,
        };
        s.enemyOrder = [...s.enemyOrder, t.id];
        this.ents.set(t.id, zeroFx());
      }
      this.relayoutEnemies();
      return;
    }

    if (ev.note === 'wave_clear') {
      s.wave = ev.wave;
      return;
    }

    s.wave = ev.wave || s.wave;
    this.ensure(ev.actorId, ev.actorName, 1);
    const actorKey = this.actorKey(ev);
    const usedSkill = ev.action === 'skill';

    /*
     * MP ฝั่งผู้เล่น = ค่าจริงจาก engine (mpAfter · หลังหักค่าร่ายและฟื้นตอนจบเทิร์น)
     * เดิมหน้าจอหักตาม mpCost อย่างเดียวแต่ engine คืน MP ทุกเทิร์น หลอดจึงหมดทั้งที่ยังร่ายได้จริง
     * (playtest รอบ A ข้อ 4) · บันทึกที่ไม่มี mpAfter (รุ่นก่อน 26 ก.ย. 2026) ถอยไปหักแบบเดิม
     */
    const actorView = s.combatants[actorKey];
    if (actorView?.side === 'party') {
      if (typeof ev.mpAfter === 'number') {
        const mp = Math.max(0, ev.mpAfter);
        s.combatants[actorKey] = { ...actorView, mp, maxMp: Math.max(actorView.maxMp, mp) };
        // เทิร์นรอ: บอกให้เห็นว่า MP ฟื้นเท่าไร (เดิมเทิร์นรอไม่มีเหตุการณ์ หลอดค้างแล้วกระโดด)
        if (ev.action === 'wait' && mp > actorView.mp) this.pushFloat(actorKey, `+${fmt(mp - actorView.mp)} MP`, 'mp', 0);
      } else if (usedSkill) {
        const def = this.ctx.skills.find((x) => x.id === ev.skillId);
        if (def) s.combatants[actorKey] = { ...actorView, mp: Math.max(0, actorView.mp - def.mpCost) };
      }
    }

    if (ev.action === 'wait') return;

    if (ev.action === 'defend' || ev.note === 'defend') return;

    if (ev.note === 'windup') {
      const actor = s.combatants[actorKey];
      if (actor) s.combatants[actorKey] = { ...actor, windingUp: true };
      for (const t of ev.targets) {
        const cur = s.combatants[t.id];
        if (!cur) continue;
        s.combatants[t.id] = { ...cur, markedBy: [...(cur.markedBy ?? []), actorKey] };
        this.pushFloat(t.id, 'หมายหัว!', 'mark', 0);
      }
      return;
    }

    if (ev.skillId === CRUSH_SKILL_ID) this.clearMarksBy(actorKey);

    let order = 0;
    for (const t of ev.targets) {
      const hint = t.hpAfter + (t.damage ?? 0);
      this.ensure(t.id, t.name, hint);
      const cur = s.combatants[t.id];
      if (!cur) continue;

      cur.maxHp = Math.max(cur.maxHp, t.hpAfter, hint);
      cur.hp = Math.max(0, t.hpAfter);
      cur.alive = !t.killed && t.hpAfter > 0;

      if (t.evaded) {
        this.pushFloat(t.id, 'พลาด', 'miss', order++);
        continue;
      }
      if (typeof t.damage === 'number') {
        this.pushFloat(t.id, `-${fmt(t.damage)}`, t.crit ? 'crit' : 'dmg', order++);
      }
      if (typeof t.heal === 'number') {
        this.pushFloat(t.id, `+${fmt(t.heal)}`, 'heal', order++);
      }
      if (typeof t.shield === 'number') {
        this.pushFloat(t.id, `+${fmt(t.shield)} โล่`, 'shield', order++);
      }
      if (t.killed) {
        // ตายก่อนได้ทุบ = การหมายหัวของมันจบไปด้วย (engine เช็ก alive ก่อนนับ marked เหมือนกัน)
        this.clearMarksBy(t.id);
      }
    }
  }
}

/** ความคืบหน้าของเอฟเฟกต์ 0..1 */
export const effectProgress = (e: ActiveEffect): number => Math.min(1, e.elapsed / e.dur);

export { HIT_T };
