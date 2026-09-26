'use client';

/**
 * กระเป๋า — มาหน้านี้เพื่อจัดของ: สวม · ถอด · ตีบวก · ย่อย (G0 ข้อ 3)
 * ตาราง (md ขึ้นไป) / รายการการ์ด (มือถือ) · แตะแถวเพื่อเปิดรายละเอียดและการกระทำ
 *
 * PATCH/DELETE/POST ของไอเทมไม่คืนตัวละคร จึงโหลดตัวละครใหม่หลังทำสำเร็จ
 * (ค่าสถานะรวม ทอง วัสดุ เปลี่ยนตาม) — backend เป็นคนคิดทุกค่า หน้านี้ไม่คำนวณเอง
 */
import Link from 'next/link';
import { useState } from 'react';
import {
  ChevronRightIcon,
  InventoryIcon,
  PageHeader,
  SearchIcon,
  StatusBadge,
  SwordsIcon,
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
  tdClass,
  thClass,
} from '@/csmju';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/feedback';
import { Pagination } from '@/components/Pagination';
import { SearchField } from '@/components/SearchField';
import { useToast } from '@/components/Toast';
import { api, apiRequest, userMessage } from '@/lib/api/client';
import type { Character, Item, ItemUpgrade, SalvagedItem } from '@/lib/api/types';
import { useSearchList } from '@/lib/api/use-search-list';
import { MAIN_STAT_LABELS, RARITY_LABELS, RARITY_TONE, SLOT_LABELS, fmt } from '@/lib/game/labels';
import { useGame } from '@/lib/game/session';
import { ItemDialog, itemTitle, type ItemAction } from './ItemDialog';

