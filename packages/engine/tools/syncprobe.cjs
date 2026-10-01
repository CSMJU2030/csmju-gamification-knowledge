#!/usr/bin/env node
/*
 * ⚠️  คำเตือนของ PM (22 ก.ย. 2026) — ตารางที่เครื่องมือนี้เลือกผิดบนเซิร์ฟเวอร์จริง
 *
 * เครื่องมือนี้บอกว่าที่ชั้น 6 เลเวลล็อก 6 "โปรแกรมดีผ่าน 88%" · เซิร์ฟเวอร์จริง: โปรแกรมดีแพ้ภูเขาไฟ 15/15
 *   1. มันเฉลี่ยทุกภูมิภาคที่ชั้นเดียวกัน — ภูเขาไฟที่เป็นไปไม่ได้จมอยู่ในค่าเฉลี่ยของอีกสามโซนที่ง่าย
 *   2. มันให้ของ epic +15 ในอุดมคติ — ผู้เล่นจริงมีของที่อ่อนกว่ามาก
 * ใช้ได้แค่ดูแนวโน้ม · **ห้ามใช้ตั้งตารางจริง** จนกว่าจะวัดรายภูมิภาคด้วยของแบบผู้เล่นจริง
 * ดู docs/measurements/sync-after-2l.txt
 */
/**
 * syncprobe — เลือกตาราง `balance.levelSync` ด้วยการวัด (รอบ 2L §4)
 *
 * คำถามเดียวที่เครื่องมือนี้ตอบ: **ที่เลเวลล็อกเท่าไรของแต่ละชั้น โค้ดถึงเป็นตัวตัดสิน?**
 *
 * วิธีวัด — แยกตัวแปรให้เหลือแค่ "โค้ด":
 *   · ผู้เล่นสองคน **บิลด์เดียวกัน ของเดียวกัน** ต่างกันแค่โปรแกรม
 *   · ทั้งคู่เป็นคนที่ฟาร์มหอคอยจนจบแล้ว: เลเวล 30 · ของชั้น 10 ครบสี่ช่อง +15
 *     = ของดีที่สุดที่หอคอยให้ได้ — กรณีเลวร้ายที่สุดของการล็อก (รูที่กลัวคือของจากหอคอย)
 *   · เข้าโซนแล้วถูกล็อกด้วย syncStats/syncEquipment ชุดเดียวกับที่ server ใช้จริง
 *   · สู้ด้วยเวฟของภูมิภาคจริง (enterRegion) ไม่ใช่เวฟหอคอย เพราะแต่ละโซนมีสระมอนต่างกัน
 *
 * กติกาเลือก (§4): ค่าต่ำสุดที่คนคิดเป็นผ่าน ≥ SMART_MIN แล้วรายงานว่าคนบรรทัดเดียวผ่านเท่าไร
 * ชั้นไหนแยกสองกลุ่มไม่ออก → บอกตรง ๆ ว่าชั้นนั้นไม่มีกำแพง **ห้ามบังคับตัวเลขให้ผ่าน**
 *
 * บทเรียนจากรอบ 2F ที่ฝังอยู่ในเครื่องมือนี้: แบบจำลองวัดได้แค่กลยุทธ์ที่เราคิดออก
 * ตัวเลขจากที่นี่ **ต้องยืนยันด้วยการเล่นจริงบนเซิร์ฟเวอร์** (เกณฑ์ L1) ก่อนเชื่อ
 *
 *   npm run build -w engine && node engine/tools/syncprobe.cjs
 */
const E = require('../dist/src/index.js');

const SEEDS = Number(process.env.SEEDS || 40);
/** อาชีพที่วัด — ตารางเดียวใช้ทุกอาชีพ จึงต้องวัดทุกอาชีพ (ตารางแรกจูนด้วยนักรบคนเดียว) */
const CLASS = process.env.CLASS || 'warrior';
const SMART_MIN = 0.8;
const FARMED_LEVEL = 30;
const HERO_ID = 'p1';

