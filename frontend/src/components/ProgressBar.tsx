/**
 * แถบความคืบหน้า (local component ชั่วคราว — ProgressBar ในข้อ 7.1 ยังไม่มีใน template)
 * สีจาก token เท่านั้น · inline style ใช้กับความกว้างอย่างเดียว
 */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
  size = 'md',
}: {
  value: number;
  max: number;
  /** ชื่อที่ screen reader อ่าน */
  label: string;
  /** ข้อความแทนตัวเลข เช่น "310 จาก 500" */
  valueText?: string;
  size?: 'sm' | 'md';
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
      className={`w-full overflow-hidden rounded-full bg-surface-container ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}
    >
      <div
        className="h-full rounded-full bg-primary-container transition-[width] duration-300 ease-out"
        style={{ width: `${Math.round(ratio * 1000) / 10}%` }}
      />
    </div>
  );
}
