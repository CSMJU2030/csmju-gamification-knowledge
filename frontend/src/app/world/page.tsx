'use client';

/**
 * /world — แผนที่โลก: เลือกโซนและรอบที่จะลง (G0 ข้อ 3) · ย้ายจาก client/src/pages/WorldMapPage.tsx
 *
 * จังหวะการกดบังคับโดยเกม ไม่ใช่โดยรสนิยม:
 *   เลือกโซน → การ์ดโซน → POST /region-runs → **หน้าคำประกาศ /world/run** → "เริ่มรบ" → POST /battles
 * คำประกาศเป็นด่านที่ข้ามไม่ได้ เพราะเกมสัญญาว่า "รู้ก่อนว่าจะเจออะไร" — มอน EX หรือคู่ดวล
 * ที่โผล่กลางรอบโดยไม่บอกก่อนทำให้สัญญานั้นเป็นโมฆะ จึงห้ามยุบสองคำขอนี้เป็นอันเดียว
 *
 * `?region=<id>` เปิดการ์ดโซนนั้นค้างไว้ — หน้า /battle และปุ่ม "ออกจากโซน" พากลับมาแบบนี้
 * การเลือกโซนเขียนกลับลง URL ด้วย replaceState (ไม่เพิ่มประวัติ) ปุ่มย้อนกลับจึงไม่ต้องไล่ทีละโซน
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapIcon, PageHeader, PersonIcon, StatusBadge, cardClass, primaryButtonClass } from '@/csmju';
import { EmptyState, ErrorState } from '@/components/feedback';
import { ApiError, api, userMessage } from '@/lib/api/client';
import type { Character, Region, RegionRun } from '@/lib/api/types';
import { useApi } from '@/lib/api/use-api';
import { useGame } from '@/lib/game/session';
import RegionDetailCard from '@/game-stage/world/RegionDetailCard';
import RegionList, { regionRowId } from '@/game-stage/world/RegionList';
import WorldMapStage from '@/game-stage/world/WorldMapStage';
import WorldSkeleton, {
  WORLD_DETAIL_CELL,
  WORLD_GRID,
  WORLD_LIST_CELL,
  WORLD_MAP_CELL,
} from '@/game-stage/world/WorldSkeleton';
import { errorStateMessage } from '@/game-stage/world/logic';
import { setRegionRun } from '@/game-stage/world/run-store';

function WorldHeader({ character }: { character?: Character }) {
  return (
    <PageHeader
      title="แผนที่โลก"
      description="เลือกโซนและรอบที่จะลง แล้วดูก่อนว่ารอบนั้นจะเจออะไร"
      aside={
        character ? (
          <StatusBadge tone="neutral">ความยากสูงสุดที่ผ่านแล้ว {character.highestFloorCleared}</StatusBadge>
        ) : undefined
      }
    />
  );
}

export default function WorldPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ไม่งั้น build แบบ static ของ Next ล้ม
  return (
    <Suspense
      fallback={
        <>
          <WorldHeader />
          <WorldSkeleton />
        </>
      }
    >
      <WorldGate />
    </Suspense>
  );
}

/** สถานะของตัวละครมาก่อน — GET /regions ตอบ 404 ถ้ายังไม่มีตัวละคร จึงยังไม่ยิงจนกว่าจะรู้ว่ามี */
function WorldGate() {
  const { character, reloadCharacter } = useGame();

  if (character.status === 'loading') {
    return (
      <>
        <WorldHeader />
        <WorldSkeleton />
      </>
    );
  }
  if (character.status === 'error') {
    return (
      <>
        <WorldHeader />
        <ErrorState message={errorStateMessage(character.error)} onRetry={reloadCharacter} />
      </>
    );
  }
  if (character.status === 'none') {
    return (
      <>
        <WorldHeader />
        <EmptyState
          icon={<PersonIcon className="h-6 w-6" />}
          title="ยังไม่มีตัวละคร"
          description="สร้างตัวละครก่อน แล้วค่อยกลับมาเลือกโซนที่จะลงรบ"
          action={
            <Link href="/" className={primaryButtonClass}>
              ไปสร้างตัวละคร
            </Link>
          }
        />
      </>
    );
  }
  return <WorldMap character={character.character} />;
}

