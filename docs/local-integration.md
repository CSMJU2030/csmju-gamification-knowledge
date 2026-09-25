# ทดสอบเชื่อม 3 ระบบบนเครื่องตัวเอง — ฉบับ Code Tower

> ทำตาม `csmju2030-standards/docs/LOCAL_INTEGRATION_GUIDE.md` (บน `main` ของ standards) ทุกข้อ
> เอกสารนี้บอกเฉพาะ **จุดที่ Code Tower ต่างจากตัวอย่าง `equipment`** ในคู่มือ และวิธีทดสอบด้วย **ตัวจำลอง**
> ระหว่างที่ยังไม่มีสิทธิ์อ่าน `csmju-core-hub` กับ `demo-student-subsystem` (สอง repo นี้เป็น private)

---

## 1. ของจริงกับของจำลอง

| คู่มือใช้ | พอร์ต | ตอนนี้ใช้ | อยู่ที่ไหน |
|---|---|---|---|
| `csmju-core-hub/backend` | 3000 | **Core Hub จำลอง** `csmju-core-hub-sim/backend/server.cjs` | นอก repo นี้ (โฟลเดอร์พี่น้องใน `csmju2030/`) |
| `csmju-core-hub/frontend` | 3100 | **Core Hub จำลอง** `csmju-core-hub-sim/frontend/server.cjs` | นอก repo นี้ |
| `demo-student-subsystem/backend` | 3001 | **demo จำลอง** `demo-student-subsystem-sim/server.cjs` | นอก repo นี้ |
| ระบบของทีม backend | 3002 | `csmju-code-tower/backend` ของจริง | repo นี้ |
| — | 3003 | `csmju-code-tower/frontend` ของจริง (คู่มือไม่มี frontend ของทีม) | repo นี้ |

ตัวจำลองเป็น Node ล้วน ไม่มี dependency · ทำตามพฤติกรรมที่เขียนใน `auth-contract.md` และ `subsystem-registry.md`
(กุญแจ RS256 จาก openssl · JWKS ดิบ · SSO ตรวจ 404 → 409 → 409 → 403 → 400 → 302 · ทะเบียน PENDING/INACTIVE → approve → activate)

**ผ่านกับตัวจำลอง ≠ ผ่านกับของจริง** — ได้สิทธิ์แล้วต้องทำคู่มือซ้ำกับ Core Hub และ demo ตัวจริงทุกข้อ

## 2. ต่างจากตัวอย่าง `equipment` ตรงไหน

| ข้อในคู่มือ | ตัวอย่าง equipment | Code Tower |
|---|---|---|
| 3 ฐานข้อมูล | `equipment_db` | `code_tower_db` |
| 6.1–6.2 สร้าง repo · วางโค้ดจาก demo | ต้องทำ | **ข้าม** — repo มีโค้ดครบแล้ว (ชั้น auth ยังเป็นฉบับเขียนตามสัญญา รอแทนด้วยของ demo) |
| 6.2 `allowBuilds` | คัดลอกจาก demo | มีแล้วใน `pnpm-workspace.yaml` (prisma · @prisma/engines · esbuild) |
| 6.3 `.env` | `SUBSYSTEM_ID=csmju-equipment` | `SUBSYSTEM_ID=csmju-code-tower` · `SSO_SUCCESS_REDIRECT=http://localhost:3003/` |
| 6.3 frontend | — | `cp frontend/.env.example frontend/.env.local` (ชี้หน้า login/logout ของ Core Hub ที่ :3100) |
| 6.4 ลงทะเบียน | mapping ไม่มี alumni | payload ใน `docs/handoff-git.md` ข้อ 3 — **มี alumni** (ข้อเสนอ D3) |
| 6.5 รัน | `pnpm --filter backend start:dev` | เหมือนกัน + `pnpm --filter frontend build && pnpm --filter frontend start` (:3003) |
| T3 | `"subsystemRole":"STUDENT"` | `"subsystemRole":"PLAYER"` |
| T8 | alumni → 403 | alumni → **302** เพราะ Code Tower อนุญาต alumni · ทดสอบกรณีปฏิเสธด้วยการถอด alumni ออกจากทะเบียนชั่วคราว (ข้อ 4) |
| ทดสอบหน้าเว็บ | alumni เห็น 1 ระบบ | alumni เห็น **2 ระบบ** |

## 3. ลำดับคำสั่ง (Git Bash บน Windows ได้เหมือนกัน)

โครงโฟลเดอร์ตามคู่มือข้อ 2:

```text
csmju2030/
├── csmju2030-standards/            git clone https://github.com/CSMJU2030/csmju2030-standards.git
├── csmju-core-hub-sim/             ตัวจำลอง (แทน csmju-core-hub)
├── demo-student-subsystem-sim/     ตัวจำลอง (แทน demo-student-subsystem)
└── csmju-code-tower/               repo นี้ (git clone --recurse-submodules …)
```

```bash
createdb code_tower_db
```

```bash
cd csmju-core-hub-sim/backend && mkdir -p keys && openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/jwt-private.pem
```

