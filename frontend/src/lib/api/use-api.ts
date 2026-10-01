'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';

export type ApiState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: ApiError };

/**
 * โหลดข้อมูลหนึ่งก้อนพร้อมสถานะ loading/ready/error (กฎเหล็กข้อ 7 — 4 สถานะ)
 * `reload()` ใช้กับปุ่ม "ลองอีกครั้ง" · `set()` ใช้แทนที่ข้อมูลหลังแก้ไขสำเร็จโดยไม่ต้องโหลดใหม่
 */
export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[] = []) {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    loadRef
      .current(ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) setState({ status: 'ready', data });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiError && e.code === 'UNAUTHORIZED') return; // shell พาไป SSO แล้ว
        setState({
          status: 'error',
          error: e instanceof ApiError ? e : new ApiError(0, 'INTERNAL_ERROR', 'ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง'),
        });
      });
    return () => ctrl.abort();
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const set = useCallback((data: T) => setState({ status: 'ready', data }), []);

  return { ...state, state, reload, set };
}
