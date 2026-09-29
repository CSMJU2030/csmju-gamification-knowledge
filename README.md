# csmju-gamification-knowledge

Code Tower หอคอยนักสู้อัตโนมัติ — เกมของระบบย่อย Gamification Knowledge ในโครงการ CSMJU2030
เกม auto-battle ที่ผู้เล่นเขียนโปรแกรม BloxCode (Python subset) ให้ตัวละครสู้เอง

มาตรฐานกลางอยู่ใน `standards/` (submodule ของ CSMJU2030/csmju2030-standards · v1.5.0 · สัญญา auth 1.1)
สถานะงานและผลตรวจล่าสุด: [`REPORT.md`](REPORT.md) · แผนการย้าย: [`docs/design-csmju-migration.md`](docs/design-csmju-migration.md)

## โครงสร้าง

```text
packages/engine/   เครื่องคำนวณการรบ + ภาษา BloxCode (TypeScript ล้วน ไม่มี dependency)
backend/           NestJS 11 + Prisma 7 (PrismaPg) + PostgreSQL — API ทั้งหมดของเกม
frontend/          (ขั้น 4 — รอ template csmju-subsystem-web)
standards/         submodule มาตรฐานกลาง (ห้ามแก้)
```

## ติดตั้ง

ต้องมี Node 22 · pnpm 10 · PostgreSQL 16+

```bash
git submodule update --init standards/
pnpm install
cp backend/.env.example backend/.env      # แก้ DATABASE_URL และ CORE_HUB_URL ให้ตรงเครื่อง
cp frontend/.env.example frontend/.env.local   # BACKEND_URL และปุ่มกลับหน้าหลักของ Core Hub
createdb code_tower_db                    # ชื่อตาม DATABASE_URL
pnpm --filter backend exec prisma migrate deploy
```

`migrate deploy` ต้องดาวน์โหลด schema engine ของ Prisma ครั้งแรก — ถ้าเครื่องทดสอบออกเน็ตไปที่ binaries.prisma.sh ไม่ได้
ใช้ `psql -d code_tower_db -f backend/prisma/migrations/20260924120000_init/migration.sql` แทนได้ (เฉพาะเครื่องทดสอบ
เพราะวิธีนี้ไม่บันทึกประวัติลงตาราง `_prisma_migrations`)

## รัน

```bash
pnpm -r build                  # engine ก่อน แล้ว backend (pnpm เรียงให้เอง)
pnpm --filter backend start    # http://localhost:3002/api/health
pnpm --filter frontend start   # http://localhost:3003  (dev: pnpm --filter frontend dev)
```

ต้องมี Core Hub รันอยู่ที่ `CORE_HUB_URL` — ระบบนี้ไม่มี login ของตัวเอง ผู้ใช้เข้าผ่าน SSO ของ Core Hub เท่านั้น
ทดสอบเชื่อมกับ Core Hub + demo บนเครื่องตัวเอง (ผลรันกับ Core Hub จริง และสิ่งที่เจอใน Core Hub): [`docs/local-integration.md`](docs/local-integration.md)
เข้าสู่ระบบเริ่มที่ `/auth/login` ของระบบนี้ แล้วไปเว็บ Core Hub (`CORE_HUB_WEB_URL` ใน `backend/.env`) · ออกจากระบบ = `POST /auth/logout` ออกทั้งระบบ
frontend เรียก API ผ่าน origin ของตัวเอง (`/api/*` และ `/auth/*` ถูกส่งต่อไป `BACKEND_URL`) จึงไม่ต้องเปิด CORS ·
origin นี้คือ `base_url` ใน `subsystem.yaml` และ `callback_url` ในทะเบียน (`http://localhost:3003/auth/callback`)

## ทดสอบ

```bash
pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm -r build   # ลำดับเดียวกับ CI

# e2e ต้องมี PostgreSQL — ฐานข้อมูลที่ระบุจะถูกล้าง schema ทุกครั้ง
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/code_tower_test pnpm --filter backend test:e2e

./standards/scripts/run-all-checks.sh .          # CI ทั้ง 18 ข้อบนเครื่อง
node standards/conformance/run.js                # ต้องมี Core Hub + backend รันอยู่
pnpm --filter backend generate:openapi           # อัปเดต backend/openapi.json ทุกครั้งที่แก้ endpoint
pnpm --filter frontend generate:api              # แล้ว generate type ของ frontend จาก openapi.json
```

## API

ทุก endpoint ธุรกิจอยู่ใต้ `/api/v1` และต้องมี token ของ Core Hub (`Authorization: Bearer` หรือคุกกี้ `core_hub_access_token`)
สัญญาเต็มอยู่ที่ [`backend/openapi.json`](backend/openapi.json)

| Method & path | ใช้ทำอะไร |
|---|---|
| `GET /api/health` · `GET /auth/callback` | public |
| `GET /api/v1/me` | ตัวตนจาก token |
| `POST /api/v1/characters` · `GET` `PATCH /api/v1/characters/current` | สร้างตัวละคร · อ่าน · เลือกอาชีพ |
| `GET` `PATCH /api/v1/programs/current` | โปรแกรม BloxCode |
| `GET /api/v1/items` · `PATCH` `DELETE /api/v1/items/:id` · `POST /api/v1/item-upgrades` | กระเป๋า · สวม/ถอด · ย่อย · ตีบวก |
| `GET /api/v1/regions` · `POST /api/v1/region-runs` · `DELETE /api/v1/region-runs/:id` | แผนที่ · เข้าโซน · ออกจากโซน |
| `POST` `GET /api/v1/battles` · `GET /api/v1/tower-progress` | รบ (หอคอยหรือรอบในโซน) · ประวัติ · ความคืบหน้าหอคอย |
| `GET /api/v1/game-data` | ชื่อไทยของสกิล/ไอเทม/อาชีพ |
| `GET` `POST /api/v1/challenges` · `GET` `PATCH` `DELETE /api/v1/challenges/:id` | โจทย์ของผู้สอน |

## Branch และ commit

```bash
git checkout -b feature/gamification-knowledge/<เรื่องที่ทำ>
```

commit แบบ Conventional Commits (`feat(gamification-knowledge): …`) · ก่อนเปิด PR อ่าน `standards/docs/github-workflow.md` ข้อ 1