const NAIVE = 'def turn():\n    attack(weakest(enemies))\n';
/**
 * โปรแกรมอ้างอิง "คนคิดเป็น" — **ไม่ใช่ SMART ของ tune.cjs อีกต่อไป** (เปลี่ยน 22 ก.ย. 2026)
 *
 * วัดหกโปรแกรมที่ชั้น 5-9 หลังล็อกเลเวลแล้ว พบว่า SMART ของ tune.cjs (defend ตอนเลือดน้อย ·
 * ดาบหมุน · power_strike ใส่ตัว deadliest) **เป็นโปรแกรมระดับกลาง ๆ** — แพ้โปรแกรมสองบรรทัดข้างล่าง
 * ทุกชั้น และที่ชั้น 4-5 แพ้คนบรรทัดเดียวด้วยซ้ำ สาเหตุที่วัดได้:
 *   · defend() ทำให้ทุกโปรแกรมแย่ลง (เพิ่ม defend ให้คนบรรทัดเดียว ผ่านน้อยลงทุกชั้น)
 *   · เล็ง deadliest แย่กว่าเล็ง weakest (attack(deadliest) อยู่ท้ายตารางเกือบทุกชั้น)
 * ถ้าใช้ SMART ตัวเดิมเป็นไม้บรรทัด เราจะสรุปผิดว่า "โค้ดไม่ช่วย" ทั้งที่จริงไม้บรรทัดคด
 * — และแปลว่าเกณฑ์ B1-B5 ตั้งแต่รอบ 2P ถูกจูนรอบ "คนคิดเป็น" ที่เขียนโค้ดแย่กว่าที่ทำได้จริง
 */
const SMART = 'def turn():\n'
  + '    if count(enemies) >= 3:\n'
  + '        cast("whirlwind", enemies)\n'
  + '    else:\n'
  + '        attack(weakest(enemies))\n';
/**
 * โปรแกรม "คิดเป็น" ของแต่ละอาชีพ — รูปเดียวกัน: ท่าวงกว้างเมื่อศัตรูเยอะ ไม่งั้นเล็งตัวอ่อนสุด
 * (รูปที่วัดแล้วว่าดีที่สุดกับนักรบ) ผู้พิทักษ์ไม่มีท่าโจมตีวงกว้าง จึงใช้ยั่วยุตอนศัตรูเยอะแทน
 */
const SMART_BY_CLASS = {
  warrior: SMART,
  mage: 'def turn():\n    if count(enemies) >= 3:\n        cast("blizzard", enemies)\n'
    + '    else:\n        cast("firebolt", weakest(enemies))\n',
  guardian: 'def turn():\n    if count(enemies) >= 3:\n        cast("taunt", enemies)\n'
    + '    else:\n        cast("shield_bash", weakest(enemies))\n',
};
/** สัดส่วนแต้มของคนที่เล่นอาชีพนั้นตามธรรมชาติ (สายหลักของอาชีพ 80%) */
const MAIN_STAT = { warrior: 'str', mage: 'int', guardian: 'vit' };
/** ตัวเดิมของ tune.cjs — เก็บไว้รายงานเทียบ ไม่ใช้ตัดสิน */
const TUNE_SMART = 'def turn():\n'
  + '    if me.hp_pct < 25:\n'
  + '        defend()\n'
  + '    elif count(enemies) >= 3:\n'
  + '        cast("whirlwind", enemies)\n'
  + '    else:\n'
  + '        cast("power_strike", deadliest(enemies))\n';

/** บิลด์ของคนที่ "ตีอย่างเดียว" มาทั้งเกม — ให้ทั้งสองคนใช้บิลด์นี้ เพื่อให้ต่างกันแค่โค้ด */
function farmedStats(level) {
  const base = E.gamedata.classes[CLASS].baseStats;
  const pts = (level - 1) * 5;
  const main = MAIN_STAT[CLASS];
  const side = main === 'vit' ? 'str' : 'vit';
  const a = Math.round(pts * 0.8), b = Math.round(pts * 0.1), g = Math.round(pts * 0.05);
  const out = { ...base };
  out[main] += a; out[side] += b; out.agi += g; out.luk += pts - a - b - g;
  return out;
}

/** ของดีที่สุดที่หอคอยให้ได้ — ชั้น 10 ทุกช่อง +15 อัฟฟิกซ์ดีตามช่อง */
function towerGear() {
  const pick = (slot, stat) => E.gamedata.baseItems.find((b) => b.slot === slot && b.stat === stat)
    ?? E.gamedata.baseItems.find((b) => b.slot === slot);
  const mk = (slot, stat, affixes) => ({
    id: `g_${slot}`, baseId: pick(slot, stat).baseId, slot, rarity: 'epic',
    upgradeLevel: 15, droppedFloor: 10, affixes,
  });
  const off = CLASS === 'mage' ? 'matk' : 'atk';
  const offPct = CLASS === 'mage' ? 'matk_pct' : 'atk_pct';
  return [
    mk('weapon', off, [{ stat: offPct, value: 20 }, { stat: 'crit_rate', value: 8 }]),
    mk('armor', 'def', [{ stat: 'hp_pct', value: 15 }]),
    mk('helmet', 'def', [{ stat: 'hp_pct', value: 10 }]),
    mk('accessory', off, [{ stat: 'crit_dmg', value: 25 }]),
  ];
}

