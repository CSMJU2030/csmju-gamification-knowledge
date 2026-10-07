# csmju-gamification-knowledge

Code Tower หอคอยนักสู้อัตโนมัติ — เกมของระบบย่อย Gamification Knowledge ในโครงการ CSMJU2030
เกม auto-battle ที่ผู้เล่นเขียนโปรแกรม BloxCode (Python subset) ให้ตัวละครสู้เอง

มาตรฐานกลางอยู่ใน `standards/` (submodule ของ CSMJU2030/csmju2030-standards) · ใช้เวอร์ชันตาม `.standards-version` (ตอนนี้ **1.8.4**) ·
เลื่อนเวอร์ชันใน PR แยกตาม `docs/standards-versioning.md` ของ standards
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
pnpm --filter backend start    # http://localhost:4213/api/health
pnpm --filter frontend start   # http://localhost:3213  (dev: pnpm --filter frontend dev)
```

พอร์ตของทีมตามที่ผู้ดูแล dev server กำหนด: frontend **3213** · backend **4213**
ผู้ใช้เข้าผ่าน SSO ของ Core Hub (`CORE_HUB_URL` = `https://csmju2030.jowave.com`) เท่านั้น — ระบบนี้ไม่มี login ของตัวเอง
ค่าที่ใช้ลงทะเบียนและเชื่อม Core Hub จริง: [`docs/local-integration.md`](docs/local-integration.md) ข้อ 0
เข้าสู่ระบบเริ่มที่ `/auth/login` ของระบบนี้ แล้วไปเว็บ Core Hub (`CORE_HUB_WEB_URL` ใน `backend/.env`) · ออกจากระบบ = `POST /auth/logout` ออกทั้งระบบ
frontend เรียก API ผ่าน origin ของตัวเอง (`/api/*` และ `/auth/*` ถูกส่งต่อไป `BACKEND_URL`) จึงไม่ต้องเปิด CORS ·
origin ของ server จริงคือ `base_url` ใน `subsystem.yaml` (`https://csmju-gamification-knowledge.jowave.com`) และ Callback URL ในทะเบียนคือ origin นี้ + `/auth/callback` ·
ทดสอบในเครื่องใช้ `http://localhost:3213` กับตัวจำลอง Core Hub

## ทดสอบ

```bash
pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm -r build   # ลำดับเดียวกับ CI

# e2e ต้องมี PostgreSQL — ฐานข้อมูลที่ระบุจะถูกล้าง schema ทุกครั้ง
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/code_tower_test pnpm --filter backend test:e2e

./standards/scripts/run-all-checks.sh .          # CI ทั้ง 20 ข้อบนเครื่อง (รวม DEP-01..04)
node standards/conformance/run.js                # ต้องมี Core Hub + backend รันอยู่
pnpm --filter backend generate:openapi           # อัปเดต backend/openapi.json ทุกครั้งที่แก้ endpoint
pnpm --filter frontend generate:api              # แล้ว generate type ของ frontend จาก openapi.json
```

## Docker (ขึ้น server กลาง)

ระบบนี้ขึ้น server เป็น 2 image ตาม `standards/docs/deployment.md` — GitHub Actions (`images.yml` ของ DevOps) build แล้วเก็บที่
`ghcr.io/csmju2030/csmju-gamification-knowledge-api` และ `-web` ทุกครั้งที่ merge เข้า `main`

| | web | api |
|---|---|---|
| Dockerfile | `frontend/Dockerfile` (จาก template ของ standards + `packages/engine`) | `backend/Dockerfile` + `backend/docker/entrypoint.sh` |
| พอร์ตใน container | `3000` | `4000` |
| ตอนสตาร์ต | `node frontend/server.js` (Next.js standalone) | `prisma migrate deploy` แล้ว `node dist/main.js` |
| ผู้ใช้ | `node` | `node` |

ทดสอบในเครื่องแบบเดียวกับ server (ต้องมี Docker):

```bash
docker compose up -d --build     # db + api + web · ล็อกแบบ server (อ่านอย่างเดียว · RAM api 512m · web 384m)
docker compose ps                # ทั้งสามต้อง healthy
docker compose logs api          # ต้องเห็น migration ผ่าน และ subsystem.started
# เปิด http://localhost:3213 ด้วย Chrome แล้ว login ผ่าน Core Hub
```

- `BACKEND_URL` ของ web ถูกฝังเป็น `http://api:4000` ตอน build — ห้ามเปลี่ยนชื่อ service `api` หรือพอร์ต `4000`
- env ของ api ที่ server ส่งให้มาจาก `backend/.env.example` เท่านั้น — เพิ่ม env ใหม่ต้องเพิ่มในไฟล์นั้นด้วย
- `pnpm --filter frontend start` (`next start`) ยังใช้ตอน dev ได้ แต่จะเตือนเรื่อง `output: standalone` — image ใช้ `server.js` ของ standalone

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
| `POST` `GET /api/v1/battles` · `GET /api/v1/tower-progress` | รบ (หอคอย · รอบในโซน · มอนของโจทย์) · ประวัติ · ความคืบหน้าหอคอย |
| `GET /api/v1/game-data` | ชื่อไทยของสกิล/ไอเทม/อาชีพ |
| `GET` `POST /api/v1/challenges` · `GET` `PATCH` `DELETE /api/v1/challenges/:id` | โจทย์ของผู้สอน พร้อมมอนของโจทย์ 0–4 ตัว ([`docs/design-challenge-monsters.md`](docs/design-challenge-monsters.md)) |
| `GET /api/v1/challenges/:id/attempts` | ผลของผู้เล่นรายคนกับมอนของโจทย์ (เจ้าของโจทย์ · ผู้ดูแล) |

## Branch และ commit

```bash
git checkout -b feature/gamification-knowledge/<เรื่องที่ทำ>
```

commit แบบ Conventional Commits (`feat(gamification-knowledge): …`) · ก่อนเปิด PR อ่าน `standards/docs/github-workflow.md` ข้อ 1
