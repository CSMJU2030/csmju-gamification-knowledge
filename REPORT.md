# REPORT — csmju-gamification-knowledge (Code Tower)

> สถานะ: **ขั้น 1–2 ของแผนย้าย + frontend ชุดจำลอง** (docs/design-csmju-migration.md) · branch `feature/gamification-knowledge/migrate-code-tower`
> repo `CSMJU2030/csmju-gamification-knowledge` · ชื่อระบบย่อย `csmju-gamification-knowledge` · Code Tower คือชื่อเกม
> frontend ครบทุกหน้าตาม G0 แต่ใช้ **ชุดจำลองของ template** (`frontend/src/csmju/`) · **ทดสอบกับ Core Hub จริงแล้ว** (csmju-core-hub develop `6674ef6` รันในเครื่อง)

## ผลรัน

`./standards/scripts/run-all-checks.sh .` — 16/18 ผ่าน · ตัวที่ตกคือ ARC-02 (`@tower/engine` ทั้ง backend และ frontend) รอ D2
และ UI-01 (สีของภาพในเวทีเกม `frontend/src/game-stage/**` เท่านั้น) รอ D1 — ส่วนเปลือกระบบไม่มี hex เลย

```
  ✅ PASS  Convention Check            check-branch-name.sh
  ✅ PASS  Convention Check            check-commit-messages.sh
  ✅ PASS  Convention Check            check-ci-untouched.sh
  ✅ PASS  Standards Version Check     check-submodule-pointer.sh
  ✅ PASS  Security & Stack Scan       check-no-secrets.sh
  ✅ PASS  Security & Stack Scan       check-no-local-storage.sh
  ✅ PASS  Security & Stack Scan       check-no-jwt-verify.sh
  ✅ PASS  Security & Stack Scan       check-db-isolation.sh
  ❌ FAIL  Security & Stack Scan       check-authorized-deps.sh
  ✅ PASS  API Contract Sync           check-openapi-sync.sh
  ✅ PASS  API Contract Sync           check-api-conventions.sh
  ✅ PASS  Data Dictionary Compliance  check-field-aliases.sh
  ✅ PASS  Data Dictionary Compliance  check-snake-case.sh
  ✅ PASS  Data Dictionary Compliance  check-no-hardcoded-faculty.sh
  ✅ PASS  Data Dictionary Compliance  check-money-fields.sh
  ❌ FAIL  UI Token Compliance         check-ui-tokens.sh
  ✅ PASS  Code Quality                check-qa.sh
  ✅ PASS  Exception Validation        check-exceptions.sh

❌ 2 / 18 checks failed — merge would be blocked.
```

`node standards/conformance/run.js` — **รันกับ Core Hub จริง** (`csmju-core-hub` branch `develop` `6674ef6` รันในเครื่องโดยไม่แก้โค้ด ·
ดู `docs/local-integration.md`) · ยังไม่มี `CORE_HUB_URL` ของ Dev Server

```

── L3 · SSO — rejected handoffs
  PASS  L3-12      callback with a tampered token → 401
  PASS  L3-13      no session cookie is issued for a rejected token
  PASS  L3-14      callback without a token → 400 or 401
  PASS  L3-15      Core Hub rejects an unregistered callback_url

────────────────────────────────────────────────────────────
RESULT: 62 passed · 0 failed · 0 skipped
✅ CONFORMANT — csmju-gamification-knowledge meets standard v1.0 L3
```

**ทดสอบกับ Core Hub จริง** (26 ก.ย. 2569 · API และเบราว์เซอร์จริง): ลงทะเบียน → approve → activate · token ของทั้ง 4 role · SSO → callback → คุกกี้ ·
เข้าจากเมนูของ Core Hub · เปิด Code Tower โดยไม่มี session → login ที่ Core Hub → กลับหน้าเดิม · ปุ่มออกจากระบบ — ผลและสิ่งที่แก้อยู่ที่ `docs/local-integration.md`
(ก่อนหน้านี้ทดสอบกับ Core Hub จำลอง ซึ่งซ่อนปัญหาไว้ 3 ข้อ: หน้า login ไม่อ่าน `?subsystem=` · ไม่มี `/logout` · POST ตอบ 201 ไม่ใช่ 200)

**Playtest รอบ A (26 ก.ย. 2569)** — แก้หลอด MP ที่หมดทั้งที่ยังร่ายได้ · คำอธิบายสกิลจากค่าของตัวรบ · ครั้งแรกที่จุดใหม่ต้องดูฉากจนจบ + การ์ดผลบอกการเติบโตแบบก่อน → หลัง
รายละเอียดอยู่ที่ `docs/playtest/round-a-2026-09-26.md`

