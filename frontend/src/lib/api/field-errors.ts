/**
 * แยก `error.details` ของ 400 VALIDATION_ERROR ออกเป็นข้อความรายฟิลด์ (ฟอร์มแสดงใต้ฟิลด์ตามข้อ 8.1)
 * backend เขียน details สองแบบ: "field: ข้อความ" หรือข้อความที่มีชื่อฟิลด์อยู่ข้างใน
 */
export function fieldErrors<F extends string>(details: readonly string[], fields: readonly F[]): {
  byField: Partial<Record<F, string>>;
  rest: string[];
} {
  const byField: Partial<Record<F, string>> = {};
  const rest: string[] = [];
  for (const d of details) {
    const field = fields.find((f) => d.startsWith(`${f}:`) || d.startsWith(`${f} `) || d.includes(` ${f} `));
    if (!field) {
      rest.push(d);
      continue;
    }
    const text = d.startsWith(`${field}:`) ? d.slice(field.length + 1).trim() : d;
    byField[field] = byField[field] ? `${byField[field]} · ${text}` : text;
  }
  return { byField, rest };
}
