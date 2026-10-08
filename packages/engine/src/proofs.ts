/**
 * สกิลประจำภูมิภาค — พิสูจน์บทเรียนของภูมิภาค (8 ต.ค. 2569 · docs/design-skill-acquisition.md ระยะ S1)
 *
 * ผู้เล่นได้สกิลของภูมิภาคเมื่อ "ชนะรอบลึกสุดของภูมิภาค โดยทำตามบทเรียนของภูมิภาคนั้นได้จริง"
 * ตรวจจากบันทึกการรบ (CombatEvent) ที่เซิร์ฟเวอร์จำลองเอง จึงไม่เชื่ออะไรจากหน้าเว็บ และผลเดิมเมื่อ seed เดิม
 *
 * กติกาของไฟล์นี้:
 *  · วัด **พฤติกรรมในการรบ** ไม่อ่านตัวโปรแกรม — ต่อบล็อกหรือพิมพ์ Python เขียนสั้นหรือยาวก็ผ่านเท่ากัน
 *  · ทุกเงื่อนไขมีข้อกันโกง: "ตั้งรับตลอด" หรือ "ของแรงจนไม่ต้องคิด" ต้องไม่ผ่าน
 *  · ตัวเลขเกณฑ์วัดด้วย tools/proofprobe.cjs (โปรแกรมตามบทเรียนผ่าน · โปรแกรมตีอย่างเดียวไม่ผ่าน)
 */
import { WAVE_CLEAR_RESTORE } from './combat-rules';
import { gamedata, getSkill } from './data';
import { getRegion } from './regions';
import type { BattleResult, ClassId, CombatEvent, SkillDef } from './types';

export interface ProofCheck {
  /** รหัสคงที่ของเงื่อนไข — หน้าเว็บใช้เป็น key */
  code: string;
  /** ข้อความไทยพร้อมตัวเลขของการรบครั้งนี้ */
  textTh: string;
  ok: boolean;
}

export interface RegionProof {
  regionId: string;
  /** การรบนี้นับไหม — ต้องเป็นรอบลึกสุดของภูมิภาค */
  eligible: boolean;
  /** นับ + ชนะ + ผ่านทุกเงื่อนไข */
  passed: boolean;
  checks: ProofCheck[];
}

interface ProofContext {
  events: CombatEvent[];
  heroId: string;
  heroMaxHp: number;
}

interface ProofRule {
  /** เงื่อนไขแบบอ่านก่อนเข้า (ไม่มีตัวเลขของการรบ) */
  requirementsTh: string[];
  evaluate(ctx: ProofContext): ProofCheck[];
}

// ---------------------------------------------------------------- อ่านบันทึกการรบ

const BOSS_ARCHETYPE = new Map(gamedata.bosses.map((b) => [b.id, b.archetype]));

/** archetype ของมอนจาก id ที่ waves.ts สร้าง: `f{floor}w{wave}_m{i}_{arch}` · `_ex_{arch}` · `_boss_{bossId}` */
export function archetypeOfId(id: string): string | undefined {
  const parts = id.split('_');
  if (parts.length < 3) return undefined;
  const rest = parts.slice(2).join('_');
  return parts[1] === 'boss' ? BOSS_ARCHETYPE.get(rest) : rest;
}

const isSystem = (e: CombatEvent) => e.note === 'wave_start' || e.note === 'wave_clear';

