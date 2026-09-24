# แผนย้าย Code Tower เข้ามาตรฐาน CSMJU2030

> ร่างเพื่อขออนุมัติ | PM ของ Code Tower | 24 ก.ย. 2026
> อ้างอิงมาตรฐาน `csmju2030-standards` v1.0.0 (commit `5bc9313`)

---

## 1. ทำไม และเป้าหมาย

Code Tower คือระบบย่อยที่ได้รับมอบหมายในโครงการ CSMJU2030 จึงต้องผ่านเกณฑ์เดียวกับทุกระบบย่อย:

- **CI 8 job** (`run-all-checks.sh`) เขียวหมด
- **conformance L3** — ระบบที่มีหน้าจอต้องถึง L3 (62 เคส) · `0 failed · 0 skipped`
- เข้าผ่าน **SSO ของ Core Hub** ได้จริง และทดสอบครบ 4 role

**เงื่อนไขของเราเอง (ห้ามเสียระหว่างย้าย):** เกมต้องเล่นได้เหมือนเดิมทุกตัวเลข —
เทสต์ engine 200 ตัวต้องผ่าน · golden fixture ต้องตรงทุกไบต์ · tune และ progsearch ต้องได้ค่าเดิม
การย้ายครั้งนี้เปลี่ยน "เปลือก" ไม่ใช่ "เกม"

## 2. ผลตรวจจริงตอนนี้ (รันสคริปต์ของมาตรฐานกับสำเนาของ Code Tower)

`run-all-checks.sh` ตก 5/18 — แต่หลายข้อที่ผ่านเป็น **ผ่านหลอก** เพราะสคริปต์สแกนแค่ `frontend/` `backend/`
ส่วนเราใช้ `client/` `server/` · เปลี่ยนชื่อโฟลเดอร์แล้วรันใหม่ ตกเพิ่มจริง:

| กฎ | สิ่งที่เจอ |
|---|---|
| SEC-04 | ออก JWT เองด้วย `jsonwebtoken` (`server/src/auth.ts:26`) |
| SEC-05 | มีหน้า login/สมัครของตัวเอง (`AuthPage.tsx`) |
| ARC-02 | `express` อยู่ในรายการห้าม · `better-sqlite3` `bcryptjs` `cors` `@tower/engine` ไม่อยู่ใน whitelist |
| UI-01 | สี hex ดิบในโค้ดหน้าจอ (รวม `sprites.json` 524 ค่า) |
| API-03/05 | ไม่มี envelope `{success,data}` · ไม่มี `GET /api/health` |
| QA-05 | ใช้ npm ไม่ใช่ pnpm |
| GH-01/04 | branch/`.standards-version` |

กฎในเอกสารที่สคริปต์ไม่ได้ตรวจแต่เราผิด: SQLite (ต้อง PostgreSQL 16+) · ตาราง `users` ของตัวเอง (DD-01)
· token ใน localStorage (SEC-03 — ต้อง httpOnly cookie) · URL เป็นคำกริยา (`/equip` `/salvage` `/tower/challenge`)
· id เป็นตัวเลข (conformance ยิงด้วย UUID) · หน้าจอไม่ได้อยู่ใน `<CsmjuAppShell>`

## 3. เก็บ · ย้าย · ทิ้ง

| ส่วน | ตอนนี้ | หลังย้าย | งาน |
|---|---|---|---|
| **engine + BloxCode** | TS ล้วน ไม่มี dependency | **เหมือนเดิมทุกบรรทัด** เป็น workspace `packages/engine` | ย้ายโฟลเดอร์ · ต้องขอ whitelist (D2) |
| backend | Express + better-sqlite3 (sync) | NestJS 11 + Prisma 7.9.1 + PostgreSQL 16 | เขียนใหม่ทั้งชั้น HTTP/DB · ตรรกะเกมเรียก engine เหมือนเดิม |
| auth | สมัคร/login/bcrypt/JWT ของเราเอง | **ทิ้งทั้งหมด** → คัดลอกชั้น auth จาก reference implementation | ห้ามเขียนเอง (AGENTS.md ข้อ 2) |
| ผู้ใช้ | ตาราง `users` + `characters.user_id` | `characters.core_user_id` (= `sub`) · ไม่มีตาราง users | ชื่อที่โชว์ในการดวล = ชื่อตัวละครที่ผู้เล่นตั้ง (D5) |
| frontend | React + Vite SPA · CSS เขียนเอง | Next.js 15.5 App Router + Tailwind v4 + template `csmju-subsystem-web` | หน้าเกมเป็น client component · เปลือก/เมนู/ฟอร์มใช้ของกลาง |
| หน้าตา | ธีมทอง/มิ้นต์ของเราเอง | **เปลือกทั้งหมดตาม design system กลาง** · เฉพาะ "เวทีเกม" ขอยกเว้น (D1) | ธีม 2U จะเหลือแค่ในเวทีเกม |
| API | `/api/me`, `/api/equip`, … | `/api/v1/<noun-plural>` + envelope + 7 error code | ออกแบบ path ใหม่ (ข้อ 5) |
| ข้อมูลเดิม | SQLite dev | เริ่มฐานใหม่บน PostgreSQL | ไม่ย้ายบัญชีเดิม (เป็นข้อมูล dev ทั้งหมด) |

