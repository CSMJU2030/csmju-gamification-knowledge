'use client';

/**
 * รายการแบบแบ่งหน้า + ค้นหา (ui-design-system ข้อ 8.2) — ใช้ร่วมกันทุกตาราง
 *
 * useApi เก็บผลเดิมไว้ระหว่างโหลดใหม่ (ไม่กระพริบเป็น skeleton ทุกครั้งที่พิมพ์) จึงต้องรู้ว่าผลที่เห็น
 * มาจากคำค้นไหน: `pending` = กำลังรอผลของคำค้นใหม่ · `hasAny` = รู้จากผลที่ไม่มีคำค้นว่ามีข้อมูลอยู่บ้างไหม
 * (ใช้ตัดสินว่าจะโชว์ช่องค้นหาหรือสถานะ "ยังไม่มีข้อมูล" — ต่างจาก "ค้นหาไม่พบ" ตามข้อ 9.3)
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';
import type { PageMeta } from './types';
import { useApi } from './use-api';

export const PAGE_SIZE = 20;

export function useSearchList<T>(path: string) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [hasAny, setHasAny] = useState<boolean | null>(null);

  const list = useApi(
    async (signal) => ({ q, page, result: await api.page<T>(path, { page, limit: PAGE_SIZE, q: q || undefined }, signal) }),
    [path, q, page],
  );

  const loaded = list.status === 'ready' ? list.data : null;
  const rows: T[] = loaded?.result.data ?? [];
  const meta: PageMeta | undefined = loaded?.result.meta;
  const pending = list.status === 'loading' || (loaded !== null && (loaded.q !== q || loaded.page !== page));

  useEffect(() => {
    if (loaded && loaded.q === '') setHasAny((meta?.total ?? rows.length) > 0);
  }, [loaded, meta, rows.length]);

  const search = useCallback((next: string) => {
    setQ(next);
    setPage(1);
  }, []);

  return {
    q,
    search,
    page,
    setPage,
    list,
    rows,
    meta,
    pending,
    /** null = ยังไม่รู้ (โหลดครั้งแรก) */
    hasAny,
    /** คำค้นของผลที่แสดงอยู่ — ใช้ในข้อความ "ไม่พบ …" ให้ตรงกับผลจริง */
    shownQuery: loaded?.q ?? q,
    /** ข้อความผลการค้นหาสำหรับ aria-live */
    status: loaded && loaded.q !== '' && !pending ? `พบ ${loaded.result.meta?.total ?? rows.length} รายการ` : '',
  };
}
