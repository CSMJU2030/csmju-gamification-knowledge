'use client';

/**
 * หน้า "ตัวละคร" — มาหน้านี้เพื่อดูว่าตัวละครเก่งขึ้นตรงไหน และโค้ดของเราทำงานแบบไหนในเลเวลนี้ (G0 ข้อ 3)
 * ย้ายเนื้อหาจาก CharacterPage เดิม: ตุ๊กตาแต่งตัวกลายเป็นรายการอุปกรณ์ · แถบความชำนาญยังเป็นหัวใจของหน้า
 */
import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { ChevronRightIcon, InfoIcon, LockIcon, StatusBadge, cardClass, secondaryButtonClass } from '@/csmju';
import { ProgressBar } from '@/components/ProgressBar';
import type { Character, GameData, SkillDef } from '@/lib/api/types';
import {
  CLASS_NAMES,
  PROFICIENCY_INFO,
  SKILL_KIND_LABELS,
  SLOTS,
  SLOT_LABELS,
  STAT_SHORT,
  fmt,
  pct,
} from '@/lib/game/labels';
import { Portrait } from './Portrait';

const STAT_KEYS = ['str', 'int', 'vit', 'agi', 'luk'] as const;
const PROF_KEYS = ['str', 'int', 'vit'] as const;
type Triple = Record<(typeof PROF_KEYS)[number], number>;

/**
 * แถบว่างแต่มีแต้มที่จะได้ = ตอนระบบถอยไปใช้ค่าเริ่มต้นของอาชีพ (ยังไม่มีงานเลย)
 * วาดแถบจากสัดส่วนของแต้มแทน ไม่งั้นผู้เล่นเห็นแถบศูนย์คู่กับ "+2 แต้ม" แล้วงง (ตรรกะเดิม)
 */
function shownShare(c: Character): Triple {
  const { share, projectedPoints: pts } = c.proficiency;
  const shareTotal = share.str + share.int + share.vit;
  if (shareTotal > 0) return share;
  const ptsTotal = pts.str + pts.int + pts.vit;
  return ptsTotal > 0
    ? { str: pts.str / ptsTotal, int: pts.int / ptsTotal, vit: pts.vit / ptsTotal }
    : { str: 0, int: 0, vit: 0 };
}

/** งานดิบทศนิยม 3 ตำแหน่ง — บนจอเอาตำแหน่งเดียวพอ และไม่ให้ 27 กลายเป็น 27.0 */
const workLabel = (v: number) => String(Math.round(v * 10) / 10);

