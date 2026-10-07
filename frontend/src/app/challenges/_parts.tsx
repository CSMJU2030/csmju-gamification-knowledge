'use client';

/**
 * ของที่หน้าโจทย์ใช้ร่วมกัน: สิทธิ์แก้/ลบ · ปุ่มลบพร้อมยืนยัน (ฟอร์มสร้าง/แก้อยู่ที่ _form.tsx)
 * UI ตัดสินจาก permissions ใน GET /me (G0 ข้อ 4) — backend ตรวจความเป็นเจ้าของซ้ำเสมอ
 */
import { useState, type ReactNode } from 'react';
import { ConfirmDeleteModal } from '@/csmju';
import { Alert } from '@/components/feedback';
import { useToast } from '@/components/Toast';
import { api, userMessage } from '@/lib/api/client';
import type { Challenge } from '@/lib/api/types';
import { useGame } from '@/lib/game/session';

export function useChallengePermissions() {
  const { can, coreUserId } = useGame();
  return {
    canCreate: can('challenge:create'),
    canEdit: (c: Challenge) => can('challenge:update:any') || (can('challenge:update:own') && c.coreUserId === coreUserId),
    canDelete: (c: Challenge) => can('challenge:delete:any') || (can('challenge:delete:own') && c.coreUserId === coreUserId),
    isMine: (c: Challenge) => c.coreUserId === coreUserId,
  };
}

export function DeleteChallenge({
  challenge,
  onDeleted,
  children,
  className,
}: {
  challenge: Challenge;
  onDeleted: () => void;
  children: ReactNode;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/challenges/${challenge.id}`);
      setOpen(false);
      toast(`ลบโจทย์ "${challenge.title}" แล้ว`);
      onDeleted();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label={`ลบ ${challenge.title}`}>
        {children}
      </button>
      <ConfirmDeleteModal
        open={open}
        title="ลบโจทย์"
        itemName={challenge.title}
        description={
          <>
            ผู้เล่นที่เปิดโจทย์นี้อยู่จะไม่เห็นอีก ลบแล้วเอาคืนไม่ได้
            {error && (
              <span className="mt-3 block">
                <Alert>{error}</Alert>
              </span>
            )}
          </>
        }
        loading={busy}
        onCancel={() => !busy && setOpen(false)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
