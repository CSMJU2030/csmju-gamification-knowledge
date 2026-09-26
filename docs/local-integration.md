# ทดสอบเชื่อม 3 ระบบบนเครื่องตัวเอง — ฉบับ Code Tower (csmju-gamification-knowledge)

> ทำตาม `csmju2030-standards/docs/LOCAL_INTEGRATION_GUIDE.md` (บน `main` ของ standards) ทุกข้อ
> เอกสารนี้บอกเฉพาะ **จุดที่ระบบนี้ต่างจากตัวอย่าง `equipment`** ในคู่มือ ผลรันกับ **Core Hub จริง**
> และสิ่งที่เจอใน Core Hub (แจ้งเจ้าของ Core Hub — เราไม่ได้แก้ repo นั้น)

---

## 1. อะไรรันที่ไหน

| คู่มือใช้ | พอร์ต | ตอนนี้ใช้ |
|---|---|---|
| `csmju-core-hub/backend` | 3000 | **ของจริง** — branch `develop` `6674ef6` (`main` `c33a021` seed ไม่ได้ ดูข้อ 5) |
| `csmju-core-hub/frontend` | 3100 | **ของจริง** — `pnpm dev` (`next dev -H 127.0.0.1 -p 3100`) |
| `demo-student-subsystem/backend` | 3001 | demo จำลอง `csmju2030/demo-student-subsystem-sim` — repo จริงยังอ่านไม่ได้ (`could not read Username`) |
| ระบบของทีม backend | 3002 | `backend/` ของ repo นี้ |
| — | 3003 | `frontend/` ของ repo นี้ (คู่มือไม่มี frontend ของทีม) |

Core Hub จำลอง (`csmju2030/csmju-core-hub-sim`) ยังใช้กับตัวเปิดเว็บคลิกเดียว `csmju2030/run-web/start.cjs` ได้
ปรับ URL และรหัสสถานะให้ตรงของจริงแล้ว (ข้อ 6) — แต่ผลที่นับคือผลกับของจริงในข้อ 4

## 2. ต่างจากตัวอย่าง `equipment` ตรงไหน

| ข้อในคู่มือ | ตัวอย่าง equipment | ระบบนี้ |
|---|---|---|
| 3 ฐานข้อมูล | `equipment_db` | `code_tower_db` |
| 6.1–6.2 สร้าง repo · วางโค้ดจาก demo | ต้องทำ | **ข้าม** — repo มีโค้ดครบแล้ว (ชั้น auth ยังเป็นฉบับเขียนตามสัญญา รอแทนด้วยของ demo) |
| 6.2 `allowBuilds` | คัดลอกจาก demo | มีแล้วใน `pnpm-workspace.yaml` (prisma · @prisma/engines · esbuild) |
| 6.3 `.env` | `SUBSYSTEM_ID=csmju-equipment` | `SUBSYSTEM_ID=csmju-gamification-knowledge` · `SSO_SUCCESS_REDIRECT=http://localhost:3003/` |
| 6.3 frontend | — | `cp frontend/.env.example frontend/.env.local` — ค่าในนั้นตรงกับ Core Hub จริงแล้ว (ข้อ 3) |
| 6.4 ลงทะเบียน | mapping ไม่มี alumni | `node csmju2030/register-code-tower.cjs` หรือ payload ใน `docs/handoff-git.md` ข้อ 3 — **มี alumni** (ข้อเสนอ D3) |
| 6.5 รัน | `pnpm --filter backend start:dev` | เหมือนกัน + `pnpm --filter frontend build && pnpm --filter frontend start` (:3003) |
| T3 | `"subsystemRole":"STUDENT"` | `"subsystemRole":"PLAYER"` |
| T8 | alumni → 403 | alumni → **302** เพราะระบบนี้อนุญาต alumni · กรณีปฏิเสธทดสอบด้วยการถอด alumni ออกชั่วคราว |
| ทดสอบหน้าเว็บ | alumni เห็น 1 ระบบ | alumni เห็น **2 ระบบ** |

## 3. เข้าและออกผ่าน Core Hub (ค่าใน `frontend/.env.example`)

| ใช้ทำอะไร | URL | ทำไม |
|---|---|---|
| 401 → เข้าสู่ระบบ | `http://localhost:3100/api/sso/{subsystem}` | route ของหน้าเว็บ Core Hub ที่ขอ handoff แล้วส่งไป callback ของเรา · ยังไม่ login จะผ่าน `/login?next=…` แล้วกลับมาเอง · หน้า `/login` ไม่อ่าน `?subsystem=` |
| ปุ่มออกจากระบบ | `http://localhost:3100/` | Core Hub ไม่มีหน้า logout แบบลิงก์ (`/logout` = 404) และสัญญา 1.0 ไม่มี SSO logout — ออกจากระบบที่หน้าแรกของ Core Hub · session ของเรายังใช้ได้จนหมดอายุ ≤ 15 นาที |
| กลับหน้าหลัก | `http://localhost:3100/` | |

