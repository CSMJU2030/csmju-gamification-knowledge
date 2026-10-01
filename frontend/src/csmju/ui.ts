/**
 * class สำเร็จรูป (ชุดจำลองของ `ui.ts` ใน template) — ค่าตาม ui-design-system ข้อ 7.2 · 7.2.1 · 8.2
 * เพิ่ม focus-visible ตามที่เอกสารระบุว่า "ต้องเพิ่ม" และ min-h-11 บนมือถือ (touch target 44px ข้อ 6.1)
 */
const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container';
const disabled = 'disabled:cursor-not-allowed disabled:opacity-40';
const textButton =
  'relative inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-label-md md:min-h-0';

export const primaryButtonClass = `${textButton} btn-gradient text-on-primary shadow-md hover:scale-[1.02] active:scale-[.98] disabled:hover:scale-100 ${disabled} ${focusRing}`;

export const secondaryButtonClass = `${textButton} border border-outline-variant bg-transparent text-on-surface-variant transition-colors duration-150 hover:bg-surface-variant/50 ${disabled} ${focusRing}`;

export const dangerButtonClass = `${textButton} bg-error text-on-primary transition-opacity duration-150 hover:opacity-90 ${disabled} ${focusRing}`;

export const inputClass =
  'input-field w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-body-md text-on-surface placeholder:text-outline/70 transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60';

export const cardClass =
  'overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-sm';

export const thClass = 'px-6 py-4 font-semibold whitespace-nowrap';

export const tdClass = 'px-6 py-4';

export const iconButtonClass = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-outline transition-colors duration-150 hover:text-primary-container md:min-h-0 md:min-w-0 ${disabled} ${focusRing}`;

export const iconDangerButtonClass = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-outline transition-colors duration-150 hover:text-error md:min-h-0 md:min-w-0 ${disabled} ${focusRing}`;
