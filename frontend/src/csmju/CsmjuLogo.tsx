/**
 * ชุดจำลอง: ยังไม่มีไฟล์โลโก้จริง (`csmju-logo.png` อยู่ใน csmju-core-hub ที่ยังไม่มีสิทธิ์อ่าน)
 * จึงแสดงเป็นตัวอักษรแทน — ของจริงแทนที่ทั้งไฟล์เมื่อได้ template
 */
export function CsmjuLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex flex-col leading-none ${className}`} aria-label="CSMJU Computer Science Maejo University">
      <span className="font-display text-headline-md font-extrabold text-gradient">CSMJU</span>
      <span lang="en" className="mt-1 text-caption text-secondary">
        Computer Science · Maejo University
      </span>
    </span>
  );
}
