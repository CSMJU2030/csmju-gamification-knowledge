# ส่งมอบเข้า git — สถานะและขั้นตอน

> 26 ก.ย. 2026: org admin สร้าง repo ให้แล้วเป็น **`CSMJU2030/csmju-gamification-knowledge`** (scaffold จาก standards v1.0.0 บน `main`)
> งานทั้งหมดอยู่บน branch **`feature/gamification-knowledge/migrate-code-tower`** ต่อจาก `main` ของ repo นี้ — ไม่แตะ `main`
> ชื่อระบบย่อยจึงเป็น `csmju-gamification-knowledge` (ต้องตรงกันทั้งทะเบียน Core Hub · `subsystem.yaml` · `/api/health`) · Code Tower คือชื่อเกม

---

## 1. สิ่งที่ขอจาก PM / org admin

| # | ขอ | สถานะ |
|---|---|---|
| 1 | repo ของระบบ | ✅ `CSMJU2030/csmju-gamification-knowledge` |
| 2 | Team `pl-gamification-knowledge` / `aie-gamification-knowledge` และ ruleset | ตามที่ scaffold ใส่ไว้ใน `CODEOWNERS` · `subsystem.yaml` |
| 3 | สิทธิ์อ่าน `csmju-core-hub` | ไม่ต้องใช้แล้ว — standards 1.7.0 ห้ามโคลนหรือรัน Core Hub เอง (มีข้อมูลนักศึกษาจริง) · ไม่มีสำเนาเหลือในเครื่องพัฒนา |
| 3b | สิทธิ์อ่าน `demo-student-subsystem` | ยังไม่ได้ (`could not read Username`) — ชั้น auth ยังไม่ใช่ของ reference |
| 4 | `CORE_HUB_URL` ของ server จริง | ✅ `https://csmju2030.jowave.com` (API ใต้ `/api/v1` · เว็บที่ `/`) — standards 1.7.0 |
| 5 | ลงทะเบียนในหลังบ้านของ Core Hub จริง (ข้อ 3) | ยังไม่ได้ — PL ใช้บัญชีเจ้าของระบบของทีมกรอกฟอร์ม `/backoffice/subsystems/new` แล้วรอ admin อนุมัติ + เปิดใช้งาน |
| 6 | บัญชีทดสอบร่วม (staff · lecturer · alumni · guest) และพอร์ต 32xx/42xx ของทีม | ยังไม่ได้ — รับจากผู้ดูแล dev server ทางข้อความส่วนตัว |

## 2. ย้ายประวัติเข้า repo นี้ (ทำแล้ว)

scaffold บน `main` ของ repo นี้เป็นคนละ commit กับ scaffold ใน repo `csmju-code-tower` ของเครื่องเรา (สคริปต์เดียวกัน คนละครั้ง)
จึงย้ายเฉพาะ commit ที่เป็นงานของเรา (17 commit หลัง "pin standards submodule" `e84d0d2`) ไปต่อท้าย `main`:

```bash
git clone https://github.com/CSMJU2030/csmju-gamification-knowledge.git && cd csmju-gamification-knowledge
git remote add codetower <repo csmju-code-tower เดิม> && git fetch codetower
git checkout -b feature/gamification-knowledge/migrate-code-tower codetower/feature/code-tower/migrate-backend
git rebase -X theirs --onto origin/main e84d0d2
```

ผลต่างจากงานเดิมหลัง rebase มีแค่ไฟล์ scaffold ของ repo นี้ (`.github/**` · `subsystem.yaml` ส่วน name/owners/display_name/repo · หัว README)
— `.github/` เป็นของ repo นี้ทั้งหมด ไม่ได้แก้ · แล้วเพิ่ม commit เปลี่ยนชื่อระบบย่อยและแก้ทางเข้า/ออก SSO ตามผลทดสอบกับ Core Hub จริง

push (ครั้งแรกของ branch นี้):

```bash
git push -u origin feature/gamification-knowledge/migrate-code-tower
```

