# Code Tower — API Spec v0.1 (contract ระหว่าง backend-dev และ ui-dev)

Base URL: `http://localhost:3000/api`
Auth: JWT ใน header `Authorization: Bearer <token>` (ทุก endpoint ยกเว้น auth/*)
Error format ทุกจุด: `{ "error": "ข้อความ" }` + HTTP status ที่เหมาะสม

## Auth
- `POST /auth/register` body `{ username, password }` → `{ token, character }`
  - **ไม่รับ `classId` แล้ว ตั้งแต่ 19 ก.ย. 2026 (รอบ 2P §3.3)** — ทุกคนเริ่มเป็น `novice` (ผู้ฝึกหัด)
    แล้วเลือกอาชีพหลังผ่านชั้น 1 ผ่าน `POST /me/class`
  - ถ้า client รุ่นเก่ายังส่ง `classId` มา เซิร์ฟเวอร์จะ**ไม่สนใจและไม่ปฏิเสธ** (ยังสมัครสำเร็จ เป็น novice)
- `POST /auth/login` body `{ username, password }` → `{ token, character }`

## Character
- `GET /me` → `{ character }` โดย character =
```json
{
  "id": 1, "username": "a", "classId": "warrior", "level": 3,
  "exp": 120, "expToNext": 145,
  "proficiency": {
    "work": { "str": 26.417, "int": 0, "vit": 1.25 },
    "share": { "str": 0.9135, "int": 0, "vit": 0.0865 },
    "projectedPoints": { "str": 4, "int": 0, "vit": 0 },
    "pointsPerLevel": 4,
    "usingClassDefault": false
  },
  "stats": { "str": 8, "int": 2, "vit": 6, "agi": 5, "luk": 4 },
  "derived": { "maxHp": 0, "maxMp": 0, "atk": 0, "matk": 0, "def": 0, "mdef": 0, "speed": 0, "critRate": 0, "critDmg": 1.5, "evasion": 0, "dropBonus": 0 },
  "gold": 100, "materials": 0,
  "equipment": { "weapon": null, "armor": null, "helmet": null, "accessory": null },
  "skills": [ { "id": "w_power_strike", "nameTh": "...", "unlockLevel": 1, "mpCost": 8, "kind": "physical", "aoe": false } ],
  "highestFloorCleared": 0
}
```
  - `derived` = ค่าหลังรวมอุปกรณ์แล้ว (server เรียก engine.buildDerivedStats)
  - ~~`statPoints`~~ — **ถอดออกแล้ว 19 ก.ย. 2026 (รอบ 2P §3.2)** ไม่มีแต้มให้กดแจกอีกต่อไป
    ระบบแจกให้เองตอนเลเวลอัพตามสัดส่วนงานที่โปรแกรมทำจริง
- ~~`POST /me/allocate`~~ — **ลบทิ้งแล้ว 19 ก.ย. 2026 (รอบ 2P §3.2)** ตอนนี้ตอบ 404

### `character.proficiency` — "เลเวลนี้คุณทำอะไรไปบ้าง" (รอบ 2P §3.2)

มี **สามช่องเท่านั้น: `str` `int` `vit`** — ช่องที่ความชำนาญควบคุมจริง
**ไม่มี `agi`/`luk` และห้าม UI วาดแถบให้มัน** เพราะสองตัวนั้นโตเองเลเวลละครึ่งแต้ม
ไม่ว่าผู้เล่นจะเขียนโปรแกรมยังไง การโชว์แถบที่กดยังไงก็ไม่ขยับคือการโกหกว่าเขาควบคุมมันได้

| field | ความหมาย | UI ใช้ทำอะไร |
|---|---|---|
| `work` | งานดิบสะสมตั้งแต่เลเวลที่แล้ว หน่วย "หลอดเลือด" (ดาเมจ ÷ maxHp ของเป้า) | โชว์ตัวเลขจริง/ดีบัก — **ห้ามเอาไปวาดแถบตรง ๆ** เพราะสามช่องคนละหน่วยกัน |
| `share` | สัดส่วนหลังคูณ `PROFICIENCY_WEIGHTS` แล้ว **รวมได้ 1.0 พอดี** (หรือ 0 ทั้งสามช่องถ้ายังไม่มีงาน) | **ความกว้างของแถบ** — คูณ 100 ได้เปอร์เซ็นต์ตรง ๆ |
| `projectedPoints` | ถ้าเลเวลอัพเดี๋ยวนี้ จะได้แต้มไหนกี่แต้ม (จำนวนเต็ม รวม = `pointsPerLevel`) | ป้ายบนแถบ เช่น "+3 STR" |
| `pointsPerLevel` | แต้มต่อเลเวลที่ความชำนาญเป็นคนแจก (ตอนนี้ = 4; อีก 1 แต้มกันไว้ให้ AGI/LUK ซึ่งโตเอง) | ตัวหารของป้าย |
| `usingClassDefault` | `true` = ยังไม่มีงานเลยสักช่อง ระบบจะถอยไปใช้น้ำหนักมาตรฐานของอาชีพแทน | บอกผู้เล่นว่า "ยังไม่ได้ทำอะไรในเลเวลนี้ — ตัวเลขข้างล่างคือค่าเริ่มต้นของอาชีพ" |

ทำไมต้องมีทั้ง `share` และ `projectedPoints`: แถบบอกแนวโน้ม แต่ตัวเลขจริงเป็นผลของการปัดเศษ
แบบ largest-remainder ซึ่งเดาจาก `share` ไม่ได้ (0.5/0.3/0.2 ได้ 2/1/1 ไม่ใช่ 2/1.2/0.8)

**ตัวนับรีเซ็ตเป็น 0 ทุกครั้งที่เลเวลอัพ** — §3.2 บอกให้ "นับเฉพาะตั้งแต่เลเวลที่แล้ว"
ผู้เล่นต้องรู้สึกว่า "สิ่งที่ผมเพิ่งทำ มีผลกับเลเวลนี้"

### `POST /me/class` — เลือกอาชีพ (รอบ 2P §3.3)

body `{ classId }` → `{ character }`

- `classId` ต้องเป็น `warrior | mage | guardian` (= `PLAYABLE_CLASSES` ใน engine) — **`novice` ไม่ใช่ตัวเลือก**
- ปฏิเสธ **400** พร้อมข้อความไทยที่บอกเหตุผล เมื่อ:
  | เงื่อนไข | ข้อความ |
  |---|---|
  | `classId` ไม่อยู่ในรายการ (รวมกรณีส่ง `novice` หรือไม่ส่งเลย) | `เลือกอาชีพได้เฉพาะ warrior (นักรบ) · mage (จอมเวท) · guardian (ผู้พิทักษ์) เท่านั้น` |
  | ตัวละครไม่ได้เป็น `novice` แล้ว (เลือกได้ครั้งเดียว) | `เลือกอาชีพได้ครั้งเดียว — ตอนนี้เป็นนักรบแล้ว เปลี่ยนอาชีพยังทำไม่ได้ในรอบนี้` |
  | `highestFloorCleared < 1` | `ต้องผ่านชั้น 1 ก่อนถึงจะเลือกอาชีพได้ — ลองสู้ให้เห็นการต่อสู้จริงสักครั้งก่อน` |
- สำเร็จแล้ว: เปลี่ยนแค่ `classId` — **สเตตัสไม่รีเซ็ต** และสกิลปลดตามเลเวลเองทันที
- client ดูว่าควรแสดงหน้าเลือกอาชีพเมื่อไรจาก `character.classId === 'novice' && character.highestFloorCleared >= 1`
  (ไม่มี field แยก เพราะสองค่านี้อยู่ใน `character` อยู่แล้วและเป็นแหล่งความจริงเดียวกับที่เซิร์ฟเวอร์ตรวจ)

## Inventory & equipment
- `GET /inventory` → `{ items: ItemInstance[] }` (ItemInstance ตาม engine/src/types.ts + เพิ่ม `nameTh`, `mainStat: {stat, value}` ที่คำนวณ upgradeLevel แล้ว)
- `POST /equip` body `{ itemId }` → `{ character, items }` (สวมทับ = ถอดชิ้นเก่าเข้ากระเป๋า)
- `POST /unequip` body `{ slot }` → `{ character, items }`
- `POST /salvage` body `{ itemIds: [] }` → `{ materialsGained, materials, items }` (ห้ามย่อยของที่สวมอยู่)
- `POST /upgrade` body `{ itemId }` → `{ item, gold, materials }` หรือ 400 ถ้าเงิน/ของไม่พอ หรือ +15 แล้ว

## Rules (Gambit)
- ~~`GET /rules` · `PUT /rules`~~ — **ลบทิ้งแล้ว 19 ก.ย. 2026 (รอบ 2B-2)**
  เหตุผล: `PUT /rules` ล้าง `program_source` ทุกครั้งที่บันทึก เพื่อให้ `GET /program` แปลงกฎชุดใหม่ให้
  พอเอดิเตอร์ BloxCode ขึ้นแทน เส้นทางนี้กลายเป็นช่องที่ผู้เล่นเผลอเข้าหน้ากฎเก่าแล้วกดบันทึก
  แล้วโปรแกรม Python ที่เขียนเองหายเงียบ ๆ ไม่มีทางกู้ — จึงตัดทั้งหน้าและทั้ง endpoint
  `rules_json` ยังอยู่ในฐานข้อมูลแต่**อ่านอย่างเดียว** ใช้เพื่อ migration เท่านั้น

## Tower
- `GET /tower` → `{ highestFloorCleared, maxFloor: 10, globalHighestFloor }`
  - **รอบ 2F §3.2:** `highestFloorCleared` ของ endpoint นี้คือ **ชั้นสูงสุดของหอคอยที่ผ่านแล้ว**
    (ความคืบหน้าของภูมิภาค `tower` เอง) ไม่ใช่ความยากสูงสุดที่ชนะที่ไหนก็ได้อีกต่อไป
    ตัวหลังย้ายไปอยู่ `globalHighestFloor` ซึ่งยังเป็นตัวปลดล็อกภูมิภาคและไวยากรณ์เหมือนเดิม
    คนที่เล่นแต่หอคอยจะเห็นสองเลขนี้เท่ากันเสมอ
- `POST /tower/challenge` body `{ floor }` →
  `{ result: BattleResult, character, leveledUp: boolean, newLevel?: number, statsGained?, legacyPointsAllocated? }`
  - server ตรวจ: floor ≤ (ชั้นสูงสุดของ**หอคอย**ที่ผ่านแล้ว) + 1 และ ≤ `maxFloor`
    **เปลี่ยนในรอบ 2F §3.2** จากเดิมที่ตรวจกับ `highest_floor` ก้อนรวม — ไม่งั้นผู้เล่นที่
    เคลียร์ภูเขาไฟจนความยาก 8 จะกดท้าทายหอคอยชั้น 9 ได้โดยไม่เคยขึ้นชั้น 1-8
  - `/tower/challenge` กับ `POST /world/tower/{enter,fight}` เป็น **ประตูสองบานของโซนเดียว**
    อ่าน/เขียนแถว `region_progress` ของ `tower` ใบเดียวกัน ชนะทางไหนก็นับที่เดียวกัน
  - server รัน engine.runBattle, บันทึก drops/exp/gold/progress ลง DB แล้วส่ง events ทั้งหมดให้ client เล่นเป็นฉาก
  - `statsGained?: { str, int, vit, agi, luk }` — สเตตัสที่เพิ่งได้จากการรบครั้งนี้ (มีเฉพาะเมื่อได้อะไรจริง)
    **มีครบห้าช่องโดยตั้งใจ** เพราะนี่คือ *ผลที่เกิดขึ้นจริง* ไม่ใช่แถบความชำนาญ —
    ผู้เล่นไม่ได้กดแจกแต้มเองแล้ว ถ้าไม่บอกว่า "เลเวลนี้ได้ +3 STR เพราะคุณตีเยอะ"
    ระบบใหม่จะกลายเป็นเวทมนตร์ที่มองไม่เห็น ซึ่ง §3.2 บอกว่าแย่กว่าการกดแจกแต้มเอง
  - `legacyPointsAllocated?: number` — แต้มค้างของผู้เล่นเดิมที่เพิ่งถูกแจกให้อัตโนมัติ
    เกิดได้ครั้งเดียวต่อผู้เล่นหนึ่งคน (ดู Migration ข้างล่าง)

**การเลเวลอัพ (รอบ 2P §3.2):** ไม่มีแต้มค้างให้กดแจกอีกแล้ว — จบการรบเซิร์ฟเวอร์จะ
เรียก `proficiencyFromBattle()` บวกงานของการรบครั้งนี้เข้าตัวสะสม แล้วถ้าเลเวลขึ้น
จะเรียก `allocatePoints()` แจกลงสเตตัสจริงและรีเซ็ตตัวสะสมเป็น 0 ทั้งหมดอยู่ในทรานแซกชันเดียว
กับการบันทึกผลการรบ

**ขึ้นหลายเลเวลในการรบเดียว** แจก**ทีละเลเวล** (ไม่ใช่ก้อนเดียว) โดยใช้งานชุดเดียวกันทุกเลเวล
เพราะ `allocatePoints()` ใช้พารามิเตอร์ `level` ตัดสินว่าแต้มเฉื่อยรอบนั้นไป AGI หรือ LUK
และการปัดเศษแบบ largest-remainder ที่ §3.2 นิยามไว้ ผูกกับ "4 แต้มต่อเลเวล" ไม่ใช่ก้อนใหญ่

**Migration ผู้เล่นเดิม:** `stat_points` ที่ค้างอยู่จะถูกแจกอัตโนมัติด้วย `allocatePoints()`
ตามงานของการรบครั้งถัดไป แล้วตั้งเป็น 0 ถาวร (สเตตัสที่แจกไปแล้วก่อนหน้านี้คงไว้ครบ)

**Migration ผู้เล่นเดิม (รอบ 2F §3.2 — ความคืบหน้ารายภูมิภาค):** บูตแรกหลังรอบนี้
เขียน `region_progress` ให้ผู้เล่นเดิม **เฉพาะภูมิภาค `tower` เท่ากับ `highest_floor`**
ส่วนภูมิภาคอื่นเริ่มที่ 0 · หอคอยมี `floorBase: 1` ทำให้ `depth` กับ `floor` เป็นเลขเดียวกัน
`highest_floor` จึงเป็นความคืบหน้าของหอคอยอยู่แล้วโดยนิยาม และเป็นเลขที่ `/tower/challenge`
ใช้ตรวจมาตั้งแต่ก่อนมีแผนที่ — การคืนค่านี้จึงคืนสิ่งที่ผู้เล่นทำได้อยู่แล้วเมื่อวาน ไม่มากกว่านั้น
ส่วนภูมิภาคที่เขาไม่เคยเข้า ระบบเคยติด `completed` ให้ผิด ๆ ซึ่งรอบนี้มาแก้ จึงไม่คืนให้
เกิดได้ครั้งเดียวต่อฐานข้อมูลหนึ่งอัน (กั้นด้วยคอลัมน์ `characters.region_seeded_at`)
ไม่งั้นการไปเคลียร์โซนอื่นทีหลังจะทำให้บูตถัดไปแจกหอคอยฟรี

## Static
- `GET /gamedata` → ส่งข้อมูลที่ client ต้องใช้แสดงผล: skills (ของ class ผู้เล่น), affix nameTh map, rarity list, baseItems nameTh map
  - `classes` = **ทุกคลาสที่มีอยู่จริง รวม `novice`** →
    `{ "novice": { "nameTh": "ผู้ฝึกหัด", "growthHint": "...", "baseStats": { "str": 6, ... } }, "warrior": {...}, ... }`
    - `growthHint` + `baseStats` เพิ่มเมื่อ 19 ก.ย. 2026 เพื่อให้หน้าเลือกอาชีพบอกได้ว่าแต่ละอาชีพ
      "เล่นยังไง" ไม่ใช่แค่ชื่อ (§3.3) — เป็นการ**เพิ่ม** field ไม่ได้แก้ของเดิม
    - ลิสต์ "อาชีพที่เลือกได้" ไม่ได้อยู่ในนี้: กรอง `novice` ออกเอง หรือใช้ `PLAYABLE_CLASSES` จาก engine

## หมายเหตุ integration
- server เสิร์ฟไฟล์ static ของ client ที่ build แล้ว (production) จาก `client/dist`
- dev mode: client (vite, port 5173) proxy `/api` → `localhost:3000`

---

## ส่วนขยายเฟส 2B-1 — BloxCode program

`GET /program` → 
```json
{
  "source": "def turn():\n    attack(weakest(enemies))\n",
  "unlockedFeatures": ["call","if_else","string","elif"],
  "availableSkills": [
    { "id": "m_firebolt", "nameTh": "ลูกไฟ", "mpCost": 7, "aoe": false }
  ],
  "highestFloorCleared": 5
}
```

`PUT /program` body `{ "source": "..." }` →
- สำเร็จ: `{ "source" }`
- ผิดพลาด: **HTTP 400** `{ "error": "โปรแกรมมีข้อผิดพลาด", "langErrors": [ { "name":"IndentationError", "messageTh":"...", "line":5, "col":9 } ] }`

เซิร์ฟเวอร์ต้องตรวจครบ 2 ชั้นก่อนบันทึก:
1. parse ผ่าน
2. ใช้เฉพาะไวยากรณ์ที่ปลดล็อกแล้ว (ตาม `highestFloorCleared`) และ API ที่มีจริง

> **ถอดระบบ Memory (MB) ทิ้งทั้งหมด 19 ก.ย. 2026 (รอบ 2P §3.1)**
> หายไปจาก API: `memoryUsed` และ `memoryCapacity` ใน GET/PUT `/program` · `memoryCost`
> ในแต่ละรายการของ `availableSkills` · ชั้นตรวจที่ 3 และ `MemoryError`
> เหตุผล: MB บังคับให้เลือกว่า "จะเอาสกิลไหนใส่โปรแกรม" ซึ่งเป็นการตัดสินใจแบบ RPG
> ไม่ใช่แบบโปรแกรมเมอร์ ตัวบีบที่เหลือคือ MP · คูลดาวน์ · `NODE_BUDGET_PER_TURN`
> · `MAX_PROGRAM_LINES` ซึ่งบีบ*ตอนรบ* จึงบังคับให้เขียนเงื่อนไขจริง

`POST /tower/challenge` — ไม่เปลี่ยน request/response shape เดิม แต่ `CombatEvent` เพิ่ม field:
- `line?: number` — บรรทัดในโปรแกรมที่ตัดสินใจเทิร์นนั้น (client ใช้ไฮไลต์)
- `codeWarnings?: string[]` — เช่น "MP ไม่พอสำหรับ blizzard"

**Migration:** ผู้เล่นที่มี `rules` แบบเก่าอยู่ จะถูกแปลงเป็น BloxCode อัตโนมัติครั้งแรกที่เรียก `GET /program`
(ตาราง `characters` เพิ่มคอลัมน์ `program_source TEXT`; คอลัมน์ `rules_json` เดิมคงไว้ **อ่านอย่างเดียว**
ไม่มี endpoint ไหนเขียนทับได้แล้วตั้งแต่ 19 ก.ย. 2026)

**`POST /tower/challenge`** — ไอเทมใน `result.drops.items` ผ่าน enrich แล้วเหมือนไอเทมในกระเป๋า
(มี `nameTh` และ `mainStat`) แก้เมื่อ 19 ก.ย. 2026: เดิมส่งดิบจาก engine ทำให้การ์ดไอเทม
ในหน้าสรุปผลไม่มีบรรทัด main stat ทั้งที่ไอเทมตัวเดียวกันในกระเป๋ามี