function CardHeader({ id, title, hint, action }: { id: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/40 px-6 py-5">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-headline-md text-on-surface">
          {title}
        </h2>
        {hint && <p className="text-label-md font-normal text-on-surface-variant">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function CharacterOverview({ character: c, gameData }: { character: Character; gameData: GameData | null }) {
  const share = useMemo(() => shownShare(c), [c]);
  const maxStat = Math.max(1, ...STAT_KEYS.map((k) => c.stats[k]));

  // สกิลทั้งหมดของอาชีพ (รวมที่ยังไม่ปลดล็อก) จาก game-data · ถ้าตารางยังไม่มาใช้ของที่ตัวละครมี
  const classSkills = useMemo<Pick<SkillDef, 'id' | 'nameTh' | 'unlockLevel' | 'mpCost' | 'kind' | 'aoe'>[]>(() => {
    const merged = new Map<string, Pick<SkillDef, 'id' | 'nameTh' | 'unlockLevel' | 'mpCost' | 'kind' | 'aoe'>>();
    for (const s of gameData?.skills ?? []) if (s.classId === c.classId) merged.set(s.id, s);
    for (const s of c.skills) if (!merged.has(s.id)) merged.set(s.id, s);
    return [...merged.values()].sort((a, b) => a.unlockLevel - b.unlockLevel);
  }, [gameData, c]);

  const d = c.derived;
  const derived: [string, string][] = [
    ['HP', fmt(d.maxHp)],
    ['MP', fmt(d.maxMp)],
    ['โจมตี', fmt(d.atk)],
    ['พลังเวท', fmt(d.matk)],
    ['ป้องกัน', fmt(d.def)],
    ['ต้านเวท', fmt(d.mdef)],
    ['ความเร็ว', fmt(d.speed)],
    ['อัตราคริ', pct(d.critRate)],
    ['แรงคริ', `×${d.critDmg}`],
    ['หลบหลีก', pct(d.evasion)],
    ['โบนัสดรอป', pct(d.dropBonus)],
  ];

  return (
    <>
      {/* สรุปตัวละคร */}
      <section className={`${cardClass} fade-slide-up`} aria-label="สรุปตัวละคร">
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
          <Portrait classId={c.classId} size={72} alt={`${CLASS_NAMES[c.classId]} ${c.displayName}`} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-headline-md text-on-surface">{c.displayName}</span>
              <StatusBadge tone="info">{CLASS_NAMES[c.classId]}</StatusBadge>
              <StatusBadge tone="neutral">เลเวล {c.level}</StatusBadge>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-label-md text-on-surface-variant">
                <span>EXP ถึงเลเวล {c.level + 1}</span>
                <span className="tabular-nums">
                  {fmt(c.exp)} / {fmt(c.expToNext)}
                </span>
              </div>
              <ProgressBar
                value={c.exp}
                max={c.expToNext}
                label="EXP ถึงเลเวลถัดไป"
                valueText={`${fmt(c.exp)} จาก ${fmt(c.expToNext)}`}
              />
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-4 md:w-80 md:shrink-0">
            {[
              ['ทอง', fmt(c.gold)],
              ['วัสดุ', fmt(c.materials)],
              ['หอคอยสูงสุด', `ชั้น ${c.highestFloorCleared}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-container-low px-3 py-2">
                <dt className="text-label-sm text-on-surface-variant">{k}</dt>
                <dd className="font-display text-body-lg font-bold text-on-surface tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* สเตตัส */}
        <section className={cardClass} aria-labelledby="stats-title">
          <div className="border-b border-outline-variant/40 px-6 py-5">
            <h2 id="stats-title" className="font-display text-headline-md text-on-surface">
              สเตตัส
            </h2>
            <p className="text-label-md font-normal text-on-surface-variant">ค่าปัจจุบัน ผู้เล่นไม่ได้แจกแต้มเอง</p>
          </div>
          <ul className="space-y-3 px-6 py-5">
            {STAT_KEYS.map((k) => (
              <li key={k} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3">
                <span className="text-label-md text-on-surface">
                  {STAT_SHORT[k].key} <span className="font-normal text-on-surface-variant">{STAT_SHORT[k].th}</span>
                </span>
                <ProgressBar value={c.stats[k]} max={maxStat} label={`${STAT_SHORT[k].key} ${c.stats[k]}`} size="sm" />
                <span className="text-right text-label-md text-on-surface tabular-nums">{c.stats[k]}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ความชำนาญ — หัวใจของหน้า: บอกว่าทำอะไรแล้วแถบจะขยับ */}
        <section className={cardClass} aria-labelledby="prof-title">
          <div className="border-b border-outline-variant/40 px-6 py-5">
            <h2 id="prof-title" className="font-display text-headline-md text-on-surface">
              ความชำนาญเลเวลนี้
            </h2>
            <p className="text-label-md font-normal text-on-surface-variant">
              เลเวลหน้าได้ {c.proficiency.pointsPerLevel} แต้ม แจกตามงานที่โปรแกรมทำจริง
            </p>
          </div>
          <div className="space-y-4 px-6 py-5">
            {c.proficiency.usingClassDefault && (
              <p className="flex gap-2 rounded-lg bg-primary-container/10 px-3 py-2 text-body-md text-primary-container">
                <InfoIcon className="mt-1 h-4 w-4 shrink-0" />
                ตัวนับเพิ่งเริ่มใหม่ แถบข้างล่างคือค่าเริ่มต้นของ{CLASS_NAMES[c.classId]} ออกไปรบสักรอบแล้วมันจะขยับตามที่คุณเล่นจริง
              </p>
            )}
            {PROF_KEYS.map((k) => {
              const info = PROFICIENCY_INFO[k];
              const sharePct = Math.round(share[k] * 100);
              const work = c.proficiency.work[k];
              return (
                <div key={k} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-label-md text-on-surface">
                      {info.key} <span className="font-normal text-on-surface-variant">{info.th}</span>
                    </span>
                    <span className="font-display text-body-lg font-bold text-primary-container tabular-nums">
                      +{c.proficiency.projectedPoints[k]}
                    </span>
                  </div>
                  <ProgressBar
                    value={sharePct}
                    max={100}
                    label={`ความชำนาญ ${info.key}`}
                    valueText={`${sharePct} เปอร์เซ็นต์ เลเวลหน้าได้ ${c.proficiency.projectedPoints[k]} แต้ม`}
                    size="sm"
                  />
                  <p className="text-label-md font-normal text-on-surface-variant">
                    {info.howTh}
                    {work >= 0.05 && ` · เลเวลนี้ทำไปแล้ว ${workLabel(work)} หลอด`}
                  </p>
                </div>
              );
            })}
            <p className="text-label-md font-normal text-on-surface-variant">
              AGI กับ LUK ไม่มีแถบเพราะโปรแกรมสั่งไม่ได้ — ทั้งคู่โตเองทุกเลเวล
            </p>
          </div>
        </section>

        {/* อุปกรณ์ */}
        <section className={cardClass} aria-labelledby="equip-title">
          <CardHeader
            id="equip-title"
            title="อุปกรณ์"
            action={
              <Link href="/items" className={secondaryButtonClass}>
                จัดของ
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            }
          />
          <ul className="divide-y divide-outline-variant/40">
            {SLOTS.map((slot) => {
              const it = c.equipment[slot];
              return (
                <li key={slot} className="flex items-center justify-between gap-3 px-6 py-3.5">
                  <span className="text-label-md text-on-surface-variant">{SLOT_LABELS[slot]}</span>
                  {it ? (
                    <span className="min-w-0 truncate text-right text-body-md text-on-surface">
                      {it.nameTh}
                      {it.upgradeLevel > 0 && <span className="text-primary-container"> +{it.upgradeLevel}</span>}
                    </span>
                  ) : (
                    <span className="text-body-md text-on-surface-variant">ว่าง</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cardClass} aria-labelledby="derived-title">
          <div className="border-b border-outline-variant/40 px-6 py-5">
            <h2 id="derived-title" className="font-display text-headline-md text-on-surface">
              ค่าสถานะรวม
            </h2>
            <p className="text-label-md font-normal text-on-surface-variant">รวมอุปกรณ์แล้ว</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-5 sm:grid-cols-3">
            {derived.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 border-b border-outline-variant/30 pb-2">
                <dt className="text-label-md font-normal text-on-surface-variant">{k}</dt>
                <dd className="text-label-md text-on-surface tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={cardClass} aria-labelledby="skills-title">
          <CardHeader
            id="skills-title"
            title="สกิลที่เรียกได้ใน cast()"
            action={
              <Link href="/program" className={secondaryButtonClass}>
                เปิดโปรแกรม
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            }
          />
          {classSkills.length === 0 ? (
            <p className="px-6 py-5 text-body-md text-on-surface-variant">
              {c.classId === 'novice'
                ? 'ผู้ฝึกหัดยังไม่มีสกิล — ใช้ได้แค่ attack() defend() และ wait() จนกว่าจะเลือกอาชีพ'
                : 'ยังโหลดข้อมูลสกิลไม่ได้'}
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant/40">
              {classSkills.map((s) => {
                const locked = c.level < s.unlockLevel;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <span className="min-w-0">
                      <span className={`block text-body-md ${locked ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                        {s.nameTh}
                      </span>
                      <span className="block text-label-sm font-normal text-on-surface-variant">
                        {SKILL_KIND_LABELS[s.kind] ?? s.kind}
                        {s.aoe && ' · โดนทุกตัว'}
                      </span>
                    </span>
                    {locked ? (
                      <StatusBadge tone="neutral">
                        <LockIcon className="h-3 w-3" /> เลเวล {s.unlockLevel}
                      </StatusBadge>
                    ) : (
                      <span className="text-label-md text-on-surface-variant tabular-nums">MP {s.mpCost}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
