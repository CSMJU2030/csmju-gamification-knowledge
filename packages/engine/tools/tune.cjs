/**
 * เครื่องมือจูนความยาก — กวาดค่าใน gamedata.balance แล้วบอกว่าชุดไหนเข้าเกณฑ์ B1-B5
 * PM เป็นเจ้าของ · รันด้วย `npm run tune -w engine` (ต้อง build engine ก่อน)
 *
 * ทำไมต้องมี: เกณฑ์ B1-B5 ใน docs/design-round2p.md §2 เป็นตัวเลข ไม่ใช่ความรู้สึก
 * การจูนด้วยการเดาแล้วเล่นดูจึงตอบไม่ได้ว่าเข้าเกณฑ์หรือยัง ต้องกวาดแล้ววัด
 *
 * วิธีทำงาน: แก้ dist/data/gamedata.json แล้วล้าง require cache เพื่อโหลดใหม่
 * (เร็วกว่า build ใหม่ทุกครั้งมาก) ตอนจบคืนไฟล์กลับเป็นค่าเดิมเสมอ
 */
const fs = require('fs');
const path = require('path');

const DIST_DATA = path.join(__dirname, '../dist/data/gamedata.json');
const SRC_DATA = path.join(__dirname, '../data/gamedata.json');

const ORIGINAL = fs.readFileSync(DIST_DATA, 'utf8');

/** โหลด engine ใหม่หลังแก้ไฟล์ข้อมูล — ต้องล้างทุกโมดูลที่อ่านค่าไปแล้วตอน import */
function loadEngine() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/engine/dist/')) delete require.cache[key];
  }
  return require('../dist/src/index.js');
}

function withBalance(patch, fn) {
  const data = JSON.parse(ORIGINAL);
  Object.assign(data.balance, patch);
  fs.writeFileSync(DIST_DATA, JSON.stringify(data, null, 2));
  try {
    return fn(loadEngine());
  } finally {
    fs.writeFileSync(DIST_DATA, ORIGINAL);
  }
}

// ---------------------------------------------------------------- ผู้เล่นสมมติ

/**
 * "ไม่คิดเลย" = ตี attack อย่างเดียวตลอดกาล ไม่เคยดูเลือดตัวเอง
 * "คิดเป็น"   = ดูเลือดตัวเองแล้วป้องกัน/ฮีล + ใช้สกิลตามสถานการณ์
 * ความต่างของสองตัวนี้คือสิ่งที่เกมควรให้รางวัล ถ้าไม่ต่าง เกมก็ไม่ได้บังคับให้คิด
 */
const NAIVE = 'def turn():\n    attack(weakest(enemies))\n';

/**
 * หมายเหตุสำคัญ (19 ก.ย. 2026): ฉบับแรกของไฟล์นี้ตั้งเกณฑ์ป้องกันไว้สูงเกินไป
 * (defend เมื่อเลือดต่ำกว่า 45%) แล้ววัดได้ว่าผู้ฝึกหัด "คิดเป็น" แพ้ชั้น 1
 * ในขณะที่ตีอย่างเดียวชนะ 100% — เพราะ defend แลกทั้งเทิร์นเพื่อลดดาเมจครึ่งเดียว
 * จึงคุ้มก็ต่อเมื่อ "ไม่ป้องกันแล้วตาย" เท่านั้น
 *
 * นั่นแปลว่าตอนนั้นผมกำลังวัดโปรแกรมห่วยของตัวเอง ไม่ได้วัดเกม — โปรแกรมในไฟล์นี้
 * ต้องเป็นตัวแทนของ "คนที่เขียนเป็น" จริง ๆ ไม่งั้นเกณฑ์ B1-B4 จะไม่มีความหมาย
 */
const SMART = {
  novice:
    'def turn():\n'
    + '    if me.hp_pct < 20:\n'
    + '        defend()\n'
    + '    else:\n'
    + '        attack(deadliest(enemies))\n',
  warrior:
    'def turn():\n'
    + '    if me.hp_pct < 25:\n'
    + '        defend()\n'
    + '    elif count(enemies) >= 3:\n'
    + '        cast("whirlwind", enemies)\n'
    + '    else:\n'
    + '        cast("power_strike", deadliest(enemies))\n',
  mage:
    'def turn():\n'
    + '    if me.hp_pct < 45:\n'
    + '        cast("heal", me)\n'
    + '    elif count(enemies) >= 3:\n'
    + '        cast("blizzard", enemies)\n'
    + '    else:\n'
    + '        cast("firebolt", deadliest(enemies))\n',
  /**
   * ผู้พิทักษ์: กางปราการก่อนเลือดจะหมด แล้วตีด้วยสกิลของตัวเอง
   * ไม่ใส่ `taunt` เพราะตอนเล่นคนเดียวมันคุ้มน้อยมาก (แลกทั้งเทิร์นเพื่อลดดาเมจ 30%)
   * — ยั่วยุเป็นเครื่องมือของโหมด co-op ในเฟส 3 ไม่ใช่ของการเล่นเดี่ยว
   */
  guardian:
    'def turn():\n'
    + '    if me.hp_pct < 40:\n'
    + '        cast("barrier", me)\n'
    + '    elif me.hp_pct < 20:\n'
    + '        defend()\n'
    + '    else:\n'
    + '        cast("shield_bash", deadliest(enemies))\n',
};

