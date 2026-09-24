# REPORT — csmju-code-tower

> สถานะ: **ขั้น 1–2 ของแผนย้าย** (docs/design-csmju-migration.md) · branch `feature/code-tower/migrate-backend`
> ขั้น 3–6 ยังติดสิทธิ์เข้า repo กลางและคำตอบ D1–D6 (ดูหัวข้อสุดท้าย)

## ผลรัน

`./standards/scripts/run-all-checks.sh .` — 17/18 ผ่าน · ตัวที่ตกคือ ARC-02 (`@tower/engine`) ซึ่งรอคำตอบ D2

```
  ✅ PASS  API Contract Sync           check-api-conventions.sh
  ✅ PASS  Data Dictionary Compliance  check-field-aliases.sh
  ✅ PASS  Data Dictionary Compliance  check-snake-case.sh
  ✅ PASS  Data Dictionary Compliance  check-no-hardcoded-faculty.sh
  ✅ PASS  Data Dictionary Compliance  check-money-fields.sh
  ✅ PASS  UI Token Compliance         check-ui-tokens.sh
  ✅ PASS  Code Quality                check-qa.sh
  ✅ PASS  Exception Validation        check-exceptions.sh

❌ 1 / 18 checks failed — merge would be blocked.
```

`node standards/conformance/run.js` — **รันกับ Core Hub จำลอง** (สคริปต์ทดสอบของทีม ไม่อยู่ใน repo นี้)
ผ่านกับตัวจำลอง ≠ ผ่านกับ Core Hub จริง ต้องรันซ้ำเมื่อได้ `CORE_HUB_URL`

```

── L3 · SSO — rejected handoffs
  PASS  L3-12      callback with a tampered token → 401
  PASS  L3-13      no session cookie is issued for a rejected token
  PASS  L3-14      callback without a token → 400 or 401
  PASS  L3-15      Core Hub rejects an unregistered callback_url

────────────────────────────────────────────────────────────
RESULT: 62 passed · 0 failed · 0 skipped
✅ CONFORMANT — csmju-code-tower meets standard v1.0 L3
```

การทดสอบอื่นที่รันจริง:

| ชุด | ผล |
|---|---|
| engine (vitest) | 209 ผ่าน · รวม differential กับ CPython และ golden fixture ของหอคอย |
| backend unit (jest, ไม่ใช้ฐานข้อมูล) | 84 ผ่าน · รวมเคส 403 ของ PermissionsGuard |
| backend e2e (jest + PostgreSQL 16 จริง) | 21 ผ่าน · รันซ้ำ 3 รอบติดกันผ่านทุกรอบ |
| parity กับเซิร์ฟเวอร์เดิม (Express + SQLite) | **132/132 ขั้นตรงกัน** · เทียบบันทึกการรบ 4,074 เหตุการณ์ (หอคอย · ภูมิภาค · กลไกหมายหัว · ดวลออนไลน์สองทาง · ดวลสแนปช็อต · ถูกปฏิเสธ · หมดอายุ) |
| ทดสอบแบบพยายามล้ม (เอเจนต์อิสระ 3 รอบ) | รอบแรกเจอ 7 ข้อ รอบสองเจอ 2 ข้อ รอบสามเจอ 1 ข้อที่แก้ได้ — แก้ครบและมีเทสต์กันถอยทุกข้อ (ดูด้านล่าง) |

## ไฟล์ที่สร้าง/แก้ไข

- `packages/engine/` — engine เดิมย้ายเข้า pnpm workspace (ตรรกะเดิม) + เพดานความลึกของนิพจน์ `MAX_EXPR_DEPTH` / `MAX_AST_DEPTH` (กัน stack ล้น → 500)
- `backend/prisma/schema.prisma` · `migrations/20260924120000_init` — 8 ตาราง snake_case · UUID · created_at/updated_at ทุกตาราง · ไม่มีตาราง user
- `backend/src/main.ts` — `setGlobalPrefix('api')` ยกเว้น `GET /auth/callback` · controller ธุรกิจอยู่ใต้ `v1/`
- `backend/src/common/` — envelope (interceptor) · exception filter 7 รหัส · ValidationPipe · pagination · decorator ของ OpenAPI
- `backend/src/config/` — env + ตรวจค่าสัญญา (issuer/audience/SUBSYSTEM_ID) ตอนบูต
- `backend/src/auth/` — ชั้น auth **ชั่วคราว** (ดูหัวข้อถัดไป)
- `backend/src/characters|programs|items|world|battles|game-data|game/` — ย้ายทุกโดเมนจากเซิร์ฟเวอร์เดิม
- `backend/src/challenges/` — โจทย์ของผู้สอน (ร่าง D4)
- `backend/openapi.json` · `backend/scripts/generate-openapi.ts` — สัญญา API สร้างจาก decorator
- `backend/test/` — unit · e2e · Core Hub จำลองสำหรับเทสต์ (กุญแจสร้างใหม่ทุกครั้ง)
- `subsystem.yaml` — probes ชี้ `/api/v1/challenges`