5 terminal ค้างไว้:

```bash
cd csmju2030/csmju-core-hub-sim/backend && node server.cjs          # :3000
```

```bash
cd csmju2030/csmju-core-hub-sim/frontend && node server.cjs         # :3100
```

```bash
cd csmju2030/demo-student-subsystem-sim && node server.cjs          # :3001
```

```bash
cd csmju2030/csmju-code-tower && pnpm install && cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env.local
```

แก้ `DATABASE_URL` ใน `backend/.env` ให้ตรงเครื่อง แล้ว:

```bash
pnpm --filter backend exec prisma migrate deploy && pnpm --filter backend start:dev     # :3002
```

```bash
cd csmju2030/csmju-code-tower && pnpm --filter frontend build && pnpm --filter frontend start   # :3003
```

ลงทะเบียน (คู่มือข้อ 6.4 — payload เต็มอยู่ใน `docs/handoff-git.md` ข้อ 3) แล้ว approve + activate
ทะเบียนของตัวจำลองเก็บใน `csmju-core-hub-sim/backend/data/registry.json` — รีสตาร์ตแล้วไม่หาย ลงทะเบียนครั้งเดียวพอ

เปิด http://127.0.0.1:3100 → login `admin@core.local` → กด **Code Tower หอคอยนักสู้อัตโนมัติ** → เข้าหน้าเว็บ :3003

## 4. ผลรันจริง (25 ก.ย. 2569 · git clone ใหม่ของ branch นี้ · ตัวจำลองทั้งสองตัว)

| # | ทดสอบ | ผล |
|---|---|---|
| ลงทะเบียน | ไม่ส่ง `requestedExceptions` | 400 `requestedExceptions ต้องเป็น array` (ตรงตาราง "พลาดบ่อย") |
| ลงทะเบียน | payload ครบ | 201 · PENDING/INACTIVE |
| ก่อน approve / ก่อน activate | SSO | 409 / 409 |
| T1 | JWKS ดิบ | ✅ ขึ้นต้น `{"keys":[` |
| T2 | demo รับ token | ✅ `STUDENT` |
| T3 | Code Tower รับ token เดียวกัน | ✅ `PLAYER` |
| T4 · T5 | ไม่มี token · token ปลอม | ✅ 401 · 401 |
| T6 · T7 | SSO ไป demo · ไป Code Tower | ✅ `Location: http://localhost:3001/auth/callback?…` · `…3002/auth/callback?…` |
| T8 (ตามทะเบียนจริง) | alumni → Code Tower | ✅ 302 (อนุญาตตาม D3) |
| T8 (ดัดแปลง) | ถอด alumni ออกชั่วคราว → alumni | ✅ 403 · คืนค่าแล้วกลับเป็น 302 |
| T9 | alumni → demo | ✅ 302 |
| เพิ่ม | callback ของ Code Tower | ✅ `Set-Cookie: core_hub_access_token=…; HttpOnly; SameSite=Lax` + `Location: http://localhost:3003/` |
| หน้าเว็บ | admin login ที่ :3100 | ✅ เมนูมี CSMJU Student Service และ Code Tower → กดแล้วเข้า :3003 ได้ `subsystemRole = ADMIN` |
| หน้าเว็บ | ออกจากระบบใน Code Tower | ✅ กลับหน้า login ของ Core Hub · เปิด :3003 อีกครั้งถูกพาไป login |
| หน้าเว็บ | alumni | ✅ เห็น 2 ระบบ |
| หน้าเว็บ | เปิด :3003/items โดยไม่มี session | ✅ ไป login ของ Core Hub → login → SSO → กลับมาที่ `/items` |
| conformance L1 | `node standards/conformance/run.js --level L1` | ✅ 32 passed · 0 failed · 0 skipped |
| conformance | `node standards/conformance/run.js` | ✅ 62 passed · 0 failed · 0 skipped · L3 |
| run-all-checks | ในโฟลเดอร์ที่ clone ใหม่ | 16/18 — ARC-02 (รอ D2) · UI-01 เฉพาะเวทีเกม (รอ D1) |

เรื่องที่เจอระหว่างทำตามคู่มือ:

- `pnpm install` เตือน `Ignored build scripts: prisma, @prisma/engines …` — เพิ่ม `allowBuilds` ใน `pnpm-workspace.yaml` แล้ว (คู่มือข้อ 6.2)
- `prisma migrate deploy` ต้องดาวน์โหลด schema engine — เครื่องทดสอบของเราออกเน็ตไป `binaries.prisma.sh` ไม่ได้ (403)
  จึงใช้ทางสำรองใน README (`psql -f …/migration.sql`) · บนเครื่องที่ออกเน็ตได้ใช้คำสั่งตามคู่มือได้เลย
- คู่มือบอกว่า pnpm ต้องเป็น 12.x แต่ `new-subsystem.sh` บน `main` ตั้ง `packageManager` เป็น `pnpm@9.15.9` · repo นี้ใช้ `pnpm@10.28.0` (lockfile v9) — แจ้ง PL ให้ยืนยันเวอร์ชันเดียว
