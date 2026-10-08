/**
 * โลโก้สาขาวิชา (ui-design-system ข้อ 14.1) — ไฟล์จาก `standards/templates/csmju-subsystem-web/public/csmju-logo.png`
 *
 * ย่อเหลือกว้าง 480px ไว้ที่ `public/csmju-logo.png` (ต้นฉบับ 8192px · 435 KB → 52 KB) ให้คมที่ 240px บนจอ 2x
 * และใช้ <img> ธรรมดาแทน next/image — container บน server อ่านอย่างเดียว ตัวย่อภาพของ Next เขียน cache ไม่ได้
 * แสดงบนพื้นขาวเสมอ (การ์ดบนแถบข้าง) · กว้างไม่ต่ำกว่า 120px ตามข้อ 14.1
 */
export function CsmjuLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/csmju-logo.png"
      alt="โลโก้ สาขาวิทยาการคอมพิวเตอร์ มหาวิทยาลัยแม่โจ้"
      width={240}
      height={170}
      className={`block h-auto w-full max-w-60 min-w-[120px] object-contain ${className}`}
    />
  );
}
