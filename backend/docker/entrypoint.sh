#!/bin/sh
# api สตาร์ต (deployment.md ข้อ 3.1 · 4.1): ลง migration ที่ยังไม่ได้ลง แล้วเปิด server
# - ใช้ prisma migrate deploy เท่านั้น — ห้าม migrate dev · db push · seed ตอนสตาร์ต
# - migration ที่ขึ้น server แล้วห้ามแก้หรือลบ (เพิ่ม migration ใหม่เท่านั้น)
# - exec ให้ node เป็น PID 1 รับสัญญาณหยุดจาก docker เอง
set -eu

cd "$(dirname "$0")/.."
./node_modules/.bin/prisma migrate deploy
exec node dist/main.js
