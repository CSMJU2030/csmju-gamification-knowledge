'use client';

/**
 * `<Link>` ที่ prefetch เมื่อผู้ใช้ "ตั้งใจ" จะไป (ชี้เมาส์ · โฟกัส · แตะ) แทนการ prefetch ทุกลิงก์ที่มองเห็น
 *
 * ทำไม: ค่าเริ่มต้นของ Next โหลดและ parse JS ของทุกหน้าที่มีลิงก์อยู่บนจอทันทีที่หน้าเปิด
 * (เมนูข้าง 7 หน้า + ลิงก์ในเนื้อหา) — บนมือถือ Lighthouse เห็นเป็น long task ของหน้าอื่นระหว่างโหลด
 * (เช่น JS ของ /world 108ms บนหน้า /) ดัน TBT ของหน้าแรกขึ้นไป ~400ms
 * prefetch ตอนชี้/แตะยังทำให้เปลี่ยนหน้าเร็วเหมือนเดิมเกือบทุกครั้ง (มีเวลาระหว่างชี้กับกด)
 *
 * ใช้แทน `next/link` ทั้งแอป — prop เหมือนกันทุกตัว ส่ง `prefetch` เองได้ถ้าต้องการพฤติกรรมเดิม
 */
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps, FocusEvent, MouseEvent, TouchEvent } from 'react';

type Props = ComponentProps<typeof NextLink>;

export default function AppLink({ prefetch, onMouseEnter, onFocus, onTouchStart, href, ...rest }: Props) {
  const router = useRouter();
  const intent = () => {
    if (prefetch === undefined && typeof href === 'string' && href.startsWith('/')) router.prefetch(href);
  };
  return (
    <NextLink
      href={href}
      prefetch={prefetch ?? false}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        intent();
        onMouseEnter?.(e);
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        intent();
        onFocus?.(e);
      }}
      onTouchStart={(e: TouchEvent<HTMLAnchorElement>) => {
        intent();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
}