function WorldMap({ character }: { character: Character }) {
  const router = useRouter();
  const regionParam = useSearchParams().get('region');
  const regions = useApi((signal) => api.page<Region>('/regions', { limit: 100 }, signal).then((r) => r.data), []);

  const [selectedId, setSelectedId] = useState<string | null>(regionParam);
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** เพิ่มค่าเมื่อผู้เล่นเลือกโซนเอง — ค่อยย้ายโฟกัสหลังการ์ดใหม่ render แล้ว (ไม่ย้ายตอนเปิดจาก URL) */
  const [focusNonce, setFocusNonce] = useState(0);

  // URL เปลี่ยนจากข้างนอก (เช่นกดเมนู "แผนที่โลก" ซ้ำ) → ตามให้ตรง
  useEffect(() => {
    setSelectedId(regionParam);
  }, [regionParam]);

  const list = useMemo(() => (regions.status === 'ready' ? regions.data : []), [regions]);
  const selected = useMemo(() => list.find((r) => r.id === selectedId) ?? null, [list, selectedId]);

  const writeUrl = (id: string | null) => {
    window.history.replaceState(null, '', id ? `/world?region=${encodeURIComponent(id)}` : '/world');
  };

  const select = useCallback((r: Region) => {
    setSelectedId(r.id);
    setEnterError(null);
    writeUrl(r.id);
    setFocusNonce((n) => n + 1);
  }, []);

  const close = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    setEnterError(null);
    writeUrl(null);
    // คืนโฟกัสให้แถวของโซนนั้นในรายการ — ไม่ปล่อยโฟกัสหายไปกับการ์ดที่ถูกถอด
    if (id) window.requestAnimationFrame(() => document.getElementById(regionRowId(id))?.focus());
  }, [selectedId]);

  useEffect(() => {
    if (!focusNonce) return;
    const h = headingRef.current;
    if (!h) return;
    h.focus({ preventScroll: true });
    // มือถือการ์ดอยู่ใต้แผนที่ ส่วนรายการอยู่ใต้การ์ด — เลือกจากรายการแล้วต้องเลื่อนขึ้นมาให้เห็น
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    h.closest('section')?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [focusNonce]);

  const enter = useCallback(
    async (region: Region, depth: number) => {
      if (entering) return;
      setEntering(true);
      setEnterError(null);
      try {
        const run = await api.post<RegionRun>('/region-runs', { regionId: region.id, depth });
        setRegionRun({ run, regionName: region.nameTh, receivedAt: Date.now() });
        // ปุ่มค้างสถานะ loading ไว้จนเปลี่ยนหน้า — กันกดซ้ำแล้วได้รอบที่สองมาทับ
        router.push('/world/run');
      } catch (e) {
        if (e instanceof ApiError && e.code === 'UNAUTHORIZED') return;
        setEnterError(userMessage(e));
        setEntering(false);
        // 409 แปลว่าข้อมูลบนจอเก่ากว่าเซิร์ฟเวอร์ (เช่นแท็บอื่นเล่นไปแล้ว) — โหลดใหม่เงียบ ๆ ให้สถานะตรง
        if (e instanceof ApiError && e.code === 'CONFLICT') regions.reload();
      }
    },
    [entering, router, regions],
  );

  if (regions.status === 'loading') {
    return (
      <>
        <WorldHeader character={character} />
        <WorldSkeleton label="กำลังโหลดรายการโซน" />
      </>
    );
  }
  if (regions.status === 'error') {
    return (
      <>
        <WorldHeader character={character} />
        <ErrorState message={errorStateMessage(regions.error)} onRetry={regions.reload} />
      </>
    );
  }
  if (list.length === 0) {
    return (
      <>
        <WorldHeader character={character} />
        <EmptyState
          icon={<MapIcon className="h-6 w-6" />}
          title="ยังไม่มีโซนบนแผนที่"
          description="ระบบยังไม่ได้เปิดโซนให้ลงรบ ระหว่างนี้ท้าทายหอคอยได้"
          action={
            <Link href="/tower" className={primaryButtonClass}>
              ไปหน้าหอคอย
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <WorldHeader character={character} />
      <div className={WORLD_GRID}>
        <div className={WORLD_MAP_CELL}>
          <section aria-label="แผนที่โลก" className={cardClass}>
            <WorldMapStage regions={list} selectedId={selectedId} onSelect={select} />
          </section>
        </div>

        <div className={selected ? WORLD_DETAIL_CELL : `${WORLD_DETAIL_CELL} hidden xl:block`}>
          {selected ? (
            <RegionDetailCard
              key={selected.id}
              region={selected}
              headingRef={headingRef}
              entering={entering}
              error={enterError}
              onRetryLoad={() => {
                setEnterError(null);
                regions.reload();
              }}
              onEnter={(depth) => void enter(selected, depth)}
              onClose={close}
            />
          ) : (
            <div className={`${cardClass} space-y-2 p-6`}>
              <h2 className="font-display text-headline-md text-on-surface">ยังไม่ได้เลือกโซน</h2>
              <p className="text-body-md text-on-surface-variant">
                กดจุดบนแผนที่หรือเลือกจากรายการ เพื่อดูบทเรียน โอกาสเจอมอน EX และรอบที่เข้าได้
              </p>
            </div>
          )}
        </div>

        <div className={WORLD_LIST_CELL}>
          <RegionList regions={list} selectedId={selectedId} onSelect={select} />
        </div>
      </div>
    </>
  );
}
