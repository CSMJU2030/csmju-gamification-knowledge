# [D1] ขอ exception UI-01/UI-04 เฉพาะ "เวทีเกม" ของ Code Tower

**ถึง:** PL Code Tower · DevOps (ผู้ดูแล `.compliance-exceptions.yml`)
**มาตรฐานที่เกี่ยว:** `ui-design-system.md` (token กลาง · ห้ามรู้สึกเหมือนเว็บเกม) · CI `UI-01` (ห้าม hex ดิบ) · `UI-04`

## สิ่งที่ขอ

ส่วนที่เป็นเปลือกของระบบ — เมนู ฟอร์ม รายการ ตาราง ปุ่ม การแจ้งเตือน หน้าโปรไฟล์ — ใช้ template
`csmju-subsystem-web` และ token กลาง **100%** ไม่ขอยกเว้นอะไรเลย

ขอ exception เฉพาะไฟล์ที่เป็น "เวทีเกม" ซึ่งเป็นเนื้อหา ไม่ใช่ UI ของระบบ:

| ส่วน | ทำไมใช้ token กลางไม่ได้ |
|---|---|
| ฉากรบ (canvas renderer + sprite pixel art 16-bit) | สีของ sprite คือภาพวาด — palette จำกัดของ pixel art ไม่ใช่สีของ UI |
| แผนที่โลก (ภาพ + hotspot ของภูมิภาค) | ภาพประกอบ · มาตรฐานเปิดให้ "visualization/แผนที่" อิสระอยู่แล้ว |
| บล็อกโค้ด BloxCode (สีตามชนิดบล็อก) | สีสื่อชนิดคำสั่งแบบเดียวกับ Scratch/Blockly — เป็นภาษาภาพของตัวแก้โค้ด |

scope จะระบุเป็นรายไฟล์ (ไม่ใช้ `*`) เช่น `frontend/src/game-stage/**/*.ts` หลังได้ template แล้ว
ทุกรายการมี `expires` และ `issue` ตาม ci-compliance-spec ข้อ 11.1

## ถ้าไม่อนุมัติ

sprite และแผนที่ต้องวาดใหม่ด้วยสีจาก token กลางเท่านั้น — ทำได้ แต่เป็นงานใหญ่ และภาพจะไม่ใช่ pixel art 16-bit อีกต่อไป
