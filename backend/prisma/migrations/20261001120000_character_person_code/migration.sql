-- รหัสนักศึกษา/บุคลากรจาก Core Hub GET /people/me ตอนสร้างตัวละคร (standards 1.7.0 · reference-data.md 1.3 ข้อ 8)
-- null = บัญชีที่ไม่ได้ผูกกับบุคคล หรือตัวละครที่สร้างก่อนมีคอลัมน์นี้
ALTER TABLE "characters" ADD COLUMN "person_code" TEXT;
