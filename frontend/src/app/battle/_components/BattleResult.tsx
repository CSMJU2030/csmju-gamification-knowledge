'use client';

/**
 * หน้าผลการรบ (G0 ข้อ 3 แถว `/battle` ผลการรบ) — UI กลางทั้งหมด ไม่ใช่เวทีเกม
 * ย้ายเนื้อหาจาก client/src/pages/BattleScreen.tsx (ม่าน/แผ่นแบบเกมเดิมตัดทิ้ง เหลือการ์ดมาตรฐาน)
 */
import type { ReactNode, Ref } from 'react';
import { useId } from 'react';
import { StatusBadge, cardClass } from '@/csmju';
import { Alert } from '@/components/feedback';
import type { BattleOutcome, GameData, Item } from '@/lib/api/types';
import {
  MAIN_STAT_LABELS,
  RARITY_LABELS,
  RARITY_TONE,
  SLOT_LABELS,
  STAT_SHORT,
  affixLine,
  fmt,
} from '@/lib/game/labels';
import { MAX_WAVE } from '@/game-stage/battle/battle-log';
import type { GrowthSummary } from '@/lib/game/growth';
import GrowthPanel from './GrowthPanel';
import ProofPanel from './ProofPanel';

type StatKey = keyof typeof STAT_SHORT;
const STAT_ORDER: StatKey[] = ['str', 'int', 'vit', 'agi', 'luk'];

function itemName(item: Item): string {
  return item.upgradeLevel > 0 ? `${item.nameTh} +${item.upgradeLevel}` : item.nameTh;
}

function DropItem({ item, gameData }: { item: Item; gameData: GameData | null }) {
  const main = item.mainStat;
  return (
    <li className="rounded-lg border border-outline-variant/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-label-md text-on-surface">{itemName(item)}</p>
        <StatusBadge tone={RARITY_TONE[item.rarity]}>{RARITY_LABELS[item.rarity]}</StatusBadge>
      </div>
      <p className="mt-1 text-body-md text-on-surface-variant">
        {SLOT_LABELS[item.slot]}
        {main ? ` · ${MAIN_STAT_LABELS[main.stat] ?? main.stat} +${fmt(main.value)}` : ''}
      </p>
      {item.affixes.length > 0 && (
        <ul className="mt-2 space-y-1 text-body-md text-on-surface-variant">
          {item.affixes.map((a, i) => (
            <li key={i}>{affixLine(a.stat, a.value, gameData)}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface Props {
  outcome: BattleOutcome;
  gameData: GameData | null;
  /** เช่น "หอคอย ชั้น 3" / "ป่าเริ่มต้น รอบที่ 2" */
  contextLine: string;
  /** ข้อความเสริมเหนือรางวัล เช่น มอน EX หรือการดวลที่รออยู่ */
  notes?: ReactNode;
  /** แถวปุ่มท้ายการ์ด (ปุ่มหลักได้หนึ่งปุ่ม) */
  actions: ReactNode;
  /** ข้อผิดพลาดของปุ่มในแถวนี้ (เช่น 409 ตอนท้าทายซ้ำ) — แสดงเหนือปุ่ม */
  actionError?: string | null;
  headingRef?: Ref<HTMLHeadingElement>;
  /** การเติบโต ก่อน → หลัง (playtest รอบ A ข้อ 6) — ไม่ส่ง = ป้าย +สเตตัสแบบเดิม */
  growth?: GrowthSummary;
  /** ชื่อภูมิภาคสำหรับผลตรวจบทเรียน (มีเฉพาะการรบในภูมิภาคที่ outcome.proof ไม่เป็น null) */
  regionName?: string;
}

export default function BattleResult({
  outcome,
  gameData,
  contextLine,
  notes,
  actions,
  actionError,
  headingRef,
  growth,
  regionName,
}: Props) {
  const headingId = useId();
  const { result, leveledUp, newLevel, statsGained } = outcome;
  const gained = statsGained ? STAT_ORDER.filter((k) => (statsGained[k] ?? 0) > 0) : [];
  const rewards: Array<[string, number]> = [
    ['EXP', result.expGained],
    ['ทอง', result.drops.gold],
    ['วัสดุ', result.drops.materials],
  ];

  return (
    <section className={`${cardClass} fade-slide-up p-4 md:p-6`} aria-labelledby={headingId}>
      <p className="text-label-md text-on-surface-variant">ผลการรบ</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-headline-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-container"
        >
          {result.victory ? 'ชนะ' : 'แพ้'}
        </h2>
        <StatusBadge tone={result.victory ? 'success' : 'error'}>
          เคลียร์ {result.wavesCleared}/{MAX_WAVE} เวฟ
        </StatusBadge>
      </div>
      <p className="mt-1 text-body-md text-on-surface-variant">
        {contextLine} —{' '}
        {result.victory
          ? 'โปรแกรมของคุณพาตัวละครผ่านครบทุกเวฟ'
          : `ผ่านไป ${result.wavesCleared} เวฟ ดูบันทึกการรบและโค้ดด้านล่างว่าเทิร์นไหนพลาด`}
      </p>

      {notes && <div className="mt-4 space-y-3">{notes}</div>}

      {outcome.proof && regionName && <ProofPanel proof={outcome.proof} regionName={regionName} />}

      {growth && <GrowthPanel growth={growth} />}

      {!growth && leveledUp && (
        <div className="mt-4">
          <Alert tone="success">
            <span className="font-semibold">เลเวลอัพ! ตอนนี้เลเวล {newLevel ?? outcome.character.level}</span>
            {gained.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-2">
                {gained.map((k) => (
                  <StatusBadge key={k} tone="success">
                    {STAT_SHORT[k].th} ({STAT_SHORT[k].key}) +{statsGained?.[k]}
                  </StatusBadge>
                ))}
              </span>
            )}
          </Alert>
        </div>
      )}

      <h3 className="sr-only">รางวัล</h3>
      <dl className="mt-6 grid grid-cols-3 gap-3">
        {rewards.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-surface-container-low p-3 md:p-4">
            <dt className="text-label-md text-on-surface-variant">{label}</dt>
            <dd className="mt-1 font-display text-headline-md text-on-surface tabular-nums">+{fmt(value)}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 font-display text-label-md text-on-surface">
        ไอเทมที่ดรอป
        {result.drops.items.length > 0 && (
          <span className="font-body font-normal text-on-surface-variant tabular-nums"> · {result.drops.items.length} ชิ้น</span>
        )}
      </h3>
      {result.drops.items.length === 0 ? (
        <p className="mt-2 text-body-md text-on-surface-variant">รอบนี้ไม่มีไอเทมดรอป</p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {result.drops.items.map((it) => (
            <DropItem key={it.id} item={it} gameData={gameData} />
          ))}
        </ul>
      )}

      {actionError && (
        <div className="mt-6">
          <Alert tone="error">{actionError}</Alert>
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">{actions}</div>
    </section>
  );
}