## 4. เรื่องที่ต้องให้ PL/PM ตัดสิน (เปิด issue ตามกระบวนการข้อ 11 ของ ci-compliance-spec)

| # | เรื่อง | ทำไมต้องถาม | ข้อเสนอของเรา |
|---|---|---|---|
| **D1** | **หน้าตาของเกม** | design system ห้ามให้ "รู้สึกเหมือนเว็บเกม" และล็อกสีทั้งหมด แต่ฉากรบ pixel art · แผนที่โลก · สีบล็อกโค้ด คือตัวเกม | เปลือก เมนู ฟอร์ม รายการ **ตามมาตรฐาน 100%** · ขอ exception UI-01/UI-04 เฉพาะไฟล์ของ "เวทีเกม" (renderer · sprites · world map · block canvas) — มาตรฐานเปิดให้ "visualization/แผนที่" อิสระอยู่แล้ว |
| **D2** | engine เป็น workspace package | `@tower/engine` ไม่อยู่ใน whitelist แต่ทั้ง backend (จำลองการรบ) และ frontend (ตัวแก้บล็อก/ตรวจโค้ด) ต้องใช้ตัวเดียวกัน | ขอ exception ARC-02 ให้ package ภายในที่ **ไม่มี dependency เลย** · ทางเลือกคือก๊อปสองชุด ซึ่งจะเพี้ยนจากกันวันใดวันหนึ่ง (บทเรียนรอบ 2W) |
| D3 | role ที่เข้าเกมได้ | `default_role_mapping` คุมตั้งแต่ Core Hub | student → PLAYER · alumni → PLAYER · staff → INSTRUCTOR · admin → ADMIN |
| D4 | endpoint ที่ staff สร้างได้แต่ student ไม่ได้ | conformance L2 ต้องมี probe แบบนี้ · เกมตอนนี้ไม่มี | **โจทย์ของอาจารย์** `POST /api/v1/challenges` — อาจารย์ตั้งโจทย์ BloxCode ให้นักศึกษา (ฟีเจอร์ใหม่ที่เข้ากับเกมสอนเขียนโปรแกรม) |
| D5 | ชื่อที่โชว์ให้ผู้เล่นอื่นเห็น | token มีแค่ `sub` `email` `role` — ห้ามเดา username | ผู้เล่นตั้งชื่อตัวละครเองตอนเริ่ม · **ไม่โชว์อีเมลของคนอื่น** |
| D6 | งบประสิทธิภาพ | JS แรกเข้า ≤ 250KB gzip · Lighthouse ≥ 85 | bundle ตอนนี้ 113KB gzip ทั้งแอป · แยก route ให้ฉากรบโหลดเมื่อเข้าเท่านั้น — ต้องวัดจริงหลังย้าย |

## 5. API ใหม่ (ร่าง — ห้ามมีคำกริยาใน URL)

| ตอนนี้ | หลังย้าย |
|---|---|
| `POST /auth/register` `/auth/login` | ลบ — ใช้ SSO + `GET /auth/callback` + `GET /api/v1/me` (จากชั้น auth) |
| `GET /me` · `POST /me/class` | `GET /api/v1/characters/current` · `PATCH /api/v1/characters/current` |
| `GET` `PUT /program` | `GET` `PUT /api/v1/programs/current` |
| `GET /inventory` · `POST /equip` `/unequip` | `GET /api/v1/items` · `PATCH /api/v1/items/:id { equipped }` |
| `POST /upgrade` · `/salvage` | `POST /api/v1/item-upgrades` · `DELETE /api/v1/items/:id` (แยกเป็นวัตถุดิบ) |
| `GET /tower` · `POST /tower/challenge` | `GET /api/v1/tower-progress` · `POST /api/v1/battles { place: tower }` |
| `GET /world` · `POST /world/:id/enter` `/fight` `/leave` | `GET /api/v1/regions` · `POST /api/v1/region-runs` · `POST /api/v1/battles { runId }` · `DELETE /api/v1/region-runs/:id` |
| `GET /gamedata` | `GET /api/v1/game-data` |
| (ใหม่ D4) | `GET` `POST /api/v1/challenges` · `GET /api/v1/challenges/:id` |
| (ใหม่) | `GET /api/health` → `{ status, service: "csmju-code-tower" }` |

