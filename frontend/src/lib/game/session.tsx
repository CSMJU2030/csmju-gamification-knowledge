'use client';

/**
 * สถานะของเกมที่หลายหน้าใช้ร่วมกัน: ตัวละครของผู้ใช้ + ตารางชื่อจาก game-data + สิทธิ์จาก /me
 *
 * ตัวละครมี 4 สถานะ: loading · none (404 = ยังไม่สร้าง → หน้าแรกเป็นฟอร์มสร้าง) · ready · error
 * หน้าที่แก้ตัวละคร (รบ สวมของ เลือกอาชีพ) ส่งตัวละครใหม่จาก response เข้ามาที่ `setCharacter`
 * แทนการโหลดซ้ำ — backend คืนตัวละครหลังบันทึกแล้วในทุก endpoint ที่แก้มันอยู่แล้ว
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCsmjuUser } from '@/csmju';
import { api, ApiError } from '@/lib/api/client';
import type { Character, GameData } from '@/lib/api/types';

export type CharacterState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'ready'; character: Character }
  | { status: 'error'; error: ApiError };

interface GameSession {
  character: CharacterState;
  gameData: GameData | null;
  permissions: string[];
  role: string | null;
  coreUserId: string | null;
  can: (permission: string) => boolean;
  setCharacter: (c: Character) => void;
  reloadCharacter: () => void;
}

const GameContext = createContext<GameSession | null>(null);

export function useGame(): GameSession {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame ต้องอยู่ใน <GameProvider>');
  return ctx;
}

/** ตัวละครที่พร้อมใช้ — ใช้ในหน้าที่แสดงเฉพาะเมื่อมีตัวละครแล้ว */
export function useReadyCharacter(): Character | null {
  const { character } = useGame();
  return character.status === 'ready' ? character.character : null;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const user = useCsmjuUser();
  const [character, setCharacterState] = useState<CharacterState>({ status: 'loading' });
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .get<Character>('/characters/current', undefined, ctrl.signal)
      .then((c) => setCharacterState({ status: 'ready', character: c }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiError && e.code === 'NOT_FOUND') setCharacterState({ status: 'none' });
        else if (e instanceof ApiError && e.code === 'UNAUTHORIZED') return;
        else
          setCharacterState({
            status: 'error',
            error: e instanceof ApiError ? e : new ApiError(0, 'INTERNAL_ERROR', 'ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง'),
          });
      });
    return () => ctrl.abort();
  }, [nonce]);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .get<GameData>('/game-data', undefined, ctrl.signal)
      .then(setGameData)
      .catch(() => {
        // ชื่อไทยมีค่าสำรองใน labels.ts — หน้าไม่ต้องพังเพราะตารางชื่อโหลดไม่ขึ้น
      });
    return () => ctrl.abort();
  }, []);

  const permissions = useMemo(() => (user.status === 'ready' ? user.user.permissions : []), [user]);
  const can = useCallback((p: string) => permissions.includes(p), [permissions]);
  const setCharacter = useCallback((c: Character) => setCharacterState({ status: 'ready', character: c }), []);
  const reloadCharacter = useCallback(() => {
    setCharacterState({ status: 'loading' });
    setNonce((n) => n + 1);
  }, []);

  const value = useMemo<GameSession>(
    () => ({
      character,
      gameData,
      permissions,
      role: user.status === 'ready' ? user.user.subsystemRole : null,
      coreUserId: user.status === 'ready' ? user.user.id : null,
      can,
      setCharacter,
      reloadCharacter,
    }),
    [character, gameData, permissions, user, can, setCharacter, reloadCharacter],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
