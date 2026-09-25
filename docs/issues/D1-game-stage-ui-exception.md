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

นอกจาก `UI-01` (hex ดิบ) ยังเกี่ยวกับกฎใน `ui-design-system.md` ฉบับบน main ข้อ 16.0 ("Tailwind CSS v4 เท่านั้น ·
CSS เขียนเองได้เฉพาะ class กลางใน `globals.css`") เพราะ canvas วาดด้วยโค้ด และสไตล์ของบล็อกโค้ดต้องใช้ CSS ของตัวเอง
ขอบเขตละเอียดของ "เวทีเกม" และสิ่งที่ **ไม่** อยู่ในเวทีเกม (ใช้ token กลาง 100%) อยู่ใน `docs/ui-g0-scoping.md` ข้อ 5

scope ระบุเป็นรายไฟล์ (ไม่ใช้ `*`) · ทุกรายการมี `expires` และ `issue` ตาม ci-compliance-spec ข้อ 11.1

## ไฟล์ที่ขอ (ตามโค้ดจริงบน branch — `run-all-checks` UI-01 ชี้ 6 ไฟล์นี้เท่านั้น)

| ไฟล์ | มีอะไร | ทำไมเป็นเวทีเกม |
|---|---|---|
| `frontend/src/game-stage/battle/effects.ts` | สีของเอฟเฟกต์สกิล 12 แบบ (ลูกไฟ เกล็ดน้ำแข็ง โดมโล่ …) | วาดลง canvas เป็นภาพ |
| `frontend/src/game-stage/battle/renderer.ts` | สีตัวเลขดาเมจลอย แถบเลือดเหนือหัว แสงวงใต้เท้า | วาดลง canvas |
| `frontend/src/game-stage/battle/spriteCache.ts` | สีย้อมตอนโดนตี/ล้ม และกล่องสำรองเมื่อไม่มีสไปรต์ | วาดลง canvas |
| `frontend/src/game-stage/sprites/schema.ts` | ตัวอย่าง palette ในคอมเมนต์ของสัญญาสไปรต์ | เอกสารของรูปแบบข้อมูลภาพ (palette จริงอยู่ใน `sprites.json` ซึ่ง UI-01 ไม่ตรวจ) |
| `frontend/src/game-stage/blox/blox.css` | สีบล็อกตามชนิดคำสั่ง 4 หมวด | ภาษาภาพของตัวแก้โค้ดแบบ Scratch/Blockly · ส่วนที่ไม่ใช่สีบล็อกอ้าง `var(--color-*)` |
| `frontend/src/game-stage/world/WorldMapStage.module.css` | หมุด ป้ายชื่อ และวงบนภาพแผนที่ | ต้องอ่านออกบนภาพวาดทุกสี (ขาวทึบ + ขอบกรมท่า) |

อีกสองเรื่องที่เกี่ยวกับกฎ "Tailwind เท่านั้น" (ui-design-system main ข้อ 16.0) ในไฟล์ชุดเดียวกัน:

- `blox.css` และ `WorldMapStage.module.css` เป็น CSS ที่เขียนเอง (ไฟล์หลังเป็น CSS Module) — ขอรวมใน exception นี้ ไม่ใช้ที่อื่นในระบบ
- ค่า px ดิบใน CSS สองไฟล์นี้ขึ้นเตือน UI-02 (warn ไม่ fail)

ทุกอย่างนอก `frontend/src/game-stage/` (หน้าใน `src/app/**` · `src/components/**`) ไม่มี hex · ไม่มี CSS ของตัวเอง · ไม่มี emoji

## ถ้าไม่อนุมัติ

sprite และแผนที่ต้องวาดใหม่ด้วยสีจาก token กลางเท่านั้น — ทำได้ แต่เป็นงานใหญ่ และภาพจะไม่ใช่ pixel art 16-bit อีกต่อไป
