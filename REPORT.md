# REPORT — csmju-gamification-knowledge (Code Tower)

> สถานะ: **ขั้น 1–2 ของแผนย้าย + frontend ชุดจำลอง** (docs/design-csmju-migration.md) · branch `feature/gamification-knowledge/migrate-code-tower`
> repo `CSMJU2030/csmju-gamification-knowledge` · ชื่อระบบย่อย `csmju-gamification-knowledge` · Code Tower คือชื่อเกม
> frontend ครบทุกหน้าตาม G0 แต่ใช้ **ชุดจำลองของ template** (`frontend/src/csmju/`) · **ทดสอบกับ Core Hub จริงแล้ว** (csmju-core-hub develop `6674ef6` รันในเครื่อง · สัญญา 1.0)
> **มาตรฐาน 1.5.2** (29 ก.ย. 2569 · เลื่อนใน PR แยก `bump-standards-1-5-0` ตาม standards-versioning.md): สัญญา auth 1.1 ครบ — `/auth/login` · callback ตามกฎ state · `POST /auth/logout` ออกทั้งระบบ ·
> silent re-SSO · error code 9 ค่า · pnpm 12.3.4 — ทดสอบกับตัวจำลอง Core Hub ที่ปรับเป็น 1.1 (ยังเข้า repo Core Hub จริงไม่ได้)
> **พอร์ตของทีม** (2 ต.ค. 2569 · branch `feature/gamification-knowledge/team-ports`): frontend 3213 · backend 4213 ตามที่ผู้ดูแล dev server กำหนด ·
> Callback URL `http://localhost:3213/auth/callback`
> **ชื่อในเกม = รหัสนักศึกษา/บุคลากร** (1 ต.ค. 2569 · branch `feature/gamification-knowledge/person-code-name`): สร้างตัวละครอ่าน `personCode` จาก Core Hub
> `GET /people/me` ด้วย token ของผู้เล่น แล้วใช้เป็นชื่อที่ทุกคนเห็น · เก็บแค่ `person_code` · บัญชีที่ไม่มีรหัสตั้งชื่อเอง (ต้องมีอักษรไทย)
> **มาตรฐาน 1.7.0 · สัญญา auth 1.2** (1 ต.ค. 2569 · PR #7 merge แล้ว · เลื่อนเวอร์ชันใน PR #6 ของทีมกลาง):
> ตรวจ token 10 ขั้น (อายุ token · `azp`) · core role 6 ค่า (lecturer → INSTRUCTOR · guest ไม่รับ) · หน้า "เข้าสู่ระบบอีกครั้ง" ตอน state ไม่ตรง ·
> log `jwt.verification.failure` ทุกเหตุผล · manifest และ `.env.example` ชี้ Core Hub จริง `https://csmju2030.jowave.com`
> **log ครบ 8 event ของ log-events.json 1.1** (3 ต.ค. 2569 · branch `feature/gamification-knowledge/auth-logs`): เพิ่ม `subsystem.started` ·
> `jwt.verification.success` · `jwks.refresh` · `jwks.refresh.failure` · `jwks.unknown_kid` · `authorization.denied` · reason `jwks_unavailable`
> **มอนของโจทย์ — ส่วน engine + backend** (7 ต.ค. 2569 · branch `feature/gamification-knowledge/challenge-monsters`): อาจารย์ออกแบบมอน 1–4 ตัวให้โจทย์ ·
> นักศึกษาสู้ด้วยตัวละครและโปรแกรมของตัวเอง · ชนะครั้งแรกได้ EXP/ทองตามเลเวล · อาจารย์ดูผลรายคน — [`docs/design-challenge-monsters.md`](docs/design-challenge-monsters.md) · หน้าเว็บ branch `challenge-monsters-ui`
> **มาตรฐาน 1.8.4 · พร้อมขึ้น server กลาง** (6 ต.ค. 2569 · branch `feature/gamification-knowledge/bump-standards-v1-8-4`): Dockerfile ของ api และ web ·
> `.dockerignore` · Next.js standalone · `DATABASE_POOL_MAX` · `docker-compose.yml` ทดสอบในเครื่อง — ผ่าน `DEP-01..04` (deployment.md 1.4)
> **ขึ้น server แล้ว · หน้าตาแบบเปิดใช้จริง** (8 ต.ค. 2569 · branch `feature/gamification-knowledge/launch-polish`): ระบบเปิดที่
> `https://csmju-gamification-knowledge.jowave.com` (ลงทะเบียนใหม่กับ Core Hub จริง) · โลโก้จริงจาก template มาตรฐาน · เอาช่องค้นหาและกระดิ่งที่กดไม่ได้ออก ·
> ส่วนท้ายมีที่ติดต่อและลิงก์จริงชุดเดียวกับ Core Hub · `base_url` ใน `subsystem.yaml` เป็น origin จริง
> **เทิร์นที่สั่ง `wait()` เห็น MP ที่ฟื้น** (8 ต.ค. 2569 · branch `feature/gamification-knowledge/wait-turn-event`): engine ส่งเหตุการณ์ `action: 'wait'`
> ให้ทุกเทิร์นที่รอ · ฉากรบมีตัวเลข +MP · หลอด MP ขยับทุกเทิร์น · บันทึกการรบมีบรรทัด "รอ 1 เทิร์น · MP เป็น N" · คำเตือน "MP ไม่พอ" ไม่หายแล้ว
> **สกิลประจำภูมิภาค ระยะ S1 ฝั่ง engine + backend** (8 ต.ค. 2569 · branch `feature/gamification-knowledge/region-skills` · [`docs/design-skill-acquisition.md`](docs/design-skill-acquisition.md)):
> ชนะรอบลึกสุดของภูมิภาคโดยทำตามบทเรียนได้จริง → ได้สกิลของภูมิภาคนั้นสำหรับอาชีพตัวเอง (15 สกิล) · ตรวจจากบันทึกการรบที่เซิร์ฟเวอร์จำลอง

## ผลรัน

**สกิลประจำภูมิภาค ระยะ S1 — หน้าเว็บ (8 ต.ค. 2569 · branch `region-skills-ui` ต่อจาก `region-skills`)**

- การ์ดโซนบนแผนที่: ส่วน "สกิลของโซนนี้" — ชื่อสกิลของอาชีพผู้เล่น · ชนิด · MP · โค้ดตัวอย่าง `cast("…", …)` · เงื่อนไขทีละข้อ (ซ่อนเมื่อพิสูจน์แล้ว) ·
  ผู้ฝึกหัดเห็นว่าพิสูจน์เก็บไว้ก่อนได้
- ผลการรบในภูมิภาค: แผง "บทเรียนของ…" — ได้สกิลครั้งแรกมีแถบพร้อมโค้ดที่ใช้ได้ทันทีและลิงก์ไปหน้าโปรแกรม · ยังไม่ผ่านบอกทีละข้อพร้อมตัวเลขของการรบนั้น ·
  รอบที่ไม่ใช่รอบลึกสุดบอกว่า "รอบฝึก · ไม่นับ" · โปรแกรมอ่านหน้าจอได้ยินว่าข้อไหนผ่าน/ไม่ผ่าน
- หน้าตัวละคร: สกิลภูมิภาคที่ได้แล้วบอกว่าเป็นสกิลของโซนไหน · ที่ยังไม่ได้แสดงล็อก "พิสูจน์บทเรียนของโซน" ต่อท้ายสกิลตามเลเวล
- ผลรัน: frontend 85 (+4 · `ProofPanel.test.tsx`) · lint · typecheck · build ·
  เบราว์เซอร์กับตัวจำลอง (W26 · ผู้พิทักษ์เลเวล 10): ตีอย่างเดียวชนะรอบ 4 ของป่าได้แต่ไม่ได้สกิล (รับทัน 0/11) → การ์ดโซนบอกเงื่อนไข →
  เปลี่ยนเป็นโปรแกรมอ่านท่าแล้วรบในเบราว์เซอร์ → "ได้สกิลใหม่ การ์ดเหล็ก" (ถูกหมายหัว 17 ครั้ง รับทัน 17/17 · ตั้งรับนอกหมายหัว 0%) →
  หน้าโปรแกรมบันทึก `cast("iron_guard", me)` ได้ · หน้าตัวละครเห็นสกิล · 360px ไม่เลื่อนข้าง · ไม่มี error

**สกิลประจำภูมิภาค ระยะ S1 — engine + backend + API (8 ต.ค. 2569 · branch `region-skills`)** — PM เลือกทุกทางใน `docs/design-skill-acquisition.md` · ทำ A ก่อน

- engine `proofs.ts`: ตัวตรวจ 5 ภูมิภาค อ่าน `CombatEvent` ล้วน — หมายหัว (ป่า · น้ำแข็ง) · ดูแลเลือดก่อนต่ำ (หมู่เกาะ) · ตัวอันตรายตายก่อน (ซาก · ภูเขาไฟ) ·
  ทุกข้อมีข้อกันโกง (ตั้งรับตลอด · ของแรงจนไม่ต้องคิด · ล้มตัวที่หมายแทนการอ่านท่า) · นับเฉพาะรอบลึกสุดที่ชนะ แต่ตรวจให้ดูทุกรอบ
- ข้อมูล: สกิลใหม่ 15 ตัว (ภูมิภาคละ 1 ต่ออาชีพ) ใช้ชนิดและแอนิเมชันที่มีอยู่ · ตัวตรวจโปรแกรมบอกว่า "ได้จากการพิสูจน์บทเรียนของ…" แทน "ปลดที่เลเวล"
- ฐานข้อมูล: คอลัมน์ `characters.proved_regions TEXT[]` (migration `20261008120000_region_proofs` เพิ่มคอลัมน์อย่างเดียว) ·
  เขียนในทรานแซกชันเดียวกับผลการรบบนแถวที่ล็อกไว้ · ทุกทางที่คิดสกิล (รบ · โปรแกรม · หน้าตัวละคร · สแนปช็อตดวล) อ่านจากแถวเดียวกัน · ตัวอย่างอาชีพไม่พกสกิลภูมิภาค
- API: ผลรบในภูมิภาคมี `proof` · `GET /regions` มี `proof` (เงื่อนไข · พิสูจน์แล้วหรือยัง · สกิลของอาชีพผู้เล่น) · สกิลมีช่อง `region` · `openapi.json` และ `schema.d.ts` สร้างใหม่
- หน้าเว็บ (เท่าที่จำเป็นในก้อนนี้): การ์ดเลือกอาชีพและหน้าตัวละครไม่ดึงสกิลภูมิภาคจาก game-data มาแสดงเป็น "ใช้ได้" — แผงภูมิภาคและแถบได้สกิลอยู่ PR ถัดไป
- เกณฑ์วัดด้วย `packages/engine/tools/proofprobe.cjs` (ตารางในเอกสารออกแบบข้อ 5.1): โปรแกรมตามบทเรียนผ่านเกือบทุกครั้งที่ชนะ ·
  โปรแกรมที่ไม่ทำตามบทเรียนผ่าน 0 ครั้งในทุกภูมิภาค ทุกอาชีพ แม้ชนะ 20/20
- ผลรัน: engine 242 (+19) · backend unit 174 (+4) · e2e 43 (+4 · PostgreSQL จริง รันซ้ำ 3 รอบผ่านทุกรอบ) · frontend 81 · lint · typecheck
  - e2e ครอบ: แผนที่บอกเงื่อนไข · ยังไม่พิสูจน์บันทึก `cast("iron_guard")` ไม่ได้ · ผู้พิทักษ์เลเวล 10 อ่านท่าชนะรอบ 4 ของป่า → ได้สกิล ·
    ใช้ในโปรแกรมได้ทันที · ผ่านซ้ำไม่ได้ซ้ำ (ฐานข้อมูลมี `greenwood` ครั้งเดียว) · รอบ 1 ไม่นับ · ตีอย่างเดียวไม่ได้ · หอคอยไม่มี `proof` ·
    ผู้ฝึกหัดที่พิสูจน์ไว้แล้วเลือกจอมเวท ได้ม่านมานาทันที
**เทิร์นที่สั่ง `wait()` เห็น MP ที่ฟื้น (8 ต.ค. 2569 · branch `wait-turn-event`)** — ผู้ใช้แจ้งว่า "frontend ไม่แสดงมานาที่เพิ่ม"

- สาเหตุ: เทิร์นที่โปรแกรมสั่ง `wait()` engine ฟื้น MP จริงแต่ **ไม่ส่งเหตุการณ์ใดออกมา** — หลอด MP บนจอค้างแล้วกระโดดตอนร่ายครั้งถัดไป ·
  บันทึกการรบไม่มีบรรทัด · คำเตือน "MP ไม่พอสำหรับ …" ของเทิร์นนั้นหายไปด้วย (ติดอยู่กับเหตุการณ์ที่ไม่ได้ส่ง)
- engine: `CombatEvent.action` เพิ่มค่า `'wait'` (ไม่มีเป้าหมาย · มี `line` · `codeWarnings` · `mpAfter`) · `ActionType` ของคำสั่งไม่เปลี่ยน ·
  ความชำนาญ (proficiency) ล้างสถานะ "ตั้งการ์ดค้าง" ได้ตรงในเทิร์นที่รอ · golden fixture ไม่เปลี่ยน (ใช้กฎ ไม่มี wait)
- API: `CombatEventDto.action` enum เพิ่ม `wait` · `openapi.json` และ `schema.d.ts` สร้างใหม่ · บันทึกเก่าใน DB ไม่ต้องแปลง (แค่ไม่มีเหตุการณ์รอ)
- หน้าเว็บ: เทิร์นรอไม่มีท่าโจมตีหรือเอฟเฟกต์ — ลงผลทันที หลอด MP ขยับ ตัวเลข `+N MP` สีฟ้าลอยเหนือตัวละคร (ไม่ขึ้นถ้า MP เต็มอยู่แล้ว) ·
  บรรทัด `wait()` ในโค้ดสว่าง · บันทึก "X รอ 1 เทิร์น · MP เป็น N"
- พบเพิ่มระหว่างทดสอบและแก้ด้วย: กด "หยุด" แล้วไล่ "เทิร์นถัดไป" **ตัวเลขลอยทุกชนิดมองไม่เห็นเลย** (ค่อย ๆ จางเข้าจาก 0 แต่นาฬิกาไม่เดินตอนหยุด) →
  ตัวเลขโผล่ทึบทันที และกดเทิร์นถัดไปจะล้างตัวเลขของเทิร์นก่อน ไม่ค้างทับกัน
- ผลรัน: engine 224 (+1 · ไม่มีตัวแก้ = ล้ม) · frontend 85 (+4 · ไม่มีตัวแก้ = ล้มทั้ง 4) · backend unit 170 · e2e 39 · lint · typecheck · build
- เบราว์เซอร์กับตัวจำลอง (W24 · จอมเวท Lv 5 · `cast("firebolt", …)` แล้ว `wait()`): เทิร์นรอ MP 6 → 9 / 50 · ตัวเลข `+3 MP` บนฉาก ·
  บันทึก "… รอ 1 เทิร์น · MP เป็น 9" ตรงกับหลอด · แผงโค้ดสว่างบรรทัด 3 และขึ้นคำเตือน MP ไม่พอสำหรับ 'firebolt' · ไม่มี error

**ลองเล่นบน server จริง + หน้าตาแบบเปิดใช้จริง (8 ต.ค. 2569 · branch `launch-polish`)**

- ลองเล่นบน `https://csmju-gamification-knowledge.jowave.com` ด้วยบัญชีเจ้าของระบบ (บุคลากร → ผู้สอน): health · ตัวละคร · หอคอยชั้น 1 ชนะ 10/10 ·
  สวมของ · หน้าโปรแกรม (บล็อก/โค้ด) · ป่าเริ่มต้นรอบ 1 ชนะ 10/10 · ประวัติการรบ · ตัวอย่างอาชีพ · หน้าโจทย์ — ทุกคำขอ API ได้ 2xx · console ไม่มี error
- สิ่งที่ยังดูไม่เหมือนเปิดใช้จริงและแก้ใน branch นี้: ช่องค้นหาเขียนว่า "ยังไม่เปิดในชุดจำลอง" · กระดิ่งที่กดไม่ได้ · ส่วนท้ายเป็นตัวหนังสือที่กดไม่ได้ ·
  โลโก้เป็นตัวอักษรแทน · คำว่า "ยังไม่เปิดในเฟสนี้" ในถาดบล็อก (ทางที่ไม่มีบล็อกใดใช้ แต่แก้ไว้กันหลุด)
- โลโก้ย่อจากไฟล์ของ template (8192px · 435 KB → 480px · 52 KB) ใช้ `<img>` ธรรมดา เพราะ container อ่านอย่างเดียว ตัวย่อภาพของ Next เขียน cache ไม่ได้
- ผลรัน: frontend 81 · lint · typecheck · build · เบราว์เซอร์กับตัวจำลอง (W23) ทั้ง 1280 และ 360px: ไม่มีคำว่า "ชุดจำลอง"/"ยังไม่เปิด" ·
  ไม่มีช่องค้นหาและกระดิ่ง · โลโก้โหลดและกว้าง 184px (ขั้นต่ำ 120) · ส่วนท้ายมีลิงก์ 5 ลิงก์ ไม่มี `#` · ไม่เลื่อนข้าง

**มอนของโจทย์ — หน้าเว็บ (7 ต.ค. 2569 · branch `challenge-monsters-ui` ต่อจาก `challenge-monsters`)**

- ฟอร์มโจทย์มีส่วน "มอนของโจทย์" (`_monsters.tsx`): เพิ่ม/ลบได้ถึง 4 ตัว · เลือกต้นแบบพร้อมภาพ · ชื่อ · เลเวล · ตัวคูณ · สกิล · โปรแกรมของมอน
  (ปุ่มเริ่มจากโปรแกรมตามบทบาท) · ตรวจก่อนส่งด้วยกติกาเดียวกับ backend (`@tower/engine/challenge`) · 400 ของ backend ขึ้นใต้ช่องของมอนตัวนั้น
- หน้าโจทย์: การ์ดมอน · ปุ่ม "สู้กับมอนของโจทย์" พร้อมรางวัลชนะครั้งแรกตามเลเวล · ผลของตัวเอง · ผู้สอนเจ้าของ/ผู้ดูแลเห็นตาราง "ผลของผู้เล่น" ·
  รายการโจทย์มีป้าย "มีมอน N ตัว" · เวทีรบรองรับการรบแบบโจทย์ (เวฟเดียว · ปุ่มสู้อีกครั้ง · กลับไปหน้าโจทย์ · รางวัลแทนของดรอป)
- ฟอร์มแยกเป็น `_form.tsx` ให้หน้ารายการโจทย์ไม่โหลดตัวตรวจของ engine (First Load: รายการ 124 kB · หน้าโจทย์ 158 kB · ฟอร์ม 159 kB — งบ ≤ 250 kB)
- ผลรัน: frontend 89 (+8) · lint · typecheck · build · เบราว์เซอร์กับตัวจำลอง Core Hub (หน้าเว็บ standalone :3213 → api :4000 · NODE_ENV=production):
  W17 lecturer สร้างโจทย์พร้อมมอนผ่านฟอร์ม → หน้าโจทย์เห็นการ์ดมอนและตารางผลว่าง · W18 player ใหม่สร้างตัวละคร → สู้ → ชนะ "เคลียร์ 1/1 เวฟ"
  ได้ +2 EXP +24 ทอง (เลเวล 1) · มอนตั้งท่าป้องกันตามโปรแกรมของอาจารย์ · กลับหน้าโจทย์เห็น "สู้ไปแล้ว 1 ครั้ง" และไม่เห็นตารางผลของคนอื่น ·
  W19 lecturer เห็นแถวรหัสนักศึกษาของผู้เล่นคนนั้น "ชนะแล้ว 1 ครั้ง"
- ล่าบัคหลัง push (7 ต.ค. 2569 · เบราว์เซอร์ W20 กับตัวจำลอง Core Hub · จอ 1280 และ 360px) แก้ 3 ข้อ:
  1. การ์ดมอนปัดตัวคูณเหลือทศนิยมตำแหน่งเดียว — ผู้สอนตั้ง HP ×1.25 ดาเมจ ×0.75 การ์ดขึ้น ×1.3 · ×0.8 → แสดงถึง 2 ตำแหน่งตามที่ตั้ง
  2. ข้อความผิดของมอนผูกกับลำดับ — มอนตัวที่ 2 เลเวลผิด แล้วลบตัวที่ 1 ข้อความไปค้างที่มอนอีกตัวที่ไม่ได้ผิด → ข้อความย้ายตามมอนตัวเดิม
  3. ฉากรบแสดงเลเวลเดียวกับทุกตัว (เลเวลสูงสุด) — สไลม์เลเวล 1 ขึ้น "Lv 50" คู่กับโกเลมเลเวล 50 → กล่องศัตรูแสดงเลเวลของมอนแต่ละตัว
     (`challengeMonsterId` ย้ายไปไฟล์กติกา `challenge.ts` ให้หน้าเว็บจับคู่ combatant กับมอนที่ตั้งได้)
  - เอกสารข้อ 7 เคยเขียน "ปุ่มทดลองสู้" ในฟอร์มซึ่งไม่ได้ทำ → แก้ให้ตรงของจริง และเปิดข้อ 8 "รอตัดสินใจ" (Q1 ทดลองสู้ไม่ต้องมีตัวละคร · Q2 เจ้าของโจทย์ได้รางวัลจากโจทย์ตัวเอง)
  - ผลรันหลังแก้: frontend 94 (+5 · 5 เคสใหม่ไม่ผ่านก่อนแก้) · engine 233 · e2e 46 · W20 0 ข้อ ·
    ตรวจผ่าน: หน้าแก้โหลดชื่อ/ตัวคูณครบ · 360px ไม่เลื่อนข้างทั้งหน้าโจทย์และผลรบ · นักศึกษาไม่เห็นตารางผล · โจทย์ถูกลบระหว่างเปิดหน้าอยู่ → กดสู้ได้ "ไม่พบโจทย์นี้"

**มอนของโจทย์ — engine + backend (7 ต.ค. 2569 · branch `challenge-monsters`)** — docs/design-challenge-monsters.md

- engine: `packages/engine/src/challenge.ts` — ขอบเขตค่า (`CHALLENGE_MONSTER_LIMITS`) · ตรวจมอนและโปรแกรมของมอน · สร้างเวฟด้วย `makeMonster` ตัวเดียวกับหอคอย ·
  `runChallengeBattle` (ปิดรางวัลของ engine) · `challengeReward` (คิดจากเลเวลผู้เล่น) — golden fixture ของหอคอยไม่เปลี่ยน
- backend: ตาราง `challenge_monsters` · `challenge_attempts` (migration เพิ่มอย่างเดียว) · `monsters` ใน POST/PATCH โจทย์ · `myResult` ใน GET โจทย์ ·
  `POST /battles { challengeId }` · `GET /challenges/:id/attempts` · openapi.json + type ของหน้าเว็บ
- ผลรัน: engine 233 (+10) · backend unit 170 · e2e 44 (+5: ตั้งมอนและชี้ช่องที่ผิด · รางวัลครั้งเดียวรวมกรณีชนะพร้อมกัน 5 คำขอ ·
  ผลรายคนและสิทธิ์ · 409/404/400 · ลบโจทย์ลบผล) · frontend 81 · lint · typecheck
- migration เขียนเองตามรูปแบบที่ Prisma สร้าง (เครื่องนี้โหลด schema engine ไม่ได้) — e2e ลง migration ชุดนี้กับ PostgreSQL จริงแล้ว Prisma Client ใช้งานได้ทุกเคส
- ล่าบัคหลัง push (7 ต.ค. 2569 · ยิง API จริงผ่าน origin ของหน้าเว็บกับตัวจำลอง Core Hub 50+ เคส) แก้ 3 ข้อ:
  1. โปรแกรมมอนที่ `cast()` สกิลที่มอนไม่มี ได้ข้อความของผู้เล่น ("เป็นสกิลของmonster ปลดที่เลเวล 1 · สกิลที่คุณใช้ได้ตอนนี้") →
     ข้อความของมอน: "มอนตัวนี้ไม่มีสกิล 'roar' — เลือกสกิลนี้ในช่องสกิลของมอน หรือใช้สกิลที่มอนมี: bite"
  2. แก้มอนพร้อมกัน 5 คำขอ ได้ 409 "ข้อมูลซ้ำกับที่มีอยู่แล้ว" 3 คำขอ → ล็อกแถวโจทย์ก่อนแทนชุดมอน คำขอต่อคิวกันได้ 200 ทุกคำขอ
  3. โจทย์ถูกลบระหว่างจำลองการรบ → บันทึกผลชน foreign key เป็น 500 → ล็อกโจทย์ (`FOR KEY SHARE`) ตอนบันทึก ไม่มีแล้วตอบ 404 ไม่ได้รางวัล
  - `monsters: [null]` ได้ข้อความไทย "monsters แต่ละตัวต้องเป็น object" แทนข้อความอังกฤษของ class-validator
  - ผลรันหลังแก้: engine 233 · backend unit 170 · e2e 46 (+2 เคสข้อ 2 และ 3 — ทั้งสองเคสไม่ผ่านก่อนแก้)
- ตัดสินแล้ว 7 ต.ค. 2569 (ข้อ M4 เพิ่มเติม · M7 ใน docs/design-challenge-monsters.md):
  - เจ้าของโจทย์สู้มอนของตัวเองได้แต่ **ไม่ได้รางวัล** (`challenge.ownChallenge: true`) และไม่ขึ้นในตาราง "ผลของผู้เล่น" — ผู้สอนคนอื่นสู้ได้รางวัลตามปกติ
  - `POST /api/v1/challenges/trials` ทดลองสู้ด้วยตัวละครตัวอย่าง (อาชีพ + เลเวล · สเตตัสตามน้ำหนักมาตรฐานของอาชีพ · ไม่มีอุปกรณ์) ·
    มอนที่ยังไม่บันทึกก็ได้ · ผู้สอนไม่ต้องมีตัวละคร · ไม่บันทึกอะไร ไม่มีรางวัล · โปรแกรมผิดชี้ `programSource: บรรทัด:คอลัมน์`
  - ผลรัน: engine 236 (+3) · e2e 48 (+2: เจ้าของโจทย์ไม่ได้รางวัลและไม่ขึ้นตาราง · ทดลองสู้ไม่แตะฐานข้อมูล ทั้งชนะ/แพ้/400/403)

**standards 1.8.4 + image สำหรับ server กลาง (6 ต.ค. 2569 · branch `bump-standards-v1-8-4`)** — standards/docs/deployment.md 1.4

- ไฟล์ใหม่: `backend/Dockerfile` · `backend/docker/entrypoint.sh` · `frontend/Dockerfile` · `.dockerignore` · `.gitattributes` (`*.sh` เป็น LF) · `docker-compose.yml`
- `frontend/next.config.ts` ตั้ง `output: 'standalone'` + `outputFileTracingRoot` · `prisma` ย้ายเป็น dependency ตอนรัน (api ใช้ `prisma migrate deploy` ตอนสตาร์ต) ·
  `DATABASE_POOL_MAX` (ค่าเริ่มต้น 5 · รับ 1–20) ส่งเข้า `PrismaPg({ max })` และประกาศใน `backend/.env.example`
- ตัวตรวจ `check-deploy-ready.sh` ของ 1.8.4 ผ่าน · `run-all-checks.sh` 20/20 · lint · typecheck · backend unit 170 · e2e 39 · frontend 81 · engine 223
- **เครื่องที่ทำงานนี้ build image ไม่ได้** (proxy ปิด Docker Hub และ binaries.prisma.sh) — จึงจำลองทีละคำสั่งของ Dockerfile แทน:
  build context จริงจาก `.dockerignore` (4.5 MB · ไม่มี `.env` `node_modules` `dist` `standards` `docs`) → ติดตั้งและ build ตาม stage →
  ประกอบ layout ของ runtime stage แล้วรันด้วย user ที่ไม่ใช่ root บนไฟล์อ่านอย่างเดียว · HOME เขียนไม่ได้ · env แบบ compose (`NODE_ENV=production`)
  - web: `node frontend/server.js` ตอบ 200 · rewrites ฝัง `http://api:4000` · `/api/health` ผ่าน web ถึง api
  - api: `node dist/main.js` · `subsystem.started` port 4000 · Prisma อ่าน `prisma.config.ts` และ schema ได้บนไฟล์อ่านอย่างเดียว
  - conformance v1.2 ผ่านหน้าเว็บ standalone :3213 → api :4000 กับตัวจำลอง Core Hub: **72 passed · 0 failed · 0 skipped**
  - RAM: api ~129 MB · web ~86 MB (รวม ~215 MB ต่ำกว่าเพดาน ~400 MB) · ไม่มี EACCES/EROFS · ไม่พบ token หรืออีเมลใน log
  - ยังไม่ได้ทดสอบ: `prisma migrate deploy` ใน container (ตอนทดสอบลง migration ด้วย `psql` แทน) และ `docker build` จริง —
    ทดสอบได้ที่ Actions → Images → Run workflow บน branch นี้ หรือ `docker compose up -d --build` บนเครื่องที่มี Docker

**log ด้านยืนยันตัวตน/สิทธิ์ครบตาม log-events.json 1.1 (3 ต.ค. 2569 · branch `auth-logs`)** — standards/docs/logging.md

- `src/common/auth-log.ts` จุดเดียวที่เขียน event เหล่านี้ · type ของแต่ละ event บังคับ field ให้ครบและไม่เกินตามสัญญา
- `subsystem.started` หลัง `listen` · `jwt.verification.success` ทุกครั้งที่ตรวจ token ผ่านและแมป role ได้ (ทั้ง request และ `/auth/callback`) ·
  `jwks.refresh` (reason `initial` · `cache_expired` · `unknown_kid`) · `jwks.refresh.failure` · `jwks.unknown_kid` · `authorization.denied` (`missing_permission`)
- Core Hub ล่มตั้งแต่บูต (ยังไม่เคยได้ JWKS) → reason `jwks_unavailable` แทน `unknown_kid` · ยัง 401 เหมือนเดิม
- ผลรัน: backend unit 168 (+6 เคส log) · e2e 39 · eslint · run-all-checks 19/19 · conformance v1.2 72/72 กับตัวจำลอง (backend `dist` + หน้าเว็บ :3213)
- log ของ backend หลังรัน conformance: `subsystem.started` 1 · `jwt.verification.success` 29 · `jwt.verification.failure` 32 · `jwks.refresh` 1 ·
  `jwks.unknown_kid` 2 · `authorization.role_mapping_failed` 2 · ยิง student สร้างโจทย์เพิ่ม → `authorization.denied` path `/api/v1/challenges` (ไม่มี query) ·
  เปิดอีกตัวที่ JWKS ต่อไม่ได้ → `jwks.refresh.failure` + `jwt.verification.failure` reason `jwks_unavailable`
- ค้น log: ไม่พบ `eyJ` · `access_token=` · `authorization:` · `cookie:` · อีเมล · รหัสนักศึกษา · path ที่มี query

**ชื่อในเกม = รหัสจาก Core Hub (1 ต.ค. 2569 · branch `person-code-name`)** — ทีมตกลงให้แสดงรหัสแทนชื่อทุกที่ (รวมตอนดวล)

- `POST /api/v1/characters` เรียก `GET {CORE_HUB_URL}/api/v1/people/me` จาก backend ด้วย token ของผู้เล่น (reference-data.md 1.3 ข้อ 5 · 8)
  ได้รหัส → `display_name` = `person_code` = รหัส (ไม่สนชื่อที่ส่งมา) · `data: null` → 400 ให้ตั้งชื่อเอง ซึ่งต้องมีอักษรไทยอย่างน้อย 1 ตัว
  (รหัสเป็นอักษรอังกฤษกับตัวเลขล้วน ชื่อสำรองจึงปลอมเป็นรหัสของใครไม่ได้) · ไม่เก็บชื่อหรืออีเมล · ไม่ cache
- Core Hub ตอบไม่ปกติ (ข้อ 7.4): 401 → 401 (เบราว์เซอร์ SSO ใหม่) · 403 → 403 · 429 / 5xx / timeout / คำตอบผิดรูป → 503 + `Retry-After` · ไม่สร้างตัวละคร
- ตัวละครที่สร้างก่อนหน้านี้คงชื่อเดิม (`person_code` เป็น null) — ฐานข้อมูลจริงยังไม่มีผู้เล่น
- ผลรัน: backend unit 162 (ตัวเรียก `/people/me` 17 เคส) · e2e 39 · frontend 81 · conformance v1.2 72/72 · เบราว์เซอร์ W1–W14
  (W13 player ของตัวจำลองกดเริ่มเล่นครั้งเดียวได้ชื่อ `6704102710` · W14 admin ที่ไม่มีรหัสได้ช่องตั้งชื่อ `admin01` ถูกเตือน `ผู้ดูแลทดสอบ` ผ่าน) ·
  ค้น log ไม่พบ token และไม่พบรหัสของผู้เล่น
- ตัวเปิดเว็บ (`csmju2030/run-web/start.cjs`) ลง migration ใหม่ให้ฐานข้อมูลเดิมเองแล้ว ข้อมูลตัวละครเดิมยังอยู่

**standards 1.7.0 (1 ต.ค. 2569 · branch `auth-1-2`)** — runner `conformance/run.js` ของ v1.7.0 (สัญญา 1.2) กับตัวจำลอง Core Hub ที่เพิ่มบัญชี
lecturer/guest และใส่ `azp` ใน token ของ SSO (`SIM_AZP=1`) · บัญชีอ่านจาก `CONFORMANCE_ACCOUNTS_FILE` นอก repo · `denied_role: guest`

```
  PASS  L1-28.lecturer core role "lecturer" is mapped (200) or explicitly refused (403)
  PASS  L1-28.guest core role "guest" is mapped (200) or explicitly refused (403)
  PASS  L1-29.guest refusal for "guest" uses FORBIDDEN
  PASS  L2-12      role "guest" cannot write → 403
RESULT: 72 passed · 0 failed · 0 skipped · 0 warnings · retries: 0
✅ CONFORMANT — csmju-gamification-knowledge meets standard v1.2 L3
```

- ขั้น 9–10 runner ทดสอบไม่ได้ (สัญญาให้ unit test ครอบเอง) — `auth.verifier.spec.ts`: ไม่มี iat · อายุ 7 วัน · 961 วินาที → 401 · 960 วินาทีพอดีผ่าน ·
  `azp` ของระบบอื่น/ไม่ใช่ข้อความ/ว่าง → 401 · `azp` ของเรา และไม่มี `azp` → ผ่าน · `sub` แบบ `user-6304101234` + claim เพิ่ม → ผ่าน
- เบราว์เซอร์จริง (`csmju2030/web-test.mjs`) W1–W12 ผ่าน: W10 lecturer เข้าได้เป็น INSTRUCTOR · W11 guest ไม่เห็นเมนูและถูกปฏิเสธที่ `/sso/error` ของ Core Hub ·
  W12 คุกกี้ state หมดอายุระหว่าง login → หน้า "เข้าสู่ระบบอีกครั้ง" (401) → กดแล้วกลับเข้าเกมเองเพราะ Core Hub ยัง login อยู่
- ค้น log ของ backend หลังรันทั้งหมดด้วย `grep -iE "eyJ|access_token=|authorization:|cookie:"` (connect-core-hub.md ข้อ 6 การทดสอบที่ 6) → ไม่พบ
- **ยังไม่ได้รันกับ Core Hub จริง** (`https://csmju2030.jowave.com`) — ต้องลงทะเบียนด้วยบัญชีเจ้าของระบบของทีม และได้บัญชีทดสอบจากผู้ดูแล dev server ก่อน

ชุดตรวจ 1.5.2 (จำลอง CI แบบใหม่: ตัวกลาง `@v1.5.2` เลือกชุดตรวจจาก `.standards-version` · 29 ก.ย. 2569):

- **เลื่อนเวอร์ชันอยู่ใน PR แยก** (`bump-standards-1-5-0` · แก้แค่ `.standards-version` กับ submodule `standards`) — PR นี้ไม่แตะไฟล์เวอร์ชันและ `.github/` เลย
  เมื่อ PR เลื่อนเวอร์ชัน merge แล้ว PR นี้จะถูกตรวจด้วยชุด 1.5.2 (กด Update branch ให้ CI รันใหม่) · ก่อนหน้านั้นยังตรวจด้วย 1.0.0
- **ARC-02** (`@tower/engine`) และ **UI-01** (6 ไฟล์ภาพของเกม) — PM อนุมัติยกเว้นแล้ว 28 ก.ย. · ใส่ `.compliance-exceptions.yml` แล้ว (8 รายการ · csmju2030-standards#29 · หมดอายุ 2027-03-31) · ผ่านเมื่อตรวจด้วยชุด 1.5.2
- ลองใส่ไฟล์ข้อยกเว้นร่างบนสำเนาแยกแล้ว: ชุดตรวจ 1.5.x ผ่านครบ รวม ARC-04 (ต้องมี backend NestJS) ข้อใหม่

`node standards/conformance/run.js` (conformance 1.1 · 69 ข้อ) — **รันกับตัวจำลอง Core Hub ที่ปรับเป็นสัญญา 1.1** (`csmju2030/csmju-core-hub-sim`:
เว็บ `/sso/authorize` · `/logout` · API ส่ง state ต่อตรงตัว) · base_url `http://localhost:3003` (หน้าเว็บที่ส่งต่อ `/api/*` `/auth/*` ไป backend)

```
── L3 · SSO — /auth/login starts every sign-in
  PASS  L3-16      /auth/login → 302 to Core Hub web /sso/authorize with subsystem and state
  PASS  L3-17      /auth/login sets an HttpOnly csmju_gamification_knowledge_sso_state lasting at most 600 s
── L3 · SSO — callbacks that must not create a session
  PASS  L3-18      callback without state → 302 to /auth/login, no session cookie
  PASS  L3-19      callback with a state but no state cookie → 401, no session cookie
  PASS  L3-20      state from one /auth/login with the cookie of another → 401
  PASS  L3-21      next=//evil.example.com still lands on a path of the subsystem itself
── L3 · SSO — sign-out
  PASS  L3-22      POST /auth/logout → 303 to Core Hub web /logout and clears csmju_gamification_knowledge_access_token

────────────────────────────────────────────────────────────
RESULT: 69 passed · 0 failed · 0 skipped · 0 warnings · retries: 0
✅ CONFORMANT — csmju-gamification-knowledge meets standard v1.1 L3
```

ผลเดิมกับ **Core Hub จริง** ตามสัญญา 1.0 (26 ก.ย. 2569 · `csmju-core-hub` develop `6674ef6`): `62 passed · 0 failed · 0 skipped` —
ยังไม่ได้รันซ้ำกับ Core Hub จริงที่รองรับ 1.1 เพราะตอนนี้เข้า repo นั้นไม่ได้

**ทดสอบกับ Core Hub จริง ตามสัญญา 1.0** (26 ก.ย. 2569 · API และเบราว์เซอร์จริง): ลงทะเบียน → approve → activate · token ของทั้ง 4 role · SSO → callback → คุกกี้ ·
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
| backend unit (jest, ไม่ใช้ฐานข้อมูล) | 162 ผ่าน · `GET /people/me` ของ Core Hub (401/403/429/5xx/timeout/คำตอบผิดรูป · log ไม่มี token และรหัส) · ตรวจ token 10 ขั้น (อายุ token · `azp`) และ reason ของ log ทุกเหตุผล · role 6 ค่า · กฎ `next` 5 ข้อ · state และคุกกี้ของ SSO 1.1 · error code 9 ค่า · รวมเคส 403 ของ PermissionsGuard · โปรแกรมตัวอย่างอาชีพ |
| backend e2e (jest + PostgreSQL 16 จริง) | 39 ผ่าน (ชื่อในเกม = รหัสจาก Core Hub · ไม่มีรหัสต้องตั้งชื่อที่มีอักษรไทย · Core Hub ล่ม → 503 + Retry-After · สัญญา 1.2: token อายุยาว/`azp` ผิดที่ callback → 401 · หน้า HTML ของ callback ที่ไม่ผ่าน · lecturer สร้างโจทย์ได้ · guest 403 · SSO 1.1 ครบทุกกรณีของข้อ 5.1 · `/auth/logout` 303 · `/me` คืน `session.expiresAt` · ค้นหาในตารางทั้งสาม ·เพิ่ม game-data สำหรับผู้สอนที่ไม่มีตัวละคร · ครั้งที่รบที่จุดเดียวกัน + `mpAfter` · ตัวอย่างอาชีพ) |
| frontend (vitest + jsdom) | 81 ผ่าน · หน้าสร้างตัวละคร (มีรหัส = ปุ่มเดียว · ไม่มีรหัสค่อยถามชื่อ · 503) · silent re-SSO (กันวน 30 วินาที · ไม่เด้งทับงานค้าง · ต่ออายุล่วงหน้าตอนเปลี่ยนหน้า) · ช่องค้นหา (หน่วง 300ms · Enter · Esc · ล้างจากข้างนอก) · ตัวเล่นฉากรบ (รวมหลอด MP) บันทึกการรบ ตัวแยกข้อผิดพลาดของโปรแกรม round-trip บล็อก↔โค้ด กฎแผนที่ สรุปการเติบโต |
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
  ตรวจ 10 ขั้นตามสัญญา 1.2 · Bearer ก่อนคุกกี้ · callback ตั้งคุกกี้ HttpOnly SameSite=Lax อายุไม่เกิน exp · ไม่มี Set-Cookie เมื่อไม่ผ่าน)
  ทุกไฟล์มีหมายเหตุ "ต้องแทนที่ด้วยไฟล์ของ reference" — จะแทนทั้งไฟล์ในขั้น 3
- แก้ไข: ไม่มี (ยังไม่มีต้นฉบับให้แก้)

## Role mapping ที่ประกาศ (ต้องตรงกับ default_role_mapping ในทะเบียน)

| core role | subsystem role |
|---|---|
| student | PLAYER |
| alumni | PLAYER |
| staff | INSTRUCTOR |
| lecturer | INSTRUCTOR (role ใหม่ใน standards 1.7.0 · ทีมตกลง 1 ต.ค. 2569) |
| admin | ADMIN |
| guest | — ไม่รับ (ไม่ติ๊กในทะเบียน · ถ้ามาถึงได้ 403) · ใช้เป็น `denied_role` ของ conformance |

ตอนลงทะเบียนบน Core Hub จริงให้ติ๊ก 5 role นี้และใส่ชื่อ role ตามตารางให้ตรงกัน · สิทธิ์ของแต่ละ role อยู่ใน `backend/src/auth/permissions.ts` ที่เดียว

## ข้อสมมติที่ตั้งเอง (เพราะมาตรฐานไม่ได้ระบุ)

1. ชื่อที่ผู้เล่นคนอื่นเห็นคือรหัสนักศึกษา/บุคลากรจาก Core Hub (ทีมตกลง 1 ต.ค. 2569 แทน D5 เดิมที่ให้ตั้งชื่อเอง) — บัญชีที่ไม่มีรหัสตั้งชื่อเอง · ไม่ใช้อีเมลจาก token
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

- **ARC-02 — ยกเว้นแล้ว** — `@tower/engine` · PM อนุมัติ 28 ก.ย. (csmju2030-standards#29) (เฉพาะ `frontend/package.json` และ `backend/package.json` ·
  ห้ามใส่ไลบรารีภายนอกนอก whitelist ใน `packages/engine/package.json`) · ตัวตรวจ 1.4.0 ขึ้นไปอ่าน `.compliance-exceptions.yml` · ชุด 1.0.0 ยังไม่อ่าน จึงต้อง merge PR เลื่อนเวอร์ชันก่อน
- **ยังไม่ได้รันกับ Core Hub จริง** — standards 1.7.0 ให้ใช้ `https://csmju2030.jowave.com` (ห้ามโคลนหรือรัน `csmju-core-hub` เอง เพราะมีข้อมูลนักศึกษาจริง —
  สำเนาที่เคยใช้ทดสอบเมื่อ 26 ก.ย. ไม่อยู่ในเครื่องพัฒนาแล้ว) · ที่ยังขาด: PL ลงทะเบียนด้วยบัญชีเจ้าของระบบของทีม (Callback `http://localhost:3213/auth/callback`)
  · พอร์ตของทีมได้แล้ว: frontend 3213 · backend 4213 (2 ต.ค. 2569 · ใช้ในโค้ดแล้ว)
- **`demo-student-subsystem` ยังอ่านไม่ได้** (clone แล้วได้ `could not read Username`) — ชั้น auth จึงยังไม่ใช่ของ reference
- **ยังไม่ได้ทดสอบกับ Core Hub จริงที่รองรับสัญญา auth 1.2** — ตรวจกับตัวจำลองที่ปรับตามสัญญาแล้ว (conformance 72/72 · เบราว์เซอร์ W1–W14)
- **`GET /people/me` ยังไม่ได้ยิงกับ Core Hub จริง** — รูปคำตอบ (`data.personCode` · `data: null` · guest 403) ทำตาม `reference-data.md` 1.3 ข้อ 5.2
  ตรวจกับตัวจำลองเท่านั้น · บัญชีทดสอบร่วมของ server จริงอาจไม่ผูกกับบุคคล จึงจะได้ช่องตั้งชื่อแทนรหัส
- **Callback URL ในทะเบียนต้องเป็นของหน้าเว็บ** `<หน้าเว็บ>/auth/callback` (ตอนพัฒนา `http://localhost:3213/auth/callback`) — origin ของระบบคือหน้าเว็บ
  ซึ่งส่งต่อ `/api/*` และ `/auth/*` ไป backend · `register-code-tower.cjs` แก้ให้แล้ว · บน Dev Server ต้องให้ผู้ดูแลทะเบียนแก้
- **`prisma migrate deploy` ยังไม่ได้รันจริง** — เครื่องทดสอบออกเน็ตไป binaries.prisma.sh ไม่ได้ (ดูข้อถัดไป) · บนเครื่องที่ออกเน็ตได้ต้องรันตามคู่มือข้อ 6.3
- **ชั้น auth ยังไม่ใช่ของ reference** — รอสิทธิ์ `demo-student-subsystem`
- **UI-01 — ยกเว้นแล้ว เฉพาะเวทีเกม** — สีของ sprite เอฟเฟกต์ บล็อกโค้ด และหมุดบนแผนที่ (6 ไฟล์ใต้ `frontend/src/game-stage/`) · PM อนุมัติ 28 ก.ย. (csmju2030-standards#29) · ไม่ได้แปลง hex เป็น `rgb()` เพื่อเลี่ยงการตรวจ เพราะเนื้อหายังเป็นสีนอก token อยู่ดี ให้ exception เป็นทางที่ตรวจสอบได้
- **frontend ยังเป็นชุดจำลอง** — `src/csmju/` เขียนจากสเปค ไม่ใช่ template จริง (ยังไม่มีสิทธิ์อ่าน `csmju-core-hub`) · โลโก้เป็นตัวอักษรแทนภาพ · ช่องค้นหาและกระดิ่งบน top bar เป็นภาพประกอบ (disable)
- **Lighthouse วัดบนเครื่องพัฒนา** — Chromium headless · ตัวเลขมือถือแกว่ง ±5 ระหว่างรอบ จึงรายงานค่ากลางของ 3 รอบ · ยังไม่ได้ทดสอบบน Safari iOS / Android จริง (ข้อ 18.2)
- **ยังไม่ได้ตรวจ migration drift ด้วย Prisma** — `prisma migrate diff` ต้องใช้ schema engine ซึ่งเครื่องที่พัฒนาดาวน์โหลดไม่ได้ (proxy ตอบ 403 ที่ binaries.prisma.sh)
  migration เขียนตามรูปแบบของ Prisma และทดสอบแล้วว่า Prisma Client ทำงานกับมันได้ครบทุก query (e2e 21 ชุด) — ต้องรันบนเครื่องที่ต่อเน็ตได้ (ตาม data-dictionary.md ข้อ 9.3): `pnpm --filter backend exec prisma migrate deploy` แล้ว `pnpm --filter backend exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` ต้องได้ No difference detected
- **พฤติกรรมเดิมที่คงไว้ (ไม่ใช่บั๊กของการย้าย):** คนที่สามที่เข้าโซนตอนมีคู่ที่จับกันสองทางอยู่แล้ว จะดวลแบบทางเดียวกับคนล่าสุดในคู่นั้น (ออกแบบไว้ในรอบ 2W · parity ยืนยันว่าเหมือนเดิม) — ถ้าอยากให้จับคู่ใหม่ได้มากขึ้นเป็นงานออกแบบรอบหน้า
- **ขีดความสามารถที่วัดได้:** เข้าโซนเดียวกันพร้อมกัน 400 คน ตอบ 201 ครบ ช้าสุด 3.4 วินาที · 600 คนพร้อมกันในโซนเดียวเริ่มมี 500 (Prisma รอคิวทรานแซกชันเกิน 2 วินาที) — เกินขนาดห้องเรียนมาก