ใช้ `localhost` ไม่ใช่ `127.0.0.1`: `/api/sso` ของ Core Hub ส่งไปหน้า login ที่ `localhost:3100` เสมอ ไม่ว่าเบราว์เซอร์เปิดด้วย host ไหน
และคุกกี้ของสอง host แยกกัน — ถ้าตั้งเป็น `127.0.0.1` คนที่ login ค้างไว้จะถูกพาไปหน้าแรกของ Core Hub แทนที่จะกลับมาที่นี่
(คู่มือให้เปิด `http://127.0.0.1:3100` — ใช้ได้ แต่ถ้า Code Tower พาไป `localhost:3100` จะต้อง login อีกครั้งหนึ่ง)

## 4. ผลรันกับ Core Hub จริง (26 ก.ย. 2569 · develop `6674ef6` · ไม่ได้แก้โค้ดของ Core Hub)

| # | ทดสอบ | ผล |
|---|---|---|
| ลงทะเบียน | `register-code-tower.cjs` ครั้งแรก (ทะเบียนมีชื่อเดิม `csmju-code-tower` ค้าง) | ✅ ลบชื่อเดิม → `PENDING/INACTIVE` → `APPROVED/ACTIVE` |
| ลงทะเบียน | รันซ้ำ | ✅ อัปเดตข้อมูล · ไม่เรียก approve/activate ซ้ำ (ของจริงตอบ 409 ถ้าเรียก) |
| login | admin · student · staff · alumni | ✅ 201 ทั้ง 4 (NestJS ตอบ 201 ให้ POST ทุกตัว) |
| T1 | JWKS ดิบ | ✅ ขึ้นต้น `{"keys":[` · `kid` `core-hub-2026` |
| T3 | token ของ Core Hub → `/api/v1/me` | ✅ admin → `ADMIN` · student → `PLAYER` · staff → `INSTRUCTOR` · alumni → `PLAYER` |
| T4 · T5 | ไม่มี token · token ปลอม | ✅ 401 · 401 |
| T7 | SSO ทั้ง 4 role | ✅ 302 → `http://localhost:3002/auth/callback?access_token,token_type,expires_in,state` → callback 302 → `http://localhost:3003/?state=…` + `Set-Cookie: core_hub_access_token` (HttpOnly · Lax · 899 วินาที) → `/me` ด้วยคุกกี้ 200 |
| T8 (ตามทะเบียน) | alumni | ✅ 302 |
| T8 (ดัดแปลง) | ถอด alumni ออกชั่วคราว → alumni | ✅ 403 · คืนค่าแล้วกลับเป็น 302 |
| SSO ผิด | ไม่มี Bearer · callback_url ไม่ตรง · ระบบไม่มี | ✅ 401 · 400 · 404 |
| token | header · claim | `RS256` `core-hub-2026` · `sub email role sid iss aud iat exp` · iss `core-hub` · aud `csmju2030` · อายุ 900 วินาที |
| W1–W3 | เปิด :3100 → login admin → เมนูระบบย่อย → กดระบบนี้ | ✅ เมนูมี CSMJU Student Service และ Gamification Knowledge — Code Tower → เข้า :3003 `/me` 200 `ADMIN` |
| W4 | ปุ่มออกจากระบบใน Code Tower | ✅ ไปหน้าแรกของ Core Hub (มีปุ่มออกจากระบบของ Core Hub) |
| W5 | alumni | ✅ เห็น 2 ระบบ |
| W6–W7 | เปิด :3003/items โดยไม่มี session | ✅ `localhost:3100/login?next=%2Fapi%2Fsso%2Fcsmju-gamification-knowledge` → login student → กลับมาที่ `/items` `/me` 200 `PLAYER` |
| W8 | session ของเราหายแต่ Core Hub ยัง login อยู่ → เปิด `/history` | ✅ กลับมาที่ `/history` เองโดยไม่ต้องกรอกอะไร |
| conformance | `node standards/conformance/run.js` | ✅ 62 passed · 0 failed · 0 skipped · L3 |
| run-all-checks | branch นี้เทียบ `main` | 16/18 — ARC-02 (รอ D2) · UI-01 เฉพาะเวทีเกม (รอ D1) |

