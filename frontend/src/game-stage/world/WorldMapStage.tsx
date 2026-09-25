'use client';

/**
 * เวทีแผนที่โลก — ภาพแผนที่ + ปุ่ม hotspot ของทุกโซน (ย้ายจากผืนแผนที่ใน client/src/pages/WorldMapPage.tsx)
 *
 * ของเดิมเป็น "พื้นผิวหลัก" เต็มจอไม่มีกรอบ · ตอนนี้อยู่ในการ์ดมาตรฐานตาม G0 ข้อ 5.3
 * ปุ่มทุกจุดเป็น <button> จริงที่มี aria-label ครบ (ชื่อ + สถานะ + คนในโซน) ส่วนของบนภาพเป็น aria-hidden
 * รายการโซนแบบข้อความอยู่คู่กันเสมอ (RegionList) — แผนที่ไม่ใช่ทางเดียวที่จะเลือกโซนได้
 */
import { useMemo, useState, type ReactNode } from 'react';
import { CheckIcon, LockIcon, SwordsIcon } from '@/csmju';
import type { Region } from '@/lib/api/types';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  hotspotLabel,
  hotspotPosition,
  liftWidth,
  regionStatus,
  type RegionStatus,
} from './logic';
import styles from './WorldMapStage.module.css';

/** เมืองไม่มีไอคอนในชุดกลาง — วาดหลังคาบ้านเองในเวที (รูปทรงต้องต่างจากอีกสามสถานะ) */
function TownGlyph(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d="M3 11 12 4l9 7" />
      <path d="M6 10v10h12V10" />
    </svg>
  );
}

const MARK_CLASS: Record<RegionStatus, string> = {
  open: styles.open,
  progress: styles.open,
  done: styles.done,
  locked: styles.locked,
  town: styles.town,
};

function MarkIcon({ status }: { status: RegionStatus }) {
  if (status === 'done') return <CheckIcon />;
  if (status === 'locked') return <LockIcon />;
  if (status === 'town') return <TownGlyph />;
  return <SwordsIcon />;
}

export default function WorldMapStage({
  regions,
  selectedId,
  onSelect,
}: {
  regions: Region[];
  selectedId: string | null;
  onSelect: (region: Region) => void;
}) {
  /** โซนที่เมาส์/โฟกัสอยู่ — ชนะโซนที่เลือกไว้ เพราะมันคือสิ่งที่ผู้เล่นกำลังชี้อยู่ตอนนี้ */
  const [hoverId, setHoverId] = useState<string | null>(null);
  const activeId = hoverId ?? selectedId;
  const active = useMemo(() => regions.find((r) => r.id === activeId) ?? null, [regions, activeId]);

  return (
    <div className={styles.stage}>
      <div className={styles.plane} data-active={active ? '' : undefined}>
        <picture>
          {/* จอกว้างค่อยโหลดภาพเต็ม 1920px (360KB) · จอแคบได้ไฟล์ 960px (110KB) พอ (G0 ข้อ 8 · LCP) */}
          <source media="(min-width: 768px)" srcSet="/worldmap.jpg" />
          <img
            className={styles.img}
            src="/worldmap-small.jpg"
            alt="แผนที่โลกของ Code Tower"
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            decoding="async"
          />
        </picture>

        <span className={styles.dim} aria-hidden="true" />
        {active && (
          <span
            className={styles.lift}
            aria-hidden="true"
            style={{ ...hotspotPosition(active.hotspot), width: liftWidth(active.hotspot) }}
          />
        )}

        <div role="group" aria-label="โซนบนแผนที่">
          {regions.map((r) => {
            const status = regionStatus(r);
            const on = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                className={styles.spot}
                data-status={status}
                style={hotspotPosition(r.hotspot)}
                aria-pressed={on}
                aria-label={hotspotLabel(r)}
                onClick={() => onSelect(r)}
                onPointerEnter={() => setHoverId(r.id)}
                onPointerLeave={() => setHoverId((h) => (h === r.id ? null : h))}
                onFocus={() => setHoverId(r.id)}
                onBlur={() => setHoverId((h) => (h === r.id ? null : h))}
              >
                <span className={`${styles.marker} ${MARK_CLASS[status]}`} aria-hidden="true">
                  {r.playersHere > 0 && <span className={styles.pulse} />}
                  <MarkIcon status={status} />
                  {r.playersHere > 0 && <span className={styles.count}>{r.playersHere}</span>}
                </span>
                <span className={styles.label} aria-hidden="true">
                  {r.nameTh}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <MapLegend />
    </div>
  );
}

function LegendItem({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2">
      {mark}
      <span>{children}</span>
    </li>
  );
}

/**
 * คำอธิบายเครื่องหมาย — ตัวหนังสือใช้ token กลาง ส่วนวงสีจำลองหมุดบนภาพ (ของเวที)
 * อยู่ใต้ภาพเสมอ ไม่ลอยทับ เพราะมุมไหนของภาพก็มีผืนดินที่ตัวหนังสือจมหาย
 */
function MapLegend() {
  const mark = (status: RegionStatus) => (
    <span className={`${styles.legendMark} ${MARK_CLASS[status]}`} aria-hidden="true">
      <MarkIcon status={status} />
    </span>
  );
  return (
    <ul
      className="flex flex-wrap gap-x-5 gap-y-2 border-t border-outline-variant/40 px-4 py-3 text-label-md font-normal text-on-surface-variant md:px-6"
      aria-label="ความหมายของเครื่องหมายบนแผนที่"
    >
      <LegendItem mark={mark('open')}>เข้าได้</LegendItem>
      <LegendItem mark={mark('done')}>ผ่านแล้ว</LegendItem>
      <LegendItem mark={mark('locked')}>ล็อก</LegendItem>
      <LegendItem mark={mark('town')}>ไม่มีการรบ</LegendItem>
      <LegendItem
        mark={
          <span className={styles.legendCount} aria-hidden="true">
            2
          </span>
        }
      >
        จำนวนผู้เล่นในโซนตอนนี้
      </LegendItem>
    </ul>
  );
}