แล้วเปิด PR เข้า `main` (CI ของ repo นี้รันกับ PR ที่เข้า `main`) — **PR แรกของ repo:** ข้อยกเว้นของ `GH-03` ตาม aie-workflow ขั้น 9 ให้ DevOps เป็นคน merge

**PR #1 ของ repo** (`bump-standards-v1-0-1`) ปิดไปโดยไม่ merge · DevOps ย้าย `ci.yml` เป็น `@v1.5.2` แล้ว (PR #5) ·
เลื่อนเวอร์ชันเป็น 1.5.2 ใน PR แยก `bump-standards-1-5-0` (แก้แค่ `.standards-version` กับ `standards` · standards-versioning.md ข้อ 2) — merge ก่อน PR นี้

**ขนาด PR:** branch นี้ใหญ่ ถ้า PL อยากได้ PR เล็กตามขั้น 9 แยกได้เป็น
- PR 1: ย้าย engine เข้า `packages/engine` (+ เพดานความลึกของนิพจน์)
- PR 2: backend · เทสต์ · openapi
- PR 3: frontend และ playtest รอบ A/B · เปลี่ยนชื่อระบบย่อย · SSO

## 3. ลงทะเบียน Core Hub

**Core Hub จริง (standards 1.7.0):** PL login `https://csmju2030.jowave.com` ด้วยบัญชีเจ้าของระบบของทีม → หลังบ้าน → ระบบย่อย → ลงทะเบียน
กรอกตาม `docs/local-integration.md` ข้อ 0 (ชื่อ · Callback URL ของหน้าเว็บ · Base URL เว้นว่าง · ติ๊ก 5 role ไม่ติ๊ก guest) —
หลังอนุมัติแล้วชื่อ · callback · role mapping แก้ได้เฉพาะ admin ระบบกลาง จึงต้องกรอกให้ถูกตั้งแต่แรก

**ตัวจำลองในเครื่อง:** `csmju2030/register-code-tower.cjs` ทำทั้งข้อนี้ (รับทุก 2xx · รันซ้ำได้) — หรือยิงเอง:

```bash
curl -X POST $CORE_HUB_URL/api/v1/subsystems \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "name": "csmju-gamification-knowledge",
    "displayName": "Gamification Knowledge — Code Tower",
    "owner": "<username ของเจ้าของระบบใน Core Hub>",
    "repo": "CSMJU2030/csmju-gamification-knowledge",
    "standardsVersion": "1.7.0",
    "callbackUrl": "http://localhost:3003/auth/callback",
    "defaultRoleMapping": { "student": "PLAYER", "alumni": "PLAYER", "staff": "INSTRUCTOR", "lecturer": "INSTRUCTOR", "admin": "ADMIN" },
    "requestedExceptions": []
  }'
```

- `defaultRoleMapping` ต้องตรงกับ `backend/src/auth/role-mapping.ts` เป๊ะ — key คือ role ที่เข้าได้ (guest ไม่ใส่) · ถ้าเปลี่ยน ต้องแก้ทั้งสองที่
- `callbackUrl` คือ origin ของ**หน้าเว็บ** + `/auth/callback` (หน้าเว็บส่งต่อ `/auth/*` ไป backend) — ตอน dev `http://localhost:3003/auth/callback` ·
  บน Dev Server ต้องเป็น `https://<หน้าเว็บของระบบ>/auth/callback` · ต้องตรงกับ `base_url` + `callback_path` ใน `subsystem.yaml` (conformance L3-04 · L3-07)
- แล้ว `POST /api/v1/subsystems/:id/approve` และ `/activate` — Core Hub ตอบ **201** · เรียกซ้ำได้ **409**

## 4. ร่างข้อความ PR (ตาม `.github/pull_request_template.md`)

