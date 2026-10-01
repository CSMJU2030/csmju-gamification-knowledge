'use client';

/**
 * นับถอยหลังถึง expiresAt ของรอบ — แยกเป็นคอมโพเนนต์ของตัวเองเพื่อให้ re-render ทุกวินาทีแค่ตรงนี้
 * ไม่ใช่ทั้งหน้าคำประกาศ
 *
 * role="timer" มี aria-live เป็น off โดยปริยาย: screen reader อ่านได้เมื่อผู้ใช้ไปหา
 * แต่ไม่ถูกขัดทุกวินาที · ตัวเลขใหญ่เป็น aria-hidden เพราะ "4:05" อ่านออกเสียงไม่รู้เรื่อง
 */
import { useEffect, useRef, useState } from 'react';
import { clockTrusted, formatCountdown, remainingMs, spokenCountdown } from './logic';

export default function RunCountdown({
  expiresAt,
  receivedAt,
  onExpire,
}: {
  expiresAt: string;
  receivedAt: number;
  onExpire: () => void;
}) {
  const trusted = clockTrusted(expiresAt, receivedAt);
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!trusted) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [trusted]);

  const left = remainingMs(expiresAt, now);

  useEffect(() => {
    if (!trusted || left > 0 || fired.current) return;
    fired.current = true;
    onExpireRef.current();
  }, [trusted, left]);

  if (!trusted) {
    // นาฬิกาเครื่องเพี้ยนเกินอายุรอบ — ไม่เดาเวลาให้ผิด ปล่อยให้เซิร์ฟเวอร์ตัดสินตอนกดเริ่มรบ
    return (
      <p className="text-body-md text-on-surface-variant">
        รอบนี้จองที่ไว้ให้ชั่วคราว ถ้าหมดเวลาแล้วระบบจะแจ้งตอนกดเริ่มรบ
      </p>
    );
  }

  return (
    <div role="timer" aria-label={`เหลือเวลาตัดสินใจ ${spokenCountdown(left)}`} className="space-y-1">
      <p className="text-label-md font-normal text-on-surface-variant" aria-hidden="true">
        เหลือเวลาตัดสินใจ
      </p>
      <p className="font-display text-headline-lg text-on-surface tabular-nums" aria-hidden="true">
        {formatCountdown(left)}
      </p>
    </div>
  );
}
