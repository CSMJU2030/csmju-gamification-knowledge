# เชื่อม Core Hub — ฉบับ Code Tower (csmju-gamification-knowledge)

> **ตั้งแต่ standards 1.7.0 (1 ต.ค. 2569) ใช้ Core Hub จริงที่ `https://csmju2030.jowave.com` เท่านั้น** — ขั้นตอนหลักอยู่ที่
> `standards/docs/connect-core-hub.md` · ห้ามโคลนหรือรัน `csmju-core-hub` เอง (repo นั้นมีข้อมูลนักศึกษาจริง ถ้าเคยโคลนไว้ให้ลบทิ้ง)
> และ `LOCAL_INTEGRATION_GUIDE.md` เป็นของทีม Core Hub เท่านั้นแล้ว
>
> ข้อ 0 คือค่าของระบบนี้สำหรับคู่มือ connect-core-hub · ข้อ 3–4 เป็นผลเดิมกับตัวจำลองและกับ Core Hub ที่เคยรันในเครื่อง (สัญญา 1.0 / 1.1) เก็บไว้เป็นประวัติ

---

## 0. ค่าของระบบนี้ (standards 1.7.0 · สัญญา auth 1.2)

| ขั้นในคู่มือ | ค่าของ Code Tower |
|---|---|
| พอร์ต | frontend **3213** · backend **4213** — ผู้ดูแล dev server กำหนดให้ทีมนี้ (2 ต.ค. 2569) |
| ลงทะเบียน (ลงใหม่ 8 ต.ค. 2569 ด้วยบัญชีเจ้าของระบบของทีม) | ชื่อระบบ `csmju-gamification-knowledge` · ชื่อที่แสดง `Gamification Knowledge — Code Tower` · หมวดหมู่ ฝึกเขียนโปรแกรม · Repository `csmju-gamification-knowledge` · เวอร์ชันมาตรฐาน `1.8.4` · Callback URL `https://csmju-gamification-knowledge.jowave.com/auth/callback` · Base URL เว้นว่างตอนส่ง (ใส่ origin เดียวกันได้เมื่อระบบขึ้น server แล้ว) |
| บทบาทที่ติ๊ก | student → `PLAYER` · alumni → `PLAYER` · staff → `INSTRUCTOR` · lecturer → `INSTRUCTOR` · admin → `ADMIN` · **guest ไม่ติ๊ก** — ต้องตรงกับ `backend/src/auth/role-mapping.ts` |
| `backend/.env` | คัดลอก `backend/.env.example` (ชี้ server จริงแล้ว) · `SUBSYSTEM_ID=csmju-gamification-knowledge` |
| `frontend/.env.local` | คัดลอก `frontend/.env.example` · `BACKEND_URL=http://127.0.0.1:4213` |
| เปิดระบบ | `http://localhost:3213` — ต้องเป็น `localhost` ไม่ใช่ `127.0.0.1` · หรือดับเบิลคลิก `csmju2030/start-web-real-hub.cmd` |
| conformance | ไฟล์บัญชีนอก repo (`~/.csmju/conformance-accounts.json` · `chmod 600`) คีย์ `owner` `staff` `lecturer` `alumni` `guest` · รหัสรับจากผู้ดูแล dev server ทางข้อความส่วนตัวเท่านั้น · `denied_role: guest` แล้วใน `subsystem.yaml` |

```bash
# จากรากของ repo · ต้องได้ 0 failed · 0 skipped
CONFORMANCE_ACCOUNTS_FILE=~/.csmju/conformance-accounts.json node standards/conformance/run.js
```

> login ครั้งเดียวต่อบัญชีต่อการรัน — บัญชีทดสอบร่วมใช้ทุกทีม ผิด 10 ครั้งใน 15 นาทีล็อกทั้งโครงการ · เห็น `login failed` ให้แก้ไฟล์ก่อนรันใหม่

ทดสอบด้วยมือตาม connect-core-hub ข้อ 6 ทั้ง 7 ข้อ — ข้อ 3 ใช้บัญชี guest ต้องเห็น "บัญชีของคุณไม่มีสิทธิ์เข้าระบบนี้" ที่ Core Hub

### 0.1 ผลกับตัวจำลอง (1 ต.ค. 2569 · branch `auth-1-2`)

ยังไม่ได้รันกับ server จริง (รอลงทะเบียนและบัญชี) — ตรวจกับตัวจำลอง `csmju2030/csmju-core-hub-sim` ที่เพิ่มบัญชี `lecturer@core.local` · `guest@core.local`
และใส่ `azp` ใน token ของ SSO เมื่อ `SIM_AZP=1` (Core Hub จริงจะเริ่มใส่ในเวอร์ชันถัดไป)

