/**
 * จับคู่คำค้นหากับข้อความที่ไม่ได้อยู่ในฐานข้อมูล (ชื่อไทยของไอเทม · ชื่อภูมิภาค มาจาก gamedata)
 * ค้นแบบ "มีคำนี้อยู่ในชื่อ" · ไม่สนตัวพิมพ์เล็ก/ใหญ่ · ยุบช่องว่างซ้อน
 */
const normalize = (text: string): string => text.normalize('NFC').toLocaleLowerCase('th').replace(/\s+/g, ' ').trim();

export function textMatches(text: string, q: string): boolean {
  return normalize(text).includes(normalize(q));
}

/** id ของรายการที่ชื่อตรงกับคำค้น — ใช้กรองใน DB ด้วย `{ in: ids }` */
export function idsMatching<T>(entries: readonly T[], q: string, id: (e: T) => string, name: (e: T) => string): string[] {
  return entries.filter((e) => textMatches(name(e), q)).map(id);
}
