-- ภูมิภาคที่พิสูจน์บทเรียนแล้ว (8 ต.ค. 2569 · docs/design-skill-acquisition.md ระยะ S1) — ได้สกิลประจำภูมิภาคของอาชีพตัวเอง
-- ตัวละครเดิมเริ่มที่ว่าง (ประวัติการรบไม่ได้เก็บเหตุการณ์ ย้อนตรวจไม่ได้) · รูปแบบเดียวกับที่ Prisma สร้างให้ String[] @default([])
ALTER TABLE "characters" ADD COLUMN     "proved_regions" TEXT[] DEFAULT ARRAY[]::TEXT[];