W1–W8 คือ `csmju2030/web-test.mjs` (Playwright · เบราว์เซอร์จริง · ไม่ใส่คุกกี้เอง) — สคริปต์เดียวกันรันกับตัวจำลองได้ผลเหมือนกันทุกข้อ

**ก่อนแก้** (ค่าเดิมที่ทำไว้ตามตัวจำลอง) กับ Core Hub จริง:
`/login?subsystem=` → login แล้วค้างที่หน้าแรกของ Core Hub · `/logout?subsystem=` → 404 และ session ของเรายังอยู่ ·
`register-code-tower.cjs` ล้มที่ขั้นแรก `login admin ไม่ผ่าน (201)` และรันซ้ำได้ 409 ที่ approve/activate

## 5. สิ่งที่เจอใน Core Hub (แจ้งเจ้าของ Core Hub — ไม่ได้แก้)

| ที่ | สิ่งที่เจอ | ผล |
|---|---|---|
| `main` `c33a021` | `node dist/prisma/seed.js` → `Cannot find module 'dotenv/config'` เมื่อติดตั้งด้วย pnpm | ทำตาม README ของ `main` ไม่จบ · `develop` แก้แล้ว (`5726b1f`) แต่ยังไม่ merge (`develop` นำ 8 commit) |
| `frontend/app/api/sso/[subsystem]/route.ts` | redirect ไป `/login` สร้างจาก `request.url` ได้ `localhost:3100` เสมอ | เปิดด้วย `127.0.0.1` แล้วโดนย้าย host · คุกกี้คนละชุด |
| `frontend/app/login/page.tsx` | `next` ที่เป็น `/api/sso/…` ใช้ `router.replace` — client router ยิง route นั้นแบบ fetch อีก 2 ครั้งก่อนเปลี่ยนหน้าจริง | ออก token 3 ใบต่อการกดหนึ่งครั้ง (ใช้งานได้) |
| `frontend/proxy.ts` | login อยู่แล้วเปิด `/login?next=…` → ไปหน้าแรก ไม่สน `next` | ผู้ใช้ที่ login ค้างอยู่ไม่ถูกพาไปต่อ |
| ทั้ง frontend | ไม่มี `GET /logout` · ออกจากระบบคือ `POST /api/auth/logout` จาก JS | ระบบย่อยลิงก์ไปออกจากระบบตรง ๆ ไม่ได้ |
| backend | ไม่มี `@HttpCode` — POST ทุกตัวตอบ 201 (login · approve · activate) | สคริปต์ที่รอ 200 ล้ม · ระบบย่อยควรรับทุก 2xx |

## 6. ลำดับคำสั่ง

Core Hub จริง — ทำตาม `csmju-core-hub/README.md` และ `backend/README.md` (branch `develop`):

```bash
cd csmju-core-hub && cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env.local
pnpm install
cd backend && mkdir -p keys && openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/jwt-private.pem && openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem
npx prisma migrate deploy && pnpm run build && node dist/prisma/seed.js
node dist/src/main.js                     # :3000
```

```bash
cd csmju-core-hub/frontend && pnpm dev     # :3100
```

ระบบนี้:

```bash
cd csmju-gamification-knowledge && pnpm install && cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env.local
pnpm --filter backend exec prisma migrate deploy && pnpm --filter backend start:dev     # :3002
```

```bash
cd csmju-gamification-knowledge && pnpm --filter frontend build && pnpm --filter frontend start   # :3003
```

```bash
node csmju2030/register-code-tower.cjs     # ลงทะเบียน + approve + activate · รันซ้ำได้
```

เปิด http://localhost:3100 → login `admin@core.local` / `password1` → เมนู **Gamification Knowledge — Code Tower**

เครื่องทดสอบของเราออกเน็ตไป `binaries.prisma.sh` และ Google Fonts ไม่ได้ จึงใช้ทางสำรองที่ไม่แตะโค้ด:
`psql -f` migration ทีละไฟล์แทน `prisma migrate deploy` (ทั้งสองระบบ) และ `pnpm dev` แทน `next build` ของ Core Hub
— บนเครื่องที่ออกเน็ตได้ใช้คำสั่งข้างบนได้เลย

ตัวจำลอง (ทางลัดสำหรับลองเล่น): `node csmju2030/run-web/start.cjs` — ขั้นตอนบน Windows อยู่ใน `csmju2030/README.md`

- คู่มือบอกว่า pnpm ต้องเป็น 12.x แต่ `new-subsystem.sh` ตั้ง `packageManager` เป็น `pnpm@9.15.9` · repo นี้ใช้ `pnpm@10.28.0` (lockfile v9) — แจ้ง PL ให้ยืนยันเวอร์ชันเดียว