| ตรวจ | วิธี | ผล |
|---|---|---|
| conformance 1.2 | runner ของ v1.7.0 · `--core-hub http://localhost:3000 --core-hub-web http://localhost:3100` · ไฟล์บัญชีนอก repo 6 role | ✅ **72 passed · 0 failed · 0 skipped** · `CONFORMANT … v1.2 L3` |
| W1–W9 | `csmju2030/web-test.mjs` (เหมือนข้อ 3.1) | ✅ ผลเดิมทุกข้อ |
| W10 | lecturer login ที่ :3100 → เมนู → Code Tower | ✅ `/me` 200 `INSTRUCTOR` |
| W11 | guest login → เมนู · เปิด `:3003/auth/login` ตรง ๆ | ✅ เมนูว่าง · ไปจบที่ `/sso/error` ของ Core Hub · ไม่มีคุกกี้ของเกม |
| W12 | คุกกี้ state หมดอายุระหว่างอยู่หน้า login ของ Core Hub | ✅ callback 401 เป็นหน้า "เข้าสู่ระบบไม่สำเร็จ" ปุ่ม `/auth/login` → กดแล้วกลับเข้าเกม `/me` 200 |
| log | `grep -iE "eyJ\|access_token=\|authorization:\|cookie:"` ทั้ง log หลังรันทุกอย่าง | ✅ ไม่พบ |

## 1. อะไรรันที่ไหน (ประวัติ — ก่อน standards 1.7.0)

| คู่มือใช้ | พอร์ต | ตอนนั้นใช้ |
|---|---|---|
| `csmju-core-hub/backend` | 3000 | ของจริงที่รันในเครื่อง (branch `develop` `6674ef6` · 26 ก.ย. 2569) — **1.7.0 ห้ามทำแบบนี้แล้ว** · ไม่มีสำเนาเหลือในเครื่องพัฒนา |
| `csmju-core-hub/frontend` | 3100 | ของจริงที่รันในเครื่อง (เช่นเดียวกัน) |
| `demo-student-subsystem/backend` | 3001 | demo จำลอง `csmju2030/demo-student-subsystem-sim` — repo จริงยังอ่านไม่ได้ (`could not read Username`) |
| ระบบของทีม backend | 3002 | `backend/` ของ repo นี้ |
| — | 3003 | `frontend/` ของ repo นี้ (คู่มือไม่มี frontend ของทีม) |

Core Hub จำลอง (`csmju2030/csmju-core-hub-sim`) ยังใช้กับตัวเปิดเว็บคลิกเดียว `csmju2030/run-web/start.cjs` ได้ — สำหรับลองเล่นและทดสอบเร็ว ๆ เท่านั้น
ผลที่นับคือผลกับ Core Hub จริง

## 2. ต่างจากตัวอย่าง `equipment` ตรงไหน

| ข้อในคู่มือ | ตัวอย่าง equipment | ระบบนี้ |
|---|---|---|
| 3 ฐานข้อมูล | `equipment_db` | `code_tower_db` |
| 6.1–6.2 สร้าง repo · วางโค้ดจาก demo | ต้องทำ | **ข้าม** — repo มีโค้ดครบแล้ว (ชั้น auth ยังเป็นฉบับเขียนตามสัญญา รอแทนด้วยของ demo) |
| 6.2 `allowBuilds` | คัดลอกจาก demo | มีแล้วใน `pnpm-workspace.yaml` (prisma · @prisma/engines · esbuild) |
| 6.3 `.env` | `SUBSYSTEM_ID=csmju-equipment` | `SUBSYSTEM_ID=csmju-gamification-knowledge` · **`CORE_HUB_WEB_URL=http://localhost:3100`** (สัญญา 1.1) |
| 6.3 frontend | — | `cp frontend/.env.example frontend/.env.local` — Next ส่งต่อ `/api/*` และ `/auth/*` ไป backend |
| 6.4 ลงทะเบียน | `callbackUrl` `:3002/auth/callback` · mapping ไม่มี alumni | `node csmju2030/register-code-tower.cjs` หรือ payload ใน `docs/handoff-git.md` ข้อ 3 — **`callbackUrl` `http://localhost:3003/auth/callback`** (origin ของหน้าเว็บ) · **มี alumni** (D3) |
| 6.5 รัน | `pnpm --filter backend start:dev` | เหมือนกัน + `pnpm --filter frontend build && pnpm --filter frontend start` (:3003) |
| T3 | `"subsystemRole":"STUDENT"` | `"subsystemRole":"PLAYER"` |
| T8 | alumni → 403 | alumni → **302** เพราะระบบนี้อนุญาต alumni · กรณีปฏิเสธทดสอบด้วยการถอด alumni ออกชั่วคราว |
| ทดสอบหน้าเว็บ | alumni เห็น 1 ระบบ | alumni เห็น **2 ระบบ** |

