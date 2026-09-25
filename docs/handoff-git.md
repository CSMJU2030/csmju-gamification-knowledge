# ส่งมอบเข้า git — สิ่งที่รอทีมกลาง และสิ่งที่เราทำต่อทันทีเมื่อได้

> สถานะ 24 ก.ย. 2026: งานทั้งหมดอยู่ใน git ของเครื่องเรา (branch `feature/code-tower/migrate-backend`)
> ยัง push ขึ้น GitHub ไม่ได้ เพราะ repo `CSMJU2030/csmju-code-tower` ต้องสร้างโดย PM/org admin
> ตามขั้น 2–3 ของ `standards/docs/aie-workflow.md` (ฉบับบน main ของ standards)

---

## 1. สิ่งที่ขอจาก PM / org admin

| # | ขอ | ใช้ทำอะไร |
|---|---|---|
| 1 | รับเข้าองค์กร CSMJU2030 + สิทธิ์สร้าง repo (หรือให้ admin รันสคริปต์แทน) | สร้าง repo ด้วย `new-subsystem.sh` |
| 2 | สร้าง Team `pl-code-tower` / `aie-code-tower` และตั้ง ruleset ของ repo | CODEOWNERS · branch protection |
| 3 | สิทธิ์อ่าน `csmju-core-hub` และ `demo-student-subsystem` | template หน้าจอ (`templates/csmju-subsystem-web/`) · ชั้น auth ของ reference |
| 4 | `CORE_HUB_URL` ของ Dev Server | ทดสอบกับ Core Hub จริง |
| 5 | ลงทะเบียน + approve + activate ใน Core Hub (payload ข้อ 3) | SSO · conformance L3 กับของจริง |

คำสั่งสร้าง repo (รันจาก clone ของ `csmju2030-standards`):

```bash
./new-subsystem.sh code-tower "Code Tower หอคอยนักสู้อัตโนมัติ"
```

ได้ repo `CSMJU2030/csmju-code-tower` ที่มี scaffold มาตรฐาน + submodule `standards/` บน `main`

## 2. สิ่งที่เราทำทันทีเมื่อ repo ขึ้น GitHub

scaffold บน `main` ของ repo จริงจะเป็น commit คนละตัวกับ scaffold ในเครื่องเรา (สร้างจากสคริปต์เดียวกัน แต่คนละครั้ง)
จึงย้ายเฉพาะ commit ที่เป็นงานของเราไปต่อท้าย `main` ของจริง:

```bash
git remote add origin https://github.com/CSMJU2030/csmju-code-tower.git
git fetch origin
# commit ของเราเริ่มหลัง "pin standards submodule" (e84d0d2)
git rebase --onto origin/main e84d0d2 feature/code-tower/migrate-backend
git push -u origin feature/code-tower/migrate-backend
```

ถ้าชนกันที่ `subsystem.yaml` หรือ `.env.example` ให้ถือฉบับของ branch เรา (scaffold ไม่มีค่าจริงของ Code Tower)
แล้วรันชุดตรวจก่อน push:

```bash
./standards/scripts/run-all-checks.sh .
```

**PR แรกของ repo:** เป็นข้อยกเว้นของ `GH-03` ตาม aie-workflow ขั้น 9 — ให้ DevOps เป็นคน merge

**ขนาด PR:** branch นี้มีสองเรื่อง (ย้าย engine · backend) ถ้า PL อยากได้ PR เล็กตามขั้น 9 แยกได้เป็น
- PR 1: `98598b3` ย้าย engine เข้า `packages/engine` (+ `869e4b7` เพดานความลึกของนิพจน์)
- PR 2: ที่เหลือทั้งหมด (backend · เทสต์ · openapi · เอกสาร)

## 3. payload ลงทะเบียน Core Hub

```bash
curl -X POST $CORE_HUB_URL/api/v1/subsystems \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "name": "csmju-code-tower",
    "displayName": "Code Tower หอคอยนักสู้อัตโนมัติ",
    "owner": "<username ของเจ้าของระบบใน Core Hub>",
    "repo": "CSMJU2030/csmju-code-tower",
    "standardsVersion": "1.0.0",
    "callbackUrl": "http://localhost:3002/auth/callback",
    "defaultRoleMapping": { "student": "PLAYER", "alumni": "PLAYER", "staff": "INSTRUCTOR", "admin": "ADMIN" },
    "requestedExceptions": []
  }'
```

- `defaultRoleMapping` ต้องตรงกับ `backend/src/auth/role-mapping.ts` เป๊ะ — ค่านี้คือข้อเสนอ D3 ถ้า PL เปลี่ยน ต้องแก้ทั้งสองที่
- `callbackUrl` ตอน dev ใช้ `http://localhost:3002/auth/callback` · บน Dev Server ต้องเป็น `https://…/auth/callback`
- แล้ว `POST /api/v1/subsystems/:id/approve` และ `/activate`

## 4. ร่างข้อความ PR (ตาม `templates/pull_request_template.md`)

```markdown
## สรุปสิ่งที่ทำใน PR นี้

ย้าย Code Tower เข้ามาตรฐาน CSMJU2030 ขั้น 1–2: engine เป็น pnpm workspace และ backend ใหม่
(NestJS + Prisma 7 + PostgreSQL) ครบทุกโดเมนของเกม ผลการรบตรงกับเซิร์ฟเวอร์เดิม 132/132 ขั้น

## ประเภทการเปลี่ยนแปลง

- [x] `feat` — เพิ่มฟีเจอร์ใหม่
- [x] `fix` — แก้บั๊ก (ที่เจอจากการทดสอบแบบพยายามล้ม)
- [ ] `refactor` — ปรับโครงสร้างโค้ด
- [x] `chore` / `docs` / `test` / `ci`

## Checklist

### มาตรฐานกลาง
- [x] submodule `standards/` ผูก v1.0.0 (ตรงกับ `.standards-version` และ `uses:` ใน ci.yml)
- [x] Branch name ตรงรูปแบบ `feature/<subsystem>/<เรื่อง>`
- [x] Commit message ตาม Conventional Commits ทุก commit
- [ ] PR นี้โฟกัสเรื่องเดียว — มีสองเรื่อง (engine · backend) แยกได้ตาม docs/handoff-git.md ข้อ 2

### สถาปัตยกรรม
- [x] ไม่มี Database connection หรือ Prisma ใน `frontend/`
- [ ] ไม่มี dependency นอก whitelist — `@tower/engine` (package ใน workspace เดียวกัน) รอ D2
- [x] ไม่มี UI library อื่น (ยังไม่มี frontend)

### Auth
- [x] ไม่ได้สร้างหน้า login หรือ form username/password เอง
- [ ] ไม่ได้เขียนโค้ด verify JWT signature เอง — ชั้น auth ตอนนี้เขียนตาม auth-contract.md
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

- ผลรันจริงทั้งหมดอยู่ใน REPORT.md — run-all-checks 17/18 (ARC-02 รอ D2) · conformance 62/62 กับ Core Hub จำลอง
- ต้องการคำตอบ D1–D6 (docs/design-csmju-migration.md ข้อ 4) โดยเฉพาะ D3 ก่อนลงทะเบียน
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