**Playtest รอบ B (26 ก.ย. 2569)** — EXP ช่วงต้นลดลง (ชนะชั้น 1 ครั้งแรกไป lv3 จากเดิม lv5 · จบป่า lv7 จากเดิม lv9) ·
ป่ารอบ 3-4 หมาป่าง้างหมายหัว ให้ defend() มีที่ใช้ครั้งแรก · `cast()` ใช้ได้ตั้งแต่ชั้น 1 พร้อมเลือกอาชีพ ·
ตัวอย่างการรบของแต่ละอาชีพก่อนเลือก (`POST /api/v1/characters/current/class-trials`) — ผลวัดก่อน/หลังที่ `docs/playtest/round-b-2026-09-26.md`

**ช่องค้นหาในตาราง (ui-design-system ข้อ 8.2)** — กระเป๋า · ประวัติการรบ · โจทย์ ค้นที่ backend ด้วย `?q=`
(ชื่อไอเทม · ชื่อสถานที่ · ชื่อและคำอธิบายโจทย์) · แยกสถานะ "ค้นหาไม่พบ" (ปุ่มล้างการค้นหา) ออกจาก "ยังไม่มีข้อมูล"

**Lighthouse 12 + axe-core 4 (26 ก.ย. 2569 · production build · ทุกหน้า)** — เกณฑ์ข้อ 18.1: A11y ≥ 95 · Performance ≥ 85

| หน้า | มือถือ Perf (ค่ากลาง 3 รอบ) | เดสก์ท็อป Perf | A11y | axe 1280 / 390px |
|---|---|---|---|---|
| `/` ตัวละคร | 90 | 98 | 100 | 0 / 0 |
| `/program` | 88 | 99 | 100 | 0 / 0 |
| `/world` | 91 | 100 | 100 | 0 / 0 |
| `/world/run` (เปิดตรงไม่มีรอบ → กลับ `/world`) | 89 | 99 | 100 | 0 / 0 |
| `/tower` | 93 | 100 | 100 | 0 / 0 |
| `/battle` | 97 | 100 | 100 | 0 / 0 |
| `/battles` | 94 | 100 | 100 | 0 / 0 |
| `/items` | 95 | 100 | 100 | 0 / 0 |
| `/challenges` | 94 | 100 | 100 | 0 / 0 |
| `/challenges/:id` | 95 | 100 | 100 | 0 / 0 |
| `/challenges/new` (ผู้สอน) | 94 | 100 | 100 | 0 / 0 |
| `/challenges/:id/edit` (ผู้สอน) | 92 | 100 | 100 | 0 / 0 |
| 404 | Lighthouse ไม่วัดหน้าที่ตอบ 404 | — | — | 0 / 0 |

ก่อนแก้: `/world` มือถือ 82 (ภาพแผนที่ = LCP รอ API สองตัวก่อนเริ่มโหลด) · `/` 80 (JS ของหน้าอื่นจาก prefetch ลิงก์บนจอ)
และ A11y 96 (ช่องอุปกรณ์ว่างคอนทราสต์ 4.48:1) · Best Practices 96 ทุกหน้า (ไม่มี favicon) · CLS ของ `/tower` `/items` `/` เกิน 0.1
Best Practices ยัง 96 ที่หน้าของผู้สอนสองหน้า — `/characters/current` ตอบ 404 เพราะผู้สอนไม่มีตัวละคร (ตั้งใจ) เบราว์เซอร์จึงบันทึกเป็น error

การทดสอบอื่นที่รันจริง:

