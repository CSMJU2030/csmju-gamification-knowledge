'use client';

/**
 * รายละเอียดไอเทมหนึ่งชิ้น + การกระทำทั้งหมด (สวม/ถอด · ตีบวก · ย่อย)
 * ปุ่มที่ "มีสิทธิ์แต่ตอนนี้ทำไม่ได้" disable พร้อมเหตุผลล่วงหน้า (G0 ข้อ 4) — ตรงกับที่ backend จะตอบ 409
 */
import { FORMULAS, SALVAGE_MATERIALS, UPGRADE_MAX_LEVEL } from '@tower/engine/types';
import { useState } from 'react';
import { Modal, StatusBadge, secondaryButtonClass } from '@/csmju';
import { Alert, Button } from '@/components/feedback';
import type { GameData, Item } from '@/lib/api/types';
import {
  MAIN_STAT_LABELS,
  RARITY_LABELS,
  RARITY_TONE,
  SLOT_LABELS,
  affixLine,
  fmt,
} from '@/lib/game/labels';

export type ItemAction = 'equip' | 'unequip' | 'upgrade' | 'salvage';

export function itemTitle(it: Item): string {
  return it.upgradeLevel > 0 ? `${it.nameTh} +${it.upgradeLevel}` : it.nameTh;
}

export function upgradeBlock(it: Item, gold: number, materials: number): string | null {
  if (it.upgradeLevel >= UPGRADE_MAX_LEVEL) return `ถึงขั้นสูงสุดแล้ว (+${UPGRADE_MAX_LEVEL})`;
  const g = FORMULAS.upgradeGoldCost(it.upgradeLevel);
  const m = FORMULAS.upgradeMaterialCost(it.upgradeLevel);
  if (gold < g || materials < m) return `ต้องใช้ ${fmt(g)} ทอง และ ${fmt(m)} วัสดุ (มี ${fmt(gold)} ทอง · ${fmt(materials)} วัสดุ)`;
  return null;
}

export function ItemDialog({
  item,
  gold,
  materials,
  gameData,
  busy,
  error,
  onAction,
  onClose,
}: {
  item: Item | null;
  gold: number;
  materials: number;
  gameData: GameData | null;
  busy: ItemAction | null;
  error: string | null;
  onAction: (a: ItemAction) => void;
  onClose: () => void;
}) {
  const [confirmSalvage, setConfirmSalvage] = useState(false);
  if (!item) return null;

  const upBlock = upgradeBlock(item, gold, materials);
  const salvageBlock = item.equipped ? 'ถอดก่อนถึงจะย่อยได้' : null;
  const maxed = item.upgradeLevel >= UPGRADE_MAX_LEVEL;
  const gains = SALVAGE_MATERIALS[item.rarity];

  return (
    <Modal
      open
      title={itemTitle(item)}
      onClose={() => {
        if (busy) return;
        setConfirmSalvage(false);
        onClose();
      }}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={RARITY_TONE[item.rarity]}>{RARITY_LABELS[item.rarity]}</StatusBadge>
          <StatusBadge tone="neutral">{SLOT_LABELS[item.slot]}</StatusBadge>
          {item.equipped && <StatusBadge tone="success">สวมอยู่</StatusBadge>}
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface-container-low px-3 py-2">
            <dt className="text-label-sm text-on-surface-variant">ค่าหลัก</dt>
            <dd className="text-body-md font-semibold text-on-surface tabular-nums">
              {MAIN_STAT_LABELS[item.mainStat.stat] ?? item.mainStat.stat} +{fmt(item.mainStat.value)}
            </dd>
          </div>
          <div className="rounded-lg bg-surface-container-low px-3 py-2">
            <dt className="text-label-sm text-on-surface-variant">ดรอปจากความยาก</dt>
            <dd className="text-body-md font-semibold text-on-surface tabular-nums">{item.droppedFloor}</dd>
          </div>
        </dl>

        <div>
          <h3 className="text-label-md text-on-surface">คุณสมบัติเสริม</h3>
          {item.affixes.length === 0 ? (
            <p className="mt-1 text-body-md">ไม่มี</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {item.affixes.map((a, i) => (
                <li key={`${a.stat}-${i}`} className="text-body-md text-on-surface">
                  {affixLine(a.stat, a.value, gameData)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <Alert>{error}</Alert>}

        {confirmSalvage ? (
          <div className="space-y-3 rounded-lg border border-outline-variant/60 p-4">
            <p className="text-body-md text-on-surface">
              ย่อย <strong>{itemTitle(item)}</strong> แล้วได้วัสดุ {gains} ชิ้น · ย่อยแล้วเอาคืนไม่ได้
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" className={secondaryButtonClass} onClick={() => setConfirmSalvage(false)} disabled={!!busy}>
                ยกเลิก
              </button>
              <Button variant="danger" loading={busy === 'salvage'} onClick={() => onAction('salvage')}>
                ย่อยไอเทม
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 border-t border-outline-variant/40 pt-4">
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="secondary"
                loading={busy === 'equip' || busy === 'unequip'}
                disabled={!!busy}
                onClick={() => onAction(item.equipped ? 'unequip' : 'equip')}
              >
                {item.equipped ? 'ถอด' : `สวมเป็น${SLOT_LABELS[item.slot]}`}
              </Button>
              <Button
                variant="secondary"
                disabled={!!busy || !!salvageBlock}
                aria-describedby={salvageBlock ? 'salvage-reason' : undefined}
                onClick={() => setConfirmSalvage(true)}
              >
                ย่อย
              </Button>
              <Button
                variant="primary"
                loading={busy === 'upgrade'}
                disabled={!!busy || !!upBlock}
                aria-describedby={upBlock ? 'upgrade-reason' : undefined}
                onClick={() => onAction('upgrade')}
              >
                {maxed ? 'ตีบวกเต็มแล้ว' : `ตีบวกเป็น +${item.upgradeLevel + 1}`}
              </Button>
            </div>
            <ul className="space-y-1 text-right text-label-md font-normal text-on-surface-variant">
              {!maxed && !upBlock && (
                <li>
                  ใช้ {fmt(FORMULAS.upgradeGoldCost(item.upgradeLevel))} ทอง และ{' '}
                  {fmt(FORMULAS.upgradeMaterialCost(item.upgradeLevel))} วัสดุ
                </li>
              )}
              {upBlock && <li id="upgrade-reason">ตีบวก: {upBlock}</li>}
              {salvageBlock && <li id="salvage-reason">ย่อย: {salvageBlock}</li>}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