```markdown
## สรุปสิ่งที่ทำใน PR นี้

ย้าย Code Tower เข้ามาตรฐาน CSMJU2030 เป็นระบบย่อย csmju-gamification-knowledge:
engine เป็น pnpm workspace · backend ใหม่ (NestJS + Prisma 7 + PostgreSQL) ครบทุกโดเมนของเกม ·
frontend Next.js ทุกหน้า · playtest รอบ A/B · ทางเข้า/ออก SSO ตาม Core Hub จริง
ผลการรบตรงกับเซิร์ฟเวอร์เดิม 132/132 ขั้น · มาตรฐาน 1.5.2 (สัญญา auth 1.1) · conformance 69/69 L3 กับตัวจำลอง Core Hub 1.1
(ผลเดิม 62/62 กับ csmju-core-hub develop ตามสัญญา 1.0)

## ประเภทการเปลี่ยนแปลง

- [x] `feat` — เพิ่มฟีเจอร์ใหม่
- [x] `fix` — แก้บั๊ก (ที่เจอจากการทดสอบแบบพยายามล้ม และจากการทดสอบกับ Core Hub จริง)
- [ ] `refactor` — ปรับโครงสร้างโค้ด
- [x] `chore` / `docs` / `test` / `ci`

## Checklist

### มาตรฐานกลาง
- [x] ไม่แตะ `.github/` · `.standards-version` · submodule `standards` — เลื่อนเป็น 1.5.2 ใน PR แยก `bump-standards-1-5-0`
- [x] Branch name ตรงรูปแบบ `feature/<subsystem>/<เรื่อง>`
- [x] Commit message ตาม Conventional Commits ทุก commit
- [ ] PR นี้โฟกัสเรื่องเดียว — เป็นการย้ายทั้งระบบ แยกได้ตาม docs/handoff-git.md ข้อ 2

### สถาปัตยกรรม
- [x] ไม่มี Database connection หรือ Prisma ใน `frontend/`
- [ ] ไม่มี dependency นอก whitelist — `@tower/engine` (package ใน workspace เดียวกัน) รอ D2
- [ ] ไม่มี UI library อื่น — ไม่มี แต่ `frontend/src/csmju/` เป็นชุดจำลองของ template (ยังไม่มี template จริง)

### Auth
- [x] ไม่ได้สร้างหน้า login หรือ form username/password เอง
- [ ] ไม่ได้เขียนโค้ด verify JWT signature เอง — ชั้น auth เขียนตาม auth-contract.md
      เพราะยังไม่มีสิทธิ์อ่าน demo-student-subsystem จะแทนด้วยไฟล์ของ reference ทันทีที่ได้สิทธิ์
- [x] ไม่เก็บ token ใน `localStorage`

### API & Data
- [x] `openapi.json` อัปเดตใน PR นี้
- [x] Response ทุก endpoint ห่อด้วย `{ success, data/error, meta }`
- [x] `error.code` อยู่ในรายการมาตรฐาน (contracts/error-codes.json มี 7 ค่า)
- [x] ชื่อ field: คอลัมน์ DB เป็น snake_case · JSON เป็น camelCase ตาม api-conventions.md ข้อ 6
- [x] อ้างถึงผู้ใช้ด้วย `core_user_id` เท่านั้น ตาม data-dictionary.md ข้อ 1

### Security
- [x] ไม่แก้ไฟล์ใน `.github/workflows/`
- [x] ไม่มี hardcoded secret / connection string / API key (SEC-01 ผ่าน)
- [x] ไม่มีไฟล์ `.env` ที่มีค่าจริงใน PR นี้

## หมายเหตุสำหรับ PL

- ผลรันจริงทั้งหมดอยู่ใน REPORT.md — merge PR เลื่อนเวอร์ชัน 1.5.2 ก่อน แล้วกด Update branch ของ PR นี้ ·
  ARC-02 / UI-01 PM อนุมัติยกเว้นแล้ว · .compliance-exceptions.yml อ้าง csmju2030-standards#29 (DevOps approve ตาม CODEOWNERS) ·
  conformance 69/69 กับตัวจำลอง Core Hub 1.1 · ทดสอบเชื่อมระบบที่ docs/local-integration.md
- ต้องการคำตอบ D1–D6 (docs/design-csmju-migration.md ข้อ 4) โดยเฉพาะ D3 ก่อนลงทะเบียนบน Dev Server
- สัญญา auth 1.1: `GET /auth/login` (state) · callback ตามข้อ 5.1 · `POST /auth/logout` → หน้า /logout ของ Core Hub (ออกทั้งระบบ) ·
  silent re-SSO · คุกกี้ `csmju_gamification_knowledge_*` · ทะเบียนต้องเปลี่ยน callback_url เป็นของหน้าเว็บ (`…:3003/auth/callback`)
  ยังไม่ได้ทดสอบกับ Core Hub จริงที่รองรับ 1.1
- สามข้อใน PR template ขัดกับเอกสารฉบับอื่น จึงติ๊กตามเอกสารหลักแทน: "field เป็น snake_case",
  "ใช้ username" และ "error.code 6 ค่า" (ดู docs/handoff-git.md ข้อ 5)
```