## 3. เข้าและออกผ่าน Core Hub (สัญญา auth 1.1 · standards 1.5.x)

origin ของระบบคือ **หน้าเว็บ `http://localhost:3003`** — Next ส่งต่อ `/api/*` และ `/auth/login` `/auth/callback` `/auth/logout` ไป backend :3002
เบราว์เซอร์จึงคุยกับ origin เดียว: คุกกี้ state และ session ตั้งที่นี่ · `next` เป็น path ของหน้าเว็บ ·
`base_url` ใน `subsystem.yaml` และ `callback_url` ในทะเบียนจึงเป็น :3003

| ใช้ทำอะไร | ทาง | ข้อกำหนด |
|---|---|---|
| เข้าสู่ระบบ / 401 | `GET /auth/login?next=<หน้าปัจจุบัน>` → 302 `http://localhost:3100/sso/authorize?subsystem=…&state=…` | state สุ่ม 32 ไบต์ · คุกกี้ `csmju_gamification_knowledge_sso_state` (Path=/auth/callback · 600 วินาที) · ไม่ส่ง `callback_url` |
| กลับมาจาก Core Hub | `GET /auth/callback?access_token…&state=…` | ตรวจ state กับคุกกี้แบบ constant-time → ตรวจ token 8 ขั้น → คุกกี้ `csmju_gamification_knowledge_access_token` → 302 ไปหน้า `next` · ไม่มี state → ทิ้ง token แล้ว 302 `/auth/login` · state ไม่ตรง → 401 |
| ปุ่มออกจากระบบ | ฟอร์ม `POST /auth/logout` → 303 `http://localhost:3100/logout` | ลบคุกกี้ของเราทั้งสอง แล้วให้ Core Hub ถามยืนยันและออกทั้งระบบ |
| กลับหน้าหลัก | `http://localhost:3100/` | `NEXT_PUBLIC_CORE_DASHBOARD_URL` |

silent re-SSO: API ตอบ 401 → หน้าเว็บพาทั้งหน้าไป `/auth/login?next=` · ถ้าเพิ่งเริ่มไม่ถึง 30 วินาทีแล้วยัง 401 → แสดงปุ่ม "เข้าสู่ระบบอีกครั้ง" แทน ·
หน้าที่มีงานยังไม่บันทึก (โปรแกรม BloxCode · ฟอร์มโจทย์ · ตั้งชื่อตัวละคร) ไม่พาออกจากหน้าเอง · เปลี่ยนหน้าตอนเหลือไม่ถึง 2 นาทีต่ออายุก่อนเลย

ใช้ `localhost` ไม่ใช่ `127.0.0.1` — คุกกี้ของสอง host แยกกัน

### 3.1 ผลกับตัวจำลอง Core Hub ที่ปรับเป็นสัญญา 1.1 (29 ก.ย. 2569)

ตัวจำลอง `csmju2030/csmju-core-hub-sim`: เว็บมี `/sso/authorize` (ส่ง state ต่อตรงตัว) · `/sso/error` · `/logout` (GET ถาม · POST ออก) ·
เมนูระบบย่อยชี้ `/sso/authorize?subsystem=` · API `sso/authorize` และ `sso/handoff` ส่ง state กลับ