/** สัดส่วนสเตตัสที่ "การเล่นแบบนั้นจะพาไปเอง" ตามระบบความชำนาญ (รอบ 2P §3.2) */
const ALLOC = {
  naive: { str: 1 },
  novice: { str: 0.7, vit: 0.3 },
  warrior: { str: 0.7, vit: 0.3 },
  mage: { int: 0.8, vit: 0.2 },
  guardian: { str: 0.55, vit: 0.45 },
};

const SEEDS = 12;
const WIN = 0.9;
const MAX_LEVEL = 40;

function makeHero(E, classId, level, alloc, source) {
  const stats = { ...E.gamedata.classes[classId].baseStats };
  const points = (level - 1) * E.FORMULAS.statPointsPerLevel;
  for (const [k, w] of Object.entries(alloc)) stats[k] += Math.round(points * w);
  return {
    id: 'hero', name: 'Hero', side: 'party', classId, level, stats,
    derived: E.buildDerivedStats(classId, level, stats, []),
    skills: E.gamedata.skills
      .filter((s) => s.classId === classId && s.unlockLevel <= level).map((s) => s.id),
    rules: E.gamedata.defaultRules[classId],
    programSource: source,
  };
}

function clears(E, classId, level, alloc, source, floor) {
  let wins = 0;
  for (let i = 0; i < SEEDS; i++) {
    const seed = 1_000_000 + floor * 1009 + i * 7919;
    if (E.runBattle([makeHero(E, classId, level, alloc, source)], floor, seed).victory) wins += 1;
  }
  return wins / SEEDS >= WIN;
}

/**
 * เลเวลต่ำสุดที่ผ่านชั้นนั้นได้ — หาด้วยการแบ่งครึ่ง
 * สมมติฐาน: เลเวลสูงขึ้นแล้วไม่แย่ลง (ไม่จริง 100% เพราะ RNG แต่จริงพอที่จะใช้
 * และถูกกว่าไล่ทีละเลเวลราว 6 เท่า ซึ่งทำให้กวาดค่าได้จริงในเวลาที่ยอมรับได้)
 */