## 5. เรื่องที่พบในมาตรฐาน (แจ้ง PL — เราไม่แก้ไฟล์ใน `standards/`)

ฉบับที่ผูกอยู่คือ v1.0.0 · `main` ของ standards มีการแก้เอกสารที่ยังไม่ออกเวอร์ชัน (ถึง `5bc9313`)
อ่านแล้วพบจุดที่ขัดกันเอง:

| จุด | ขัดกับ | ผลกับเรา |
|---|---|---|
| PR template: "Field ทุกตัวเป็น `snake_case`" · "ใช้ `username`" · "error.code 6 ค่า" | api-conventions ข้อ 6 (JSON camelCase) · data-dictionary ข้อ 1 (`core_user_id`) · error-codes.json (7 ค่า) | ติ๊กตามเอกสารหลักและเขียนหมายเหตุ |
| api-conventions 1.1 (main) ข้อ 7: ใช้ `JwtAuthGuard` จาก `@csmju/core-sdk` · มี `user.studentId` | auth-contract.md ข้อ 3 (claim มีแค่ `sub email role sid`) · AGENTS.md ข้อ 2 (คัดลอกจาก reference) · whitelist ไม่มี `@csmju/core-sdk` | ยังไม่มี package นี้ให้ใช้ — ทำตาม auth-contract ต่อ |
| ui-design-system (main) ข้อ 9.3: `VALIDATION_ERROR` = 422 และ `error.details.field` | api-conventions ข้อ 4 (400 · details เป็น array ของ string) | ยึด api-conventions ตามที่ ui-design-system เองบอกให้ผูกกัน |
| ui-design-system (main) ข้อ 10: gateway ส่ง `X-User-Id` `X-Layer1-Role` `X-Faculty` | auth-contract ข้อ 1, 6 (ไม่มี gateway · ห้ามเชื่อ custom header) | ไม่ใช้ header เหล่านี้ |
| template หน้าจอ `csmju-subsystem-web` อยู่ใน repo `csmju-core-hub` | (ข้อมูลใหม่ใน main) | ขั้น 4 ต้องมีสิทธิ์อ่าน `csmju-core-hub` — เพิ่มในรายการขอข้อ 1 แล้ว |
| aie-workflow (main) กับดัก: `prisma.config.ts` ใช้ `env('DATABASE_URL')` ทำให้ CI ล้ม | — | ของเราแนบ datasource เฉพาะตอนมี env จริงตามคำแนะนำแล้ว |
| LOCAL_INTEGRATION_GUIDE (main) ภาคผนวก: pnpm ต้องเป็น 12.x · `packageManager` `pnpm@12.3.4` | `new-subsystem.sh` (main) ตั้ง `pnpm@9.15.9` | repo นี้ใช้ `pnpm@10.28.0` (lockfile v9 · `allowBuilds` ใช้ได้) — ขอ PL ยืนยันเวอร์ชันเดียว |
| LOCAL_INTEGRATION_GUIDE ข้อ 7 T8/หน้าเว็บ: alumni ต้องถูกปฏิเสธ | ตัวอย่างเป็นของ equipment | Code Tower อนุญาต alumni ตามข้อเสนอ D3 จึงได้ 302 · ทดสอบกรณีปฏิเสธแบบถอด alumni ชั่วคราว (`docs/local-integration.md`) |