| ขั้น | ทำอะไร | ผล |
|---|---|---|
| conformance | `node standards/conformance/run.js` (base_url :3003) | ✅ **69 passed · 0 failed · 0 skipped · 0 warnings** · L3 ของสัญญา 1.1 |
| W1–W2 | เปิด :3100 → login admin → เมนูระบบย่อย | ✅ เห็น CSMJU Student Service และ Gamification Knowledge — Code Tower |
| W3 | กดจากเมนู (ไม่มี state) | ✅ `:3100/sso/authorize` → `:3003/auth/callback` (ทิ้ง token) → `:3003/auth/login` → `:3100/sso/authorize` → `:3003/auth/callback` → `:3003/` · `/me` 200 `ADMIN` ไม่เห็นหน้าอะไรคั่น |
| W4 | ปุ่มออกจากระบบใน Code Tower | ✅ → `:3100/logout` (หน้าถาม) · คุกกี้ของเกมถูกลบ · `/me` 401 |
| W4b–d | ยืนยันที่ Core Hub → เปิดเกมทันที → login เป็น staff | ✅ `/login` ของ Core Hub · ไม่เข้าเป็นคนเดิมแล้ว (ปัญหาเครื่องใช้ร่วมกันของ 1.0 หาย) · กลับมาที่เกม `/me` 200 `INSTRUCTOR` |
| W5 | alumni | ✅ เห็น 2 ระบบ |
| W6–W7 | เปิด `:3003/items?q=ดาบ` โดยไม่มี session → login student | ✅ `/auth/login` → `/sso/authorize` → `/login` ของ Core Hub → กลับมาที่ `/items?q=ดาบ` `/me` 200 `PLAYER` |
| W8 | 401 ซ้ำภายใน 30 วินาทีหลัง re-SSO | ✅ ไม่พาไปซ้ำ · แถบ "เข้าสู่ระบบไม่สำเร็จ" + ปุ่ม `/auth/login?next=%2Fbattles` |
| W8b | พ้น 30 วินาที · token ของเกมหาย · Core Hub ยัง login | ✅ silent re-SSO `/battles` → `/auth/login` → `/sso/authorize` → `/auth/callback` → `/battles` ไม่ต้องกรอกอะไร |
| W9 | โปรแกรม BloxCode ยังไม่บันทึก แล้ว session หมด | ✅ อยู่หน้าเดิม · แถบ "เซสชันหมดอายุ — งานที่ยังไม่บันทึกยังอยู่ในหน้านี้" + ปุ่ม `/auth/login?next=%2Fprogram` |

## 4. ผลเดิมกับ Core Hub จริง ตามสัญญา 1.0 (26 ก.ย. 2569 · develop `6674ef6` · ไม่ได้แก้โค้ดของ Core Hub)

| # | ทดสอบ | ผล |
|---|---|---|
| ลงทะเบียน | `register-code-tower.cjs` ครั้งแรก (ทะเบียนมีชื่อเดิม `csmju-code-tower` ค้าง) | ✅ ลบชื่อเดิม → `PENDING/INACTIVE` → `APPROVED/ACTIVE` |
| ลงทะเบียน | รันซ้ำ | ✅ อัปเดตข้อมูล · ไม่เรียก approve/activate ซ้ำ (ของจริงตอบ 409 ถ้าเรียก) |
| login | admin · student · staff · alumni | ✅ 201 ทั้ง 4 (สคริปต์ของเรารับทุก 2xx) |
| T1 | JWKS ดิบ | ✅ ขึ้นต้น `{"keys":[` · `kid` `core-hub-2026` |
| T3 | token ของ Core Hub → `/api/v1/me` | ✅ admin → `ADMIN` · student → `PLAYER` · staff → `INSTRUCTOR` · alumni → `PLAYER` |
| T4 · T5 | ไม่มี token · token ปลอม | ✅ 401 · 401 |
| T7 | SSO ทั้ง 4 role | ✅ 302 → `http://localhost:3002/auth/callback?access_token,token_type,expires_in,state` → callback 302 → `http://localhost:3003/?state=…` + `Set-Cookie: core_hub_access_token` (HttpOnly · Lax · 899 วินาที) → `/me` ด้วยคุกกี้ 200 |
| T8 (ตามทะเบียน) | alumni | ✅ 302 |
| T8 (ดัดแปลง) | ถอด alumni ออกชั่วคราว → alumni | ✅ 403 · คืนค่าแล้วกลับเป็น 302 |
| SSO ผิด | ไม่มี Bearer · callback_url ไม่ตรง · ระบบไม่มี | ✅ 401 · 400 · 404 |
| token | header · claim | `RS256` `core-hub-2026` · `sub email role sid iss aud iat exp` · iss `core-hub` · aud `csmju2030` · อายุ 900 วินาที |
| W1–W3 | เปิด :3100 → login admin → เมนูระบบย่อย → กดระบบนี้ | ✅ เมนูมี CSMJU Student Service และ Gamification Knowledge — Code Tower → เข้า :3003 `/me` 200 `ADMIN` |
| W4 † | ปุ่มออกจากระบบใน Code Tower | ✅ → `localhost:3100/` (หน้าแรกของ Core Hub) · คำขอ API ของเกมตอนกด `[]` · คุกกี้ของ Core Hub ยังอยู่ (ไม่แตะ) |
| W4b † | เปิดเกมอีกครั้งขณะยัง login ที่ Core Hub | ✅ เข้าได้ทันที `/me` 200 `ADMIN` (คุกกี้ของเกมยังไม่หมดอายุ) |
| W4c † | ออกจากเกม → ออกจาก Core Hub ด้วยปุ่มของ Core Hub → เปิดเกมทันที | ⚠️ ยังเข้าเป็นคนเดิม `/me` 200 `ADMIN` — ข้อจำกัดของสัญญา 1.0 (ไม่มี SSO logout) คุกกี้ของเกมใช้ได้จนหมดอายุ ≤ 15 นาที |
| W4d–e † | คุกกี้ของเกมหมดอายุ (จำลองด้วยการลบคุกกี้นั้น) → เปิดเกม → login เป็น staff | ✅ หน้า login ของ Core Hub → กลับมาที่เกม `/me` 200 `INSTRUCTOR` |
| W5 | alumni | ✅ เห็น 2 ระบบ |
| W6–W7 | เปิด :3003/items โดยไม่มี session | ✅ `localhost:3100/login?next=%2Fapi%2Fsso%2Fcsmju-gamification-knowledge` → login student → กลับมาที่ `/items` `/me` 200 `PLAYER` |
| W8 | session ของเราหายแต่ Core Hub ยัง login อยู่ → เปิด `/history` | ✅ กลับมาที่ `/history` เองโดยไม่ต้องกรอกอะไร |
| conformance | `node standards/conformance/run.js` | ✅ 62 passed · 0 failed · 0 skipped · L3 |
| run-all-checks | branch นี้เทียบ `main` | 16/18 — ARC-02 (รอ D2) · UI-01 เฉพาะเวทีเกม (รอ D1) |