## 6. ลำดับงาน

| ขั้น | งาน | รอใคร | เสร็จเมื่อ |
|---|---|---|---|
| **0** | ขอสิทธิ์และข้อมูล (ข้อ 7) + เปิด issue D1–D2 | ทีมกลาง / PL | ได้ครบทุกรายการข้อ 7 |
| **1** | โครง pnpm: `frontend/` `backend/` `packages/engine` · ย้าย engine | **เริ่มได้เลย** | engine 200 เทสต์ผ่านบน pnpm · golden fixture ตรง |
| **2** | backend NestJS + Prisma/Postgres ครบทุกโดเมน · envelope · error code · health | เริ่มได้เลย (ใช้ Core Hub จำลองตามสัญญาทดสอบไปก่อน) | ผลการรบผ่าน API ตรงกับของเดิมทุกไบต์ที่ seed เดียวกัน · `run-all-checks` ฝั่ง backend เขียว |
| **3** | ชั้น auth จาก reference · SSO callback · cookie | **สิทธิ์เข้า `demo-student-subsystem`** | conformance L1 ผ่านกับ Core Hub จริง |
| **4** | frontend Next.js + template กลาง · 4 สถานะทุกหน้า · error mapping · 360px | **template `csmju-subsystem-web`** + คำตอบ D1 | ทุกหน้าในเกมเดิมใช้ได้ · Lighthouse ≥ 85/95 |
| **5** | โจทย์ของอาจารย์ (D4) · `subsystem.yaml` probes · conformance L2–L3 | คำตอบ D3–D4 | `62 passed · 0 failed · 0 skipped` |
| **6** | repo จริงด้วย `new-subsystem.sh` · ลงทะเบียน · PR · REPORT.md | PM/admin | CI 8 job เขียว · PL รับงาน |

ขั้น 1–2 ไม่ต้องรอใคร · ขั้น 3–4 ติดสิทธิ์เข้า repo private สองตัว — **ถ้าได้สิทธิ์ช้า งานจะตันที่ขั้น 3**

**เรื่องที่ต้องรู้ก่อนอนุมัติ:** Core Hub จำลองในขั้น 2 เป็นแค่นั่งร้านสำหรับทดสอบ ไม่ถูกส่งเข้า repo จริง
และ **ผ่านกับตัวจำลอง ≠ ผ่านกับของจริง** — เกณฑ์ขั้น 3 ขึ้นไปวัดกับ Core Hub จริงเท่านั้น

## 7. สิ่งที่ต้องขอจากทีมกลาง

| ขอจากใคร | สิ่งที่ต้องได้ | ใช้ในขั้น |
|---|---|---|
| PM / org admin | เป็นสมาชิกองค์กร CSMJU2030 · ทีม `aie-code-tower` · สร้าง repo `csmju-code-tower` | 0, 6 |
| PM / org admin | สิทธิ์อ่าน `csmju-core-hub` (template หน้าจอ + รัน Core Hub ในเครื่อง) และ `demo-student-subsystem` (ชั้น auth) | 3, 4 |
| ผู้ดูแล Dev Server | `CORE_HUB_URL` ที่ใช้ได้จริง | 3 |
| PL | ระดับ conformance เป้าหมาย (คาดว่า L3) · ขอบเขตงาน · คำตอบ D1–D6 | 0, 5 |
| admin ของ Core Hub | ลงทะเบียน + approve + activate ระบบย่อย | 5 |

## 8. ความเสี่ยง

| ความเสี่ยง | ผลถ้าเกิด | รับมือ |
|---|---|---|
| D1 ถูกปฏิเสธ | ฉากรบ/แผนที่ต้องใช้สีจาก token กลางเท่านั้น — pixel art เปลี่ยนหน้าตามาก | ออกแบบ sprite ใหม่ด้วย palette ของ token (ทำได้ แต่เป็นงานใหญ่) |
| D2 ถูกปฏิเสธ | engine ต้องมีสองชุด | ทำสคริปต์ sync + เทสต์เทียบสองชุด |
| สิทธิ์ repo private มาช้า | ตันที่ขั้น 3–4 | ทำขั้น 1–2 ให้จบก่อน |
| มาตรฐานขยับเวอร์ชัน | ตัวอย่าง `csmju-equipment` ผูกไว้ที่ 1.3.0 แต่ repo มาตรฐานประกาศ 1.0.0 | ถาม PL ว่าให้ผูกเวอร์ชันไหนตั้งแต่ขั้น 0 |
