# [D2] ขอให้ ARC-02 รับ package ภายใน workspace ที่ไม่มี dependency (`@tower/engine`)

**ถึง:** PL Code Tower · DevOps (เจ้าของ `scripts/lib/allowed-deps.json`)
**CI ที่ตก:** `ARC-02` — `backend/package.json (dependencies)` พบ `@tower/engine` ไม่อยู่ใน whitelist

## สิ่งที่เป็นอยู่

`@tower/engine` คือเครื่องคำนวณการรบและตัวแปลภาษา BloxCode ของเกม — **โค้ดของระบบนี้เอง** อยู่ใน repo เดียวกัน
(`packages/engine`) ไม่มี dependency ภายนอกเลย (`dependencies` ว่าง · dev ใช้แค่ typescript/vitest/eslint ที่อยู่ใน whitelist)

ต้องใช้ทั้งสองฝั่ง:
- backend — จำลองการรบ ตรวจโปรแกรมก่อนบันทึก (ผลต้องเหมือนเดิมทุกไบต์ — มี golden fixture และ parity test คุม)
- frontend — ตัวแก้บล็อกและการตรวจโค้ดขณะพิมพ์ (ต้องเป็นตัวแปลภาษาตัวเดียวกับที่ backend ใช้ตัดสิน)

## ทางเลือก

| ทาง | ผล |
|---|---|
| **A. เพิ่มกติกา: package ที่ติดตั้งด้วย `workspace:*` ผ่าน ARC-02** (แนะนำ) | ไม่มีโค้ดภายนอกเพิ่มเข้า stack · ระบบย่อยอื่นที่มีโค้ดใช้ร่วมหน้า-หลังได้ประโยชน์ด้วย |
| B. exception ใน `.compliance-exceptions.yml` | ต้องแก้ `check-authorized-deps.sh` ให้อ่านไฟล์นี้ก่อน — v1.0.0 ยังไม่อ่าน แม้ ci-compliance-spec ข้อ 11.1 จะมีตัวอย่าง exception ของ ARC-02 |
| C. ก๊อป engine เข้า backend/src และ frontend/src | สองสำเนาจะเพี้ยนจากกันวันใดวันหนึ่ง — เกิดจริงแล้วในโปรเจกต์นี้รอบ 2W (ตัวสุ่ม EX ของเซิร์ฟเวอร์เพี้ยนจาก engine เงียบ ๆ หลายสัปดาห์) |

ระหว่างรอคำตอบ ARC-02 จะเป็นเช็กเดียวที่ตกใน `run-all-checks` (17/18 ผ่าน)