function ItemsSkeleton() {
  return (
    <LoadingRegion label="กำลังโหลดกระเป๋า">
      <div className={`${cardClass} divide-y divide-outline-variant/40`}>
        <div className="px-6 py-5">
          <Skeleton className="h-6 w-40" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export default function ItemsPage() {
  const { character, gameData, setCharacter } = useGame();
  const toast = useToast();
  const { list, rows: items, meta, q, search, setPage, pending, hasAny, shownQuery, status } = useSearchList<Item>('/items');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<ItemAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const open = items.find((i) => i.id === openId) ?? null;
  const me = character.status === 'ready' ? character.character : null;

  const refreshCharacter = async () => {
    try {
      setCharacter(await api.get<Character>('/characters/current'));
    } catch {
      // ตัวละครจะโหลดใหม่ตอนเปิดหน้าอื่นอยู่แล้ว — ไม่ขวางผลของการกระทำที่สำเร็จไปแล้ว
    }
  };

  const act = async (action: ItemAction) => {
    if (!open) return;
    setBusy(action);
    setActionError(null);
    try {
      if (action === 'equip' || action === 'unequip') {
        await api.patch<Item>(`/items/${open.id}`, { equipped: action === 'equip' });
        toast(action === 'equip' ? `สวม ${itemTitle(open)} แล้ว` : `ถอด ${itemTitle(open)} แล้ว`);
      } else if (action === 'upgrade') {
        const r = await api.post<ItemUpgrade>('/item-upgrades', { itemId: open.id });
        toast(`ตีบวกสำเร็จ — ${itemTitle(r.item)}`);
      } else {
        const r = await apiRequest<SalvagedItem>(`/items/${open.id}`, { method: 'DELETE' });
        toast(`ย่อยแล้ว ได้วัสดุ ${r.data.materialsGained} ชิ้น`);
        setOpenId(null);
      }
      list.reload();
      await refreshCharacter();
    } catch (e) {
      setActionError(userMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <PageHeader
      title="กระเป๋า"
      description="จัดของที่ได้จากการรบ: สวม ถอด ตีบวก และย่อยเป็นวัสดุ"
      aside={
        me && (
          <>
            <StatusBadge tone="neutral">ทอง {fmt(me.gold)}</StatusBadge>
            <StatusBadge tone="neutral">วัสดุ {fmt(me.materials)}</StatusBadge>
          </>
        )
      }
    />
  );

  if (character.status === 'none') {
    return (
      <>
        {header}
        <EmptyState
          title="ยังไม่มีตัวละคร"
          description="ตั้งชื่อตัวละครก่อน แล้วค่อยกลับมาจัดกระเป๋า"
          action={
            <Link href="/" className={primaryButtonClass}>
              ไปสร้างตัวละคร
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      {(hasAny !== false || q !== '') && (
        <SearchField label="ค้นหาไอเทม" placeholder="ชื่อไอเทม เช่น ดาบ แหวน" value={q} onSearch={search} status={status} />
      )}
      {list.status === 'loading' && <ItemsSkeleton />}
      {list.status === 'error' && <ErrorState message={list.error.message} onRetry={list.reload} />}
      {list.status === 'ready' && items.length === 0 && shownQuery !== '' && (
        <EmptyState
          title={`ไม่พบไอเทมชื่อ “${shownQuery}”`}
          description="ลองคำอื่น หรือล้างการค้นหาเพื่อดูไอเทมทั้งหมด"
          icon={<SearchIcon className="h-6 w-6" />}
          action={
            <button type="button" className={secondaryButtonClass} onClick={() => search('')}>
              ล้างการค้นหา
            </button>
          }
        />
      )}
      {list.status === 'ready' && items.length === 0 && shownQuery === '' && (
        <EmptyState
          title="ยังไม่มีไอเทม"
          description="ไปลงรบเพื่อรับของชิ้นแรก — มอนสเตอร์ดรอปอุปกรณ์ ทอง และวัสดุ"
          icon={<InventoryIcon className="h-6 w-6" />}
          action={
            <Link href="/world" className={primaryButtonClass}>
              <SwordsIcon className="h-4 w-4" />
              ลงรบ
            </Link>
          }
        />
      )}
      {list.status === 'ready' && items.length > 0 && (
        <section className={cardClass} aria-labelledby="items-title" aria-busy={pending}>
          <div className="flex items-end justify-between gap-3 border-b border-outline-variant/40 px-6 py-5">
            <h2 id="items-title" className="font-display text-headline-md text-on-surface">
              {shownQuery ? 'ผลการค้นหา' : 'ไอเทมทั้งหมด'}
            </h2>
            <span className="text-label-md font-normal text-on-surface-variant tabular-nums">{meta?.total ?? items.length} ชิ้น</span>
          </div>

          {/* desktop: ตาราง */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                  <th scope="col" className={thClass}>ชื่อ</th>
                  <th scope="col" className={thClass}>ช่อง</th>
                  <th scope="col" className={thClass}>ความหายาก</th>
                  <th scope="col" className={`${thClass} text-right`}>ค่าหลัก</th>
                  <th scope="col" className={thClass}>สถานะ</th>
                  <th scope="col" className={`${thClass} text-right`}>จัดการ</th>
                </tr>
              </thead>
              <tbody className="text-body-md">
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-surface/50">
                    <td className={`${tdClass} font-medium text-on-surface`}>{itemTitle(it)}</td>
                    <td className={`${tdClass} text-on-surface-variant`}>{SLOT_LABELS[it.slot]}</td>
                    <td className={tdClass}>
                      <StatusBadge tone={RARITY_TONE[it.rarity]}>{RARITY_LABELS[it.rarity]}</StatusBadge>
                    </td>
                    <td className={`${tdClass} text-right text-on-surface-variant tabular-nums`}>
                      {MAIN_STAT_LABELS[it.mainStat.stat] ?? it.mainStat.stat} +{fmt(it.mainStat.value)}
                    </td>
                    <td className={tdClass}>{it.equipped ? <StatusBadge tone="success">สวมอยู่</StatusBadge> : <span className="text-on-surface-variant">ในกระเป๋า</span>}</td>
                    <td className={`${tdClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          setOpenId(it.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-label-md text-primary-container hover:underline focus-visible:outline-2 focus-visible:outline-primary-container"
                        aria-label={`จัดการ ${itemTitle(it)}`}
                      >
                        จัดการ
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* มือถือ: รายการ */}
          <ul className="divide-y divide-outline-variant/40 md:hidden">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setOpenId(it.id);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-container"
                  aria-label={`จัดการ ${itemTitle(it)}`}
                >
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-body-md font-medium text-on-surface">{itemTitle(it)}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={RARITY_TONE[it.rarity]}>{RARITY_LABELS[it.rarity]}</StatusBadge>
                      <span className="text-label-md font-normal text-on-surface-variant">
                        {SLOT_LABELS[it.slot]} · {MAIN_STAT_LABELS[it.mainStat.stat] ?? it.mainStat.stat} +{fmt(it.mainStat.value)}
                      </span>
                      {it.equipped && <StatusBadge tone="success">สวมอยู่</StatusBadge>}
                    </span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-outline" />
                </button>
              </li>
            ))}
          </ul>

          <Pagination meta={meta} onPage={setPage} />
        </section>
      )}

      <ItemDialog
        key={openId ?? 'none'}
        item={open}
        gold={me?.gold ?? 0}
        materials={me?.materials ?? 0}
        gameData={gameData}
        busy={busy}
        error={actionError}
        onAction={(a) => void act(a)}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