W1–W8 คือ `csmju2030/web-test.mjs` รุ่นสัญญา 1.0 (Playwright · เบราว์เซอร์จริง · ไม่ใส่คุกกี้เอง) — ตอนนี้สคริปต์เป็นรุ่น 1.1 (ข้อ 3.1)
† ปุ่มออกจากระบบแบบสัญญา 1.0 (แค่ไปหน้าแรกของ Core Hub · 28 ก.ย. 2569) ตรวจกับตัวจำลอง — แทนด้วย `POST /auth/logout` ของสัญญา 1.1 แล้ว

**ก่อนแก้** (ค่าเดิมที่ทำไว้ตามตัวจำลอง) กับ Core Hub จริง:
`/login?subsystem=` → login แล้วค้างที่หน้าแรกของ Core Hub · `/logout?subsystem=` → 404 และ session ของเรายังอยู่ ·
`register-code-tower.cjs` ล้มที่ขั้นแรก `login admin ไม่ผ่าน (201)` และรันซ้ำได้ 409 ที่ approve/activate

## 5. ลำดับคำสั่ง

Core Hub: ไม่ต้องรันเอง — ใช้ `https://csmju2030.jowave.com` (ลงทะเบียนและตั้งค่าตามข้อ 0)

ระบบนี้:

```bash
cd csmju-gamification-knowledge && pnpm install && cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env.local
pnpm --filter backend exec prisma migrate deploy && pnpm --filter backend start:dev     # :4213
```

```bash
cd csmju-gamification-knowledge && pnpm --filter frontend build && pnpm --filter frontend start   # :3213
```

เปิด http://localhost:3213 → ปุ่มเข้าสู่ระบบพาไป login ที่ Core Hub จริง แล้วกลับมาหน้าเดิม

ตัวจำลองในเครื่อง (ไม่ต้องลงทะเบียน · ไม่ต้องมีบัญชี): `node csmju2030/run-web/start.cjs` — ตั้ง env ชี้ :3000/:3100 ให้เองและลงทะเบียนด้วย
`csmju2030/register-code-tower.cjs` · ขั้นตอนบน Windows อยู่ใน `csmju2030/README.md`

เครื่องทดสอบของเราออกเน็ตไป `binaries.prisma.sh` ไม่ได้ จึงใช้ `psql -f` กับ migration แทน `prisma migrate deploy`
— บนเครื่องที่ออกเน็ตได้ใช้คำสั่งข้างบนได้เลย


- pnpm: standards 1.4.0 กำหนดเลขเดียวทั้งโครงการ `12.3.4` — repo นี้ตั้ง `packageManager: pnpm@12.3.4` แล้ว (pnpm 10 ในเครื่องจะสลับเป็น 12.3.4 ให้เอง)