## ชั้น auth ที่คัดลอกมา

- คัดลอกจาก demo-student-subsystem: **ยังไม่ได้** — ยังไม่มีสิทธิ์อ่าน repo นั้น
- ที่มีตอนนี้เขียนตาม `auth-contract.md` ทีละข้อ (jose · JWKS แคช/รีเฟรชครั้งเดียว/จำกัดอัตรา/ใช้กุญแจเดิมตอน Core Hub ล่ม ·
  ตรวจ 8 ขั้น · Bearer ก่อนคุกกี้ · callback ตั้งคุกกี้ HttpOnly SameSite=Lax อายุไม่เกิน exp · ไม่มี Set-Cookie เมื่อไม่ผ่าน)
  ทุกไฟล์มีหมายเหตุ "ต้องแทนที่ด้วยไฟล์ของ reference" — จะแทนทั้งไฟล์ในขั้น 3
- แก้ไข: ไม่มี (ยังไม่มีต้นฉบับให้แก้)

## Role mapping ที่ประกาศ (ต้องตรงกับ default_role_mapping ในทะเบียน)

| core role | subsystem role |
|---|---|
| student | PLAYER |
| alumni | PLAYER |
| staff | INSTRUCTOR |
| admin | ADMIN |

ข้อเสนอ D3 — รอ PL ยืนยันก่อนลงทะเบียน · สิทธิ์ของแต่ละ role อยู่ใน `backend/src/auth/permissions.ts` ที่เดียว

## ข้อสมมติที่ตั้งเอง (เพราะมาตรฐานไม่ได้ระบุ)

1. ชื่อที่ผู้เล่นคนอื่นเห็นคือ `displayName` ที่ตั้งเองตอนสร้างตัวละคร (D5) — ไม่ใช้อีเมลจาก token
2. ผู้สอน (INSTRUCTOR) เล่นเกมได้ด้วย เพื่อทดลองโจทย์ที่ตัวเองสร้าง
3. ข้อผิดพลาดของ BloxCode ตอบ 400 `VALIDATION_ERROR` และ `details` เป็น `"<บรรทัด>:<คอลัมน์>:<ชื่อ>:<ข้อความไทย>"` เพื่อให้เป็น array ของ string ตามสัญญาแต่ยังชี้บรรทัดได้
4. สถานะที่ไม่อนุญาตในเกม (ยังเข้าโซนไม่ได้ · สู้ซ้ำ · ทรัพยากรไม่พอ · เลือกอาชีพซ้ำ) ตอบ 409 `CONFLICT` — เซิร์ฟเวอร์เดิมตอบ 400
5. ของของผู้เล่นคนอื่น (ไอเทม · รอบในภูมิภาค) ตอบ 403 ไม่ใช่ 404 ตาม authorization.md ข้อ 5
6. `seq` (เลขลำดับการสร้าง) ในตาราง characters/items/duel_snapshots ทำหน้าที่ของ INTEGER id เดิม — engine ใช้เลข 32 บิตเป็น seed และการเรียงของระบบดวลต้องนิ่ง · id ที่ส่งออก API เป็น UUID เสมอ
7. JSON ที่เก็บผลของ engine ใช้ `json` ไม่ใช่ `jsonb` — jsonb เรียง key ใหม่ ทำให้บันทึกการรบที่อ่านคืนไม่ตรงทุกไบต์
8. body-parser 413/415 ตอบเป็น 400 `BAD_REQUEST` เพราะตารางรหัสปิดผูก BAD_REQUEST กับ 400
9. ข้อมูลเกมเริ่มใหม่ในฐานข้อมูลนี้ — ไม่ได้ย้ายเซฟจาก SQLite เดิม (มีแต่บัญชีทดสอบ) จึงไม่ได้ย้ายโค้ด migration ของเซฟรุ่นเก่า (rules_json · stat_points ค้าง)