function hero(level, stats, equipment, src) {
  return {
    id: HERO_ID, name: 'probe', side: 'party', classId: CLASS, level, stats,
    derived: E.buildDerivedStats(CLASS, level, stats, equipment),
    skills: E.gamedata.skills
      .filter((s) => s.classId === CLASS && s.unlockLevel <= level).map((s) => s.id),
    rules: E.gamedata.defaultRules?.[CLASS] ?? [],
    equipment,
    programSource: src,
  };
}

/** ภูมิภาคที่มีชั้นนี้อยู่ (ไม่นับหอคอย — หอคอยไม่ล็อก) → [regionId, depth] */
function regionsAt(floor) {
  return E.listRegions()
    .filter((r) => r.id !== 'tower' && r.depths > 0
      && floor >= r.floorBase && floor <= r.floorBase + r.depths - 1)
    .map((r) => [r.id, floor - r.floorBase + 1]);
}

/** อัตราผ่านของโปรแกรมนี้ ที่ชั้นนี้ เมื่อถูกล็อกไว้ที่เลเวล syncLevel */
function passRate(floor, syncLevel, src) {
  const places = regionsAt(floor);
  if (places.length === 0) return null;
  const stats = E.syncStats(CLASS, FARMED_LEVEL, farmedStats(FARMED_LEVEL), syncLevel);
  const gear = E.syncEquipment(towerGear(), floor);
  let wins = 0, n = 0;
  for (const [regionId, depth] of places) {
    for (let s = 0; s < SEEDS; s++) {
      const seed = (floor * 7919 + s * 104729 + syncLevel * 31) >>> 0;
      const entry = E.enterRegion(regionId, depth, 1, seed);
      const rng = E.mulberry32(E.hashSeed(seed, entry.floor * 977, 1, 0xba771e));
      const r = E.simulateWaves([hero(syncLevel, stats, gear, src)], entry.waves,
        { floor: entry.floor, seed, rng });
      n++; if (r.victory) wins++;
    }
  }
  return wins / n;
}

const pct = (x) => (x === null ? '  - ' : `${String(Math.round(x * 100)).padStart(3)}%`);
const current = E.gamedata.balance.levelSync;
const chosen = [];
console.log(`[${CLASS}${process.env.CHECK === '1' ? ' · ตรวจตารางปัจจุบัน' : ''}] syncprobe · ${SEEDS} seed ต่อโซน · ผู้เล่นฟาร์มหอคอยจบ (lv${FARMED_LEVEL} ของชั้น 10 +15) → ถูกล็อก`);
console.log('ชั้น | เลเวลล็อก → คนคิดเป็น / คนบรรทัดเดียว (ผ่าน%)');
for (let floor = 1; floor <= current.length; floor++) {
  if (regionsAt(floor).length === 0) { chosen.push(current[floor - 1]); console.log(`${String(floor).padStart(3)}  | ไม่มีภูมิภาค — คงค่าเดิม ${current[floor - 1]}`); continue; }
  const row = [];
  let pick = null;
  const fixed = process.env.CHECK === '1';
  for (let L = fixed ? current[floor - 1] : Math.max(1, floor); L <= FARMED_LEVEL; L++) {
    const smart = passRate(floor, L, SMART_BY_CLASS[CLASS]);
    const lazy = passRate(floor, L, NAIVE);
    row.push(`L${L}:${pct(smart)}/${pct(lazy)}`);
    if (fixed) { pick = { L, smart, lazy }; break; }
    if (smart >= SMART_MIN) { pick = { L, smart, lazy }; break; }
  }
  const verdict = !pick ? 'ไม่มีเลเวลไหนที่คนคิดเป็นผ่าน ≥80% — ต้องดูโซนนี้ใหม่'
    : pick.lazy <= 0.2 ? '✅ โค้ดตัดสิน'
      : pick.lazy < pick.smart ? '⚠️ แยกได้แต่คนบรรทัดเดียวยังผ่านเยอะ'
        : '❌ ไม่มีกำแพง — โค้ดไม่ได้ช่วย';
  chosen.push(pick ? pick.L : current[floor - 1]);
  console.log(`${String(floor).padStart(3)}  | ${row.slice(-4).join('  ')}  → ${verdict}`);
}
// ตารางต้องไม่ลดลงเมื่อชั้นสูงขึ้น (เทสต์ sync.test.ts บังคับไว้) — ดันขึ้นให้เท่าค่าก่อนหน้า
for (let i = 1; i < chosen.length; i++) chosen[i] = Math.max(chosen[i], chosen[i - 1]);
console.log(`\nตารางที่เลือก levelSync = ${JSON.stringify(chosen)}`);
console.log(`ตารางปัจจุบัน  levelSync = ${JSON.stringify(current)}`);