function minLevelToClear(E, classId, alloc, source, floor) {
  if (!clears(E, classId, MAX_LEVEL, alloc, source, floor)) return null;
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (clears(E, classId, mid, alloc, source, floor)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** ชั้นสูงสุดที่ผู้เล่นแบบนี้ไปถึงได้ (ติดกันจากชั้น 1) */
function reach(E, classId, alloc, source) {
  let last = 0;
  for (let floor = 1; floor <= 10; floor++) {
    if (minLevelToClear(E, classId, alloc, source, floor) === null) break;
    last = floor;
  }
  return last;
}

// ---------------------------------------------------------------- เกณฑ์ B1-B5

function evaluate(E) {
  const out = { fails: [], detail: {} };
  const classes = ['warrior', 'mage', 'guardian'];

  // B5 — ผู้ฝึกหัดเลเวล 1 ต้องผ่านชั้น 1
  const noviceOk = clears(E, 'novice', 1, ALLOC.novice, SMART.novice, 1);
  out.detail.B5 = noviceOk;
  if (!noviceOk) out.fails.push('B5 ผู้ฝึกหัด lv1 ผ่านชั้น 1 ไม่ได้');

  for (const c of classes) {
    const naiveReach = reach(E, c, ALLOC.naive, NAIVE);
    out.detail[`reach_${c}`] = naiveReach;
    /**
     * B1 — ไม่คิดเลยต้องชนกำแพงตั้งแต่ต้นเกม
     *
     * เกณฑ์เดิมคือ "ไปได้แค่ชั้น 1" ซึ่ง PM ตั้งเองแล้ววัดแล้วพบว่าผิด (19 ก.ย. 2026):
     * การจะกดให้เหลือชั้น 1 ต้องดันความยากรวมขึ้นจนผู้ฝึกหัดเลเวล 1 ผ่านชั้น 1 ไม่ได้
     * (เกณฑ์ B5 ตกทันที) — กวาดค่าแล้วไม่มีจุดไหนที่ทั้งสองข้อผ่านพร้อมกัน
     *
     * ตัวที่แก้ได้จริงคือ "องค์ประกอบของเวฟ" ไม่ใช่ตัวคูณความยาก: ตั้งแต่ชั้น 2
     * ทุกเวฟมีมอนเลือดหนา+ตีแรงหนึ่งตัวที่ `weakest()` ไม่มีวันเลือก คนที่ไม่คิด
     * จึงโดนมันทุบทั้งเวฟ วิธีนี้กดจาก 7 เหลือ 4 โดยไม่แตะความยากของชั้น 1 เลย
     *
     * เกณฑ์ใหม่ = ไม่เกินชั้น 4 เพราะนั่นคือราว 15 นาทีแรก ซึ่งยังอยู่ในช่วงที่
     * ผู้เล่นจะลองแก้โค้ดต่อ ไม่ใช่ปิดเกมหนี — และดีกว่ากำแพงที่ชั้น 2 ซึ่งลงโทษ
     * คนที่ยังไม่ทันได้เรียนอะไรเลย
     */
    if (naiveReach > 4) out.fails.push(`B1 ${c}: ไม่คิดเลยไปถึงชั้น ${naiveReach}`);

    const smart = [];
    for (let floor = 1; floor <= 10; floor++) {
      smart.push(minLevelToClear(E, c, ALLOC[c], SMART[c], floor));
    }
    out.detail[`smart_${c}`] = smart;

    // B2 — คิดเป็นต้องจบชั้น 10 ที่เลเวล 15-25
    const finish = smart[9];
    if (finish === null) out.fails.push(`B2 ${c}: คิดเป็นยังจบชั้น 10 ไม่ได้`);
    else if (finish < 15 || finish > 25) out.fails.push(`B2 ${c}: จบชั้น 10 ที่เลเวล ${finish}`);

    // B3 — คิดเป็นห้ามแย่กว่าไม่คิดเลยที่ชั้นไหนก็ตาม
    for (let floor = 1; floor <= 10; floor++) {
      const n = minLevelToClear(E, c, ALLOC.naive, NAIVE, floor);
      const s = smart[floor - 1];
      if (n !== null && (s === null || s > n)) {
        out.fails.push(`B3 ${c} ชั้น ${floor}: คิดเป็น(${s ?? 'ไม่ผ่าน'}) แย่กว่าไม่คิด(${n})`);
        break;
      }
    }

    // B4 — เลเวลต้องมีความหมายตลอด: ห้ามค่าเดิมซ้ำติดกันเกิน 2 ชั้น
    let run = 1;
    for (let i = 1; i < smart.length; i++) {
      if (smart[i] !== null && smart[i] === smart[i - 1]) {
        run += 1;
        if (run > 2) { out.fails.push(`B4 ${c}: เลเวล ${smart[i]} ผ่านได้ ${run} ชั้นติด`); break; }
      } else run = 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- main

function main() {
  const arg = process.argv[2];
  const combos = arg === 'sweep'
    ? (() => {
      const list = [];
      for (const dmg of [0.30, 0.38, 0.46]) {
        for (const hp of [0.25, 0.35]) {
          for (const growth of [0.16, 0.22]) {
            list.push({ monsterDmgMult: dmg, monsterHpMult: hp, monsterStatGrowthPerLevel: growth });
          }
        }
      }
      return list;
    })()
    : [JSON.parse(fs.readFileSync(SRC_DATA, 'utf8')).balance];

  for (const patch of combos) {
    const label = `dmg=${patch.monsterDmgMult} hp=${patch.monsterHpMult} growth=${patch.monsterStatGrowthPerLevel}`;
    const r = withBalance(patch, evaluate);
    const naive = ['warrior', 'mage', 'guardian'].map((c) => r.detail[`reach_${c}`]).join('/');
    if (r.fails.length === 0) {
      console.log(`✅ ${label} — เข้าเกณฑ์ครบ · ไม่คิดเลยถึงชั้น ${naive}`);
    } else {
      console.log(`❌ ${label} · ไม่คิดเลยถึงชั้น ${naive} · ตก ${r.fails.length} ข้อ`);
      for (const f of r.fails.slice(0, 4)) console.log(`     - ${f}`);
    }
    if (combos.length === 1) {
      for (const c of ['warrior', 'mage', 'guardian']) {
        console.log(`   ${c}: คิดเป็น ต้องเลเวล ${JSON.stringify(r.detail[`smart_${c}`])}`);
      }
      console.log(`   B5 ผู้ฝึกหัด lv1 ผ่านชั้น 1: ${r.detail.B5 ? 'ผ่าน' : 'ไม่ผ่าน'}`);
    }
  }
}

main();