| ชุด | ผล |
|---|---|
| engine (vitest) | 223 ผ่าน · รวม differential กับ CPython และ golden fixture ของหอคอย · MP ใน event และข้อความสกิล (รอบ A) · EXP ช่วงต้นและกลไกป่า (รอบ B) |
| backend unit (jest, ไม่ใช้ฐานข้อมูล) | 87 ผ่าน · รวมเคส 403 ของ PermissionsGuard · โปรแกรมตัวอย่างอาชีพ |
| backend e2e (jest + PostgreSQL 16 จริง) | 27 ผ่าน (ค้นหาในตารางทั้งสาม · ไม่มี login/logout ของตัวเอง (404) ·เพิ่ม game-data สำหรับผู้สอนที่ไม่มีตัวละคร · ครั้งที่รบที่จุดเดียวกัน + `mpAfter` · ตัวอย่างอาชีพ) |
| frontend (vitest + jsdom) | 74 ผ่าน · ช่องค้นหา (หน่วง 300ms · Enter · Esc · ล้างจากข้างนอก) · ปุ่มออกจากระบบ (แค่ไปหน้าแรกของ Core Hub ไม่เรียก API · กัน 401 ระหว่างออก) · ตัวเล่นฉากรบ (รวมหลอด MP) บันทึกการรบ ตัวแยกข้อผิดพลาดของโปรแกรม round-trip บล็อก↔โค้ด กฎแผนที่ สรุปการเติบโต |
| frontend `next build` | ผ่าน · JS แรกเข้าทุกหน้า 119–129 kB (งบ ≤ 250 kB gzip) · ลิงก์ prefetch เมื่อชี้/โฟกัส/แตะเท่านั้น · ฉากรบ สไปรต์ เอดิเตอร์+ล่าม แยก chunk โหลดเฉพาะหน้าที่ใช้ |
| เดินเว็บจริงด้วย Playwright (Core Hub จำลอง + backend + frontend production) | ครบวง: เข้าเว็บไม่มีคุกกี้ → หน้า login ของ Core Hub จำลอง → callback → สร้างตัวละคร → หอคอยชั้น 1 → เวทีรบ → ผลรบ → เลือกอาชีพ → โปรแกรม → แผนที่ → คำประกาศ → รบในภูมิภาค + ดวล → กระเป๋า → ประวัติ → โจทย์ (ผู้เล่นเห็นอย่างเดียว · ผู้สอนสร้าง/แก้ได้ · โปรแกรมตั้งต้นผิด → ข้อความใต้ช่อง) · 360px ไม่มี scroll แนวนอนทุกหน้า · console ไม่มี error นอกจาก 401/404/400 ที่ตั้งใจ |
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
- `subsystem.yaml` — probes ชี้ `/api/v1/challenges` · ส่วน `ui` (เมนู · local_components)
- `frontend/` — Next.js 15.5 App Router · React 19 · Tailwind v4 (ครบทุกหน้าใน G0 ข้อ 3)
  - `src/csmju/` — **ชุดจำลองของ template** `csmju-subsystem-web` เขียนตามสเปค ui-design-system ข้อ 5, 7 (ชื่อ export ตรงเอกสาร) · แทนทั้งโฟลเดอร์เมื่อได้ของจริง
  - `src/app/globals.css` — token ข้อ 3–4 ครบ เขียนเป็น `rgb()` เพราะ UI-01 ของ v1.0.0 ไม่ยกเว้น globals.css (ฉบับ main ยกเว้นแล้ว)
  - `src/components/` — local component ชั่วคราว (Toast · EmptyState · ErrorState · Skeleton · FormField · ProgressBar · Pagination · Alert)
  - `src/lib/api/` — type generate จาก `backend/openapi.json` (`pnpm --filter frontend generate:api`) · ตัวเรียก API แกะ envelope · 401 → SSO
  - `src/game-stage/` — **เวทีเกม** (ขอบเขต D1): ฉากรบ canvas · เอดิเตอร์บล็อก · แผนที่ · สไปรต์
- `backend/src/**/*.dto.ts` — OpenAPI ละเอียดขึ้นให้ frontend generate type ได้จริง (บันทึกการรบ · ค่าสถานะรวม · ความชำนาญ · สกิล · อาชีพ · regionId ที่เป็น null ได้) · runtime ไม่เปลี่ยน
- `backend/src/game-data/` — เพิ่ม `regions` (id · ชื่อไทย · จำนวนรอบ) ให้ผู้สอนที่ไม่มีตัวละครใช้ในฟอร์มโจทย์

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