/** เทิร์นที่เลือกเล่นเป็นฝ่ายรับ: ตั้งการ์ด · ฮีล · โล่ · ยั่วยุ */
function isGuard(e: CombatEvent): boolean {
  if (e.action === 'defend') return true;
  if (e.action !== 'skill' || !e.skillId) return false;
  const kind = getSkill(e.skillId)?.kind;
  return kind === 'shield' || kind === 'taunt';
}
function isCare(e: CombatEvent): boolean {
  if (isGuard(e)) return true;
  return e.action === 'skill' && !!e.skillId && getSkill(e.skillId)?.kind === 'heal';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

// ---------------------------------------------------------------- หมายหัว (ป่าเริ่มต้น · ดินแดนน้ำแข็ง)

interface WindupStats {
  /** ครั้งที่ถูกหมายหัวแล้วได้ลงมือก่อนโดนทุบ */
  windups: number;
  /** ในจำนวนนั้น ตั้งรับทัน */
  handled: number;
  heroTurns: number;
  /** ตั้งรับในเทิร์นที่ไม่ได้ถูกหมายหัว */
  guardsUnmarked: number;
}

function windupStats(ctx: ProofContext, archetypes: readonly string[]): WindupStats {
  const s: WindupStats = { windups: 0, handled: 0, heroTurns: 0, guardsUnmarked: 0 };
  let marker: string | null = null;
  for (const e of ctx.events) {
    if (isSystem(e)) {
      // เวฟจบก่อนได้ลงมือ = ตัวที่หมายตายไปแล้ว ไม่นับ
      marker = null;
      continue;
    }
    if (e.note === 'windup') {
      const arch = archetypeOfId(e.actorId);
      if (arch && archetypes.includes(arch) && e.targets.some((t) => t.id === ctx.heroId)) marker = e.actorId;
      continue;
    }
    if (e.actorId !== ctx.heroId) continue;
    s.heroTurns++;
    if (marker) {
      s.windups++;
      // นับเฉพาะการตั้งรับ — ล้มตัวที่หมายได้ก่อนก็รอดเหมือนกัน แต่ไม่ได้พิสูจน์ว่าอ่าน has_debuff("marked") เป็น
      if (isGuard(e)) s.handled++;
      marker = null;
    } else if (isGuard(e)) {
      s.guardsUnmarked++;
    }
  }
  return s;
}

function windupRule(regionId: string, minWindups: number, maxGuardShare: number): ProofRule {
  const archetypes = getRegion(regionId)?.mechanic?.archetypes ?? [];
  const names = archetypes
    .map((a) => gamedata.monsterArchetypes.find((m) => m.id === a)?.nameTh ?? a)
    .join(' · ');
  return {
    requirementsTh: [
      `ถูก${names}หมายหัวอย่างน้อย ${minWindups} ครั้ง`,
      'ทุกครั้งที่ถูกหมายหัว เทิร์นถัดไปของคุณต้องตั้งรับ (defend · โล่ · ยั่วยุ)',
      `เทิร์นที่ไม่ถูกหมายหัว ตั้งรับไม่เกิน ${pct(maxGuardShare)}`,
    ],
    evaluate(ctx) {
      const s = windupStats(ctx, archetypes);
      const unmarked = s.heroTurns - s.windups;
      const share = unmarked > 0 ? s.guardsUnmarked / unmarked : 0;
      return [
        { code: 'windups', textTh: `ถูกหมายหัว ${s.windups} ครั้ง (ต้องอย่างน้อย ${minWindups})`, ok: s.windups >= minWindups },
        {
          code: 'handled',
          textTh: `รับทัน ${s.handled}/${s.windups} ครั้ง (ต้องทันทุกครั้ง)`,
          ok: s.windups > 0 && s.handled === s.windups,
        },
        {
          code: 'guard_share',
          textTh: `ตั้งรับตอนไม่ถูกหมายหัว ${s.guardsUnmarked}/${unmarked} เทิร์น (${pct(share)} · ไม่เกิน ${pct(maxGuardShare)})`,
          ok: share <= maxGuardShare,
        },
      ];
    },
  };
}

// ---------------------------------------------------------------- เผื่อเลือด (หมู่เกาะ)

function earlyCareRule(minCare: number, minHpFloor: number, maxGuardShare: number): ProofRule {
  return {
    requirementsTh: [
      `ดูแลเลือด (ฮีล · โล่ · ตั้งการ์ด) อย่างน้อย ${minCare} ครั้ง`,
      `เลือดไม่ต่ำกว่า ${pct(minHpFloor)} ตลอดการรบ — มอนที่นี่ลงมือก่อน เงื่อนไขเลือดต้องตั้งไว้สูงพอ`,
      `ตั้งรับ (ตั้งการ์ด · โล่ · ยั่วยุ) ไม่เกิน ${pct(maxGuardShare)} ของเทิร์นทั้งหมด`,
    ],
    evaluate(ctx) {
      const max = Math.max(1, ctx.heroMaxHp);
      let hp = max;
      let lowest = max;
      let care = 0;
      let turns = 0;
      let guards = 0;
      for (const e of ctx.events) {
        if (e.note === 'wave_clear') {
          // battle.ts ฟื้นเลือดตอนเคลียร์เวฟโดยไม่มีเหตุการณ์ — คิดตามสูตรเดียวกัน
          if (hp > 0) hp = Math.min(max, hp + Math.round(max * WAVE_CLEAR_RESTORE));
          continue;
        }
        if (isSystem(e)) continue;
        if (e.actorId === ctx.heroId) {
          turns++;
          if (isGuard(e)) guards++;
          if (isCare(e)) care++;
        }
        for (const t of e.targets) {
          if (t.id !== ctx.heroId) continue;
          hp = t.hpAfter;
          lowest = Math.min(lowest, hp);
        }
      }
      const share = turns > 0 ? guards / turns : 0;
      return [
        { code: 'care', textTh: `ดูแลเลือด ${care} ครั้ง (ต้องอย่างน้อย ${minCare})`, ok: care >= minCare },
        { code: 'hp_floor', textTh: `เลือดต่ำสุด ${pct(lowest / max)} (ต้องไม่ต่ำกว่า ${pct(minHpFloor)})`, ok: lowest / max >= minHpFloor },
        { code: 'guard_share', textTh: `ตั้งรับ ${guards}/${turns} เทิร์น (${pct(share)} · ไม่เกิน ${pct(maxGuardShare)})`, ok: share <= maxGuardShare },
      ];
    },
  };
}

// ---------------------------------------------------------------- ตัวอันตรายตายก่อน (ซากปรักหักพัง · ภูเขาไฟ)

function firstKillRule(archetype: string, minWaves: number, minShare: number): ProofRule {
  const name = gamedata.monsterArchetypes.find((m) => m.id === archetype)?.nameTh ?? archetype;
  return {
    requirementsTh: [
      `${name}ตายเป็นตัวแรกของเวฟ อย่างน้อย ${minWaves} เวฟ`,
      `และอย่างน้อย ${pct(minShare)} ของเวฟที่มี${name}ปนกับมอนตัวอื่น`,
    ],
    evaluate(ctx) {
      let eligible = 0;
      let first = 0;
      let watching = false;
      for (const e of ctx.events) {
        if (e.note === 'wave_start') {
          const arches = e.targets.map((t) => archetypeOfId(t.id));
          watching = e.targets.length >= 2 && arches.includes(archetype);
          if (watching) eligible++;
          continue;
        }
        if (!watching || isSystem(e)) continue;
        const killed = e.targets.filter((t) => t.killed && t.id !== ctx.heroId);
        if (killed.length === 0) continue;
        if (killed.some((t) => archetypeOfId(t.id) === archetype)) first++;
        watching = false;
      }
      const share = eligible > 0 ? first / eligible : 0;
      return [
        { code: 'first_kills', textTh: `${name}ตายก่อน ${first} เวฟ (ต้องอย่างน้อย ${minWaves})`, ok: first >= minWaves },
        {
          code: 'first_share',
          textTh: `${first}/${eligible} เวฟที่มี${name}ปน (${pct(share)} · ต้องอย่างน้อย ${pct(minShare)})`,
          ok: eligible > 0 && share >= minShare,
        },
      ];
    },
  };
}

// ---------------------------------------------------------------- ตารางของภูมิภาค

const RULES: Record<string, ProofRule> = {
  greenwood: windupRule('greenwood', 3, 0.25),
  isles: earlyCareRule(2, 0.5, 0.4),
  ruins: firstKillRule('dark_mage', 4, 0.8),
  frostland: windupRule('frostland', 3, 0.25),
  volcano: firstKillRule('brute', 4, 0.8),
};

/** ภูมิภาคที่มีสกิลให้พิสูจน์ */
export const PROOF_REGIONS: readonly string[] = Object.keys(RULES);

/** เงื่อนไขแบบอ่านก่อนเข้า — null = ภูมิภาคนี้ไม่มีสกิลให้พิสูจน์ (หอคอย · เมือง) */
export function proofRequirements(regionId: string): string[] | null {
  const rule = RULES[regionId];
  if (!rule) return null;
  return ['ชนะรอบลึกสุดของภูมิภาค', ...rule.requirementsTh];
}

/**
 * ตรวจการรบหนึ่งครั้ง — null = ภูมิภาคนี้ไม่มีสกิลให้พิสูจน์
 * ตรวจทุกรอบเพื่อให้ผู้เล่นเห็นว่าขาดข้อไหน แต่ `passed` เป็นจริงได้เฉพาะรอบลึกสุดที่ชนะ
 */
export function regionProof(
  regionId: string,
  depth: number,
  result: Pick<BattleResult, 'victory' | 'events'>,
  heroId: string,
  heroMaxHp: number,
): RegionProof | null {
  const rule = RULES[regionId];
  const region = getRegion(regionId);
  if (!rule || !region) return null;
  const eligible = depth === region.depths;
  const checks: ProofCheck[] = [
    {
      code: 'deepest_win',
      textTh: eligible
        ? result.victory ? `ชนะรอบ ${depth} (รอบลึกสุด)` : `แพ้รอบ ${depth} (รอบลึกสุด)`
        : `รอบ ${depth} ยังไม่ใช่รอบลึกสุด (รอบ ${region.depths}) — ฝึกได้ แต่ยังไม่นับ`,
      ok: eligible && result.victory,
    },
    ...rule.evaluate({ events: result.events, heroId, heroMaxHp }),
  ];
  return { regionId, eligible, passed: checks.every((c) => c.ok), checks };
}

// ---------------------------------------------------------------- สกิลที่ใช้ได้

/** สกิลประจำภูมิภาคของอาชีพนี้ (ไม่มี = undefined · ผู้ฝึกหัดไม่มี) */
export function regionSkillFor(classId: ClassId | string, regionId: string): SkillDef | undefined {
  return gamedata.skills.find((s) => s.region === regionId && s.classId === classId);
}

/**
 * สกิลทั้งหมดที่ตัวละครใช้ได้: สกิลอาชีพตามเลเวล + สกิลของภูมิภาคที่พิสูจน์แล้ว
 * ผลพิสูจน์ผูกกับตัวละคร ไม่ผูกกับอาชีพ — ผู้ฝึกหัดที่พิสูจน์ก่อนเลือกอาชีพได้สกิลของอาชีพที่เลือกทีหลังทันที
 */
export function skillsFor(classId: ClassId | string, level: number, provedRegions: readonly string[] = []): SkillDef[] {
  return gamedata.skills.filter((s) =>
    s.classId === classId && (s.region ? provedRegions.includes(s.region) : s.unlockLevel <= level));
}