## สิ่งที่พบจากการทดสอบแบบพยายามล้ม และแก้แล้ว

| สิ่งที่พบ | แก้ |
|---|---|
| สองคนเข้าโซนพร้อมกัน → deadlock → 500 | ลบรอบเดิมก่อนเปิดทรานแซกชัน + advisory lock ต่อภูมิภาค |
| สองคนเข้าโซนเดียวกันพร้อมกันเป๊ะ → ไม่ได้จับคู่ดวล (19/20) | lock ต่อภูมิภาคก่อนสร้างแถว · เทสต์ยืนยันว่าถ้าเอา lock ออกจะตก |
| ลบ/แก้พร้อมกัน → 500 | `deleteMany` + ตรวจจำนวน · แปลง Prisma P2025/P2002/P2034 เป็น 404/409 |
| `null` ในช่องที่ไม่บังคับ → 500 | `OptionalButNotNull` · เลิกใช้ `PartialType` กับ DTO ที่แก้บางช่อง |
| อักขระ NUL → 500 | ตรวจใน DTO ทุกช่องข้อความ |
| วงเล็บซ้อนพันชั้น / `1+1+…` เก้าพันตัว → stack ล้น → 500 | เพดานใน parser ของ engine (SyntaxError อ่านรู้เรื่อง) |
| `page=1e308` → 500 | เพดาน page 100000 |
| body ใหญ่/encoding ผิด → รหัสไม่ตรงสถานะ | ตอบ 400 BAD_REQUEST |

## สิ่งที่ยังทำไม่ได้ / เคสที่ยังไม่ผ่าน

- **ARC-02 ตก** — `@tower/engine` ไม่อยู่ใน whitelist · รอ D2 (ร่าง issue: `docs/issues/D2-engine-workspace-package.md`)
  หมายเหตุ: `check-authorized-deps.sh` ของ v1.0.0 ไม่อ่าน `.compliance-exceptions.yml` แม้ ci-compliance-spec ข้อ 11.1 จะมีตัวอย่าง exception ของ ARC-02 — ต้องให้ DevOps ตัดสินว่าจะเพิ่ม whitelist หรือแก้สคริปต์
- **ยังไม่ได้รันกับ Core Hub จริง** — conformance 62/62 ข้างบนเป็นผลกับตัวจำลอง · รอ `CORE_HUB_URL` และการลงทะเบียน
- **ชั้น auth ยังไม่ใช่ของ reference** — รอสิทธิ์ `demo-student-subsystem`
- **ยังไม่มี frontend** — รอ template `csmju-subsystem-web` และคำตอบ D1 (ร่าง issue: `docs/issues/D1-game-stage-ui-exception.md`)
- **ยังไม่ได้ตรวจ migration drift ด้วย Prisma** — `prisma migrate diff` ต้องใช้ schema engine ซึ่งเครื่องที่พัฒนาดาวน์โหลดไม่ได้ (proxy ตอบ 403 ที่ binaries.prisma.sh)
  migration เขียนตามรูปแบบของ Prisma และทดสอบแล้วว่า Prisma Client ทำงานกับมันได้ครบทุก query (e2e 21 ชุด) — ต้องรันบนเครื่องที่ต่อเน็ตได้ (ตาม data-dictionary.md ข้อ 9.3): `pnpm --filter backend exec prisma migrate deploy` แล้ว `pnpm --filter backend exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` ต้องได้ No difference detected
- **พฤติกรรมเดิมที่คงไว้ (ไม่ใช่บั๊กของการย้าย):** คนที่สามที่เข้าโซนตอนมีคู่ที่จับกันสองทางอยู่แล้ว จะดวลแบบทางเดียวกับคนล่าสุดในคู่นั้น (ออกแบบไว้ในรอบ 2W · parity ยืนยันว่าเหมือนเดิม) — ถ้าอยากให้จับคู่ใหม่ได้มากขึ้นเป็นงานออกแบบรอบหน้า
- **ขีดความสามารถที่วัดได้:** เข้าโซนเดียวกันพร้อมกัน 400 คน ตอบ 201 ครบ ช้าสุด 3.4 วินาที · 600 คนพร้อมกันในโซนเดียวเริ่มมี 500 (Prisma รอคิวทรานแซกชันเกิน 2 วินาที) — เกินขนาดห้องเรียนมาก