10. frontend เรียก API ผ่าน origin เดียวกัน (Next rewrites `/api/*` และ `/auth/callback` ไป backend) — คุกกี้ HttpOnly ไปกับคำขอเองโดยไม่ต้องเปิด CORS
11. หลัง SSO backend พากลับ `/` เสมอ — ก่อนพาไป login frontend จำ path ไว้ใน `sessionStorage` (ไม่ใช่ token) แล้วพากลับหลัง `/me` สำเร็จ
12. ผลการรบส่งจากหน้าที่กด "เริ่มรบ" ไปหน้า `/battle` ในหน่วยความจำของแท็บ — รีเฟรชแล้วฉากหายแต่ผลบันทึกแล้ว ดูย้อนได้ที่ `/battles`
13. สีความหายากของไอเทมใช้ tone ของ StatusBadge กลาง (ธรรมดา=เทา · ไม่ธรรมดา=เขียว · หายาก=น้ำเงิน · มหากาพย์=ส้ม · ตำนาน=แดง) — ไม่ใช้สีเกม

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
- **ยังไม่ได้รันกับ Core Hub บน Dev Server** — ทดสอบกับ `csmju-core-hub` develop ที่รันในเครื่องแล้ว · ยังไม่มี `CORE_HUB_URL` จริง
- **`demo-student-subsystem` ยังอ่านไม่ได้** (clone แล้วได้ `could not read Username`) — ชั้น auth จึงยังไม่ใช่ของ reference
- **ออกจากระบบ** — ปุ่ม (บังคับตาม ui-design-system ข้อ 5.1) แค่พาไปหน้าแรกของ Core Hub ไม่เรียก API ใด ๆ · ระบบนี้ไม่มี logout ของตัวเอง (auth-contract ข้อ 9)
  ข้อจำกัดของสัญญา 1.0 (ยังไม่มี SSO logout ข้อ 11): คุกกี้ของเกมยังใช้ได้จนหมดอายุ ≤ 15 นาที — ตรวจแล้ว (W4c) ว่าออกจาก Core Hub แล้วเปิดเกมทันทียังเข้าเป็นคนเดิมได้
  เครื่องที่ใช้ร่วมกันต้องรอให้หมดอายุหรือปิดเบราว์เซอร์ · แก้จริงต้องรอ SSO logout ของ Core Hub
- **`prisma migrate deploy` ยังไม่ได้รันจริง** — เครื่องทดสอบออกเน็ตไป binaries.prisma.sh ไม่ได้ (ดูข้อถัดไป) · บนเครื่องที่ออกเน็ตได้ต้องรันตามคู่มือข้อ 6.3
- **ชั้น auth ยังไม่ใช่ของ reference** — รอสิทธิ์ `demo-student-subsystem`
- **UI-01 ตก เฉพาะเวทีเกม** — สีของ sprite เอฟเฟกต์ บล็อกโค้ด และหมุดบนแผนที่ (6 ไฟล์ใต้ `frontend/src/game-stage/`) รอ D1 · ไม่ได้แปลง hex เป็น `rgb()` เพื่อเลี่ยงการตรวจ เพราะเนื้อหายังเป็นสีนอก token อยู่ดี ให้ exception เป็นทางที่ตรวจสอบได้
- **frontend ยังเป็นชุดจำลอง** — `src/csmju/` เขียนจากสเปค ไม่ใช่ template จริง (ยังไม่มีสิทธิ์อ่าน `csmju-core-hub`) · โลโก้เป็นตัวอักษรแทนภาพ · ช่องค้นหาและกระดิ่งบน top bar เป็นภาพประกอบ (disable)
- **Lighthouse วัดบนเครื่องพัฒนา** — Chromium headless · ตัวเลขมือถือแกว่ง ±5 ระหว่างรอบ จึงรายงานค่ากลางของ 3 รอบ · ยังไม่ได้ทดสอบบน Safari iOS / Android จริง (ข้อ 18.2)
- **ยังไม่ได้ตรวจ migration drift ด้วย Prisma** — `prisma migrate diff` ต้องใช้ schema engine ซึ่งเครื่องที่พัฒนาดาวน์โหลดไม่ได้ (proxy ตอบ 403 ที่ binaries.prisma.sh)
  migration เขียนตามรูปแบบของ Prisma และทดสอบแล้วว่า Prisma Client ทำงานกับมันได้ครบทุก query (e2e 21 ชุด) — ต้องรันบนเครื่องที่ต่อเน็ตได้ (ตาม data-dictionary.md ข้อ 9.3): `pnpm --filter backend exec prisma migrate deploy` แล้ว `pnpm --filter backend exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` ต้องได้ No difference detected
- **พฤติกรรมเดิมที่คงไว้ (ไม่ใช่บั๊กของการย้าย):** คนที่สามที่เข้าโซนตอนมีคู่ที่จับกันสองทางอยู่แล้ว จะดวลแบบทางเดียวกับคนล่าสุดในคู่นั้น (ออกแบบไว้ในรอบ 2W · parity ยืนยันว่าเหมือนเดิม) — ถ้าอยากให้จับคู่ใหม่ได้มากขึ้นเป็นงานออกแบบรอบหน้า
- **ขีดความสามารถที่วัดได้:** เข้าโซนเดียวกันพร้อมกัน 400 คน ตอบ 201 ครบ ช้าสุด 3.4 วินาที · 600 คนพร้อมกันในโซนเดียวเริ่มมี 500 (Prisma รอคิวทรานแซกชันเกิน 2 วินาที) — เกินขนาดห้องเรียนมาก
