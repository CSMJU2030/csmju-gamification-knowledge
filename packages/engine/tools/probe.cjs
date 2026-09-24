/**
 * เครื่องมือวัดความยาก — "ผู้เล่นแบบไหน ไปได้ถึงชั้นไหน ที่เลเวลเท่าไร"
 * PM เป็นเจ้าของไฟล์นี้ · รันด้วย `npm run probe -w engine` (ต้อง build engine ก่อน)
 *
 * ทำไมต้องมี: คำถามที่สำคัญที่สุดของเกมนี้คือ "เกมบังคับให้คิดจริงไหม"
 * ซึ่งตอบด้วยความรู้สึกไม่ได้ ต้องตอบด้วยตัวเลข — วิธีตอบคือเทียบผู้เล่นที่
 * ไม่คิดเลย (attack อย่างเดียว) กับผู้เล่นที่เขียนเงื่อนไข แล้วดูว่าช่องว่างเปิดที่ชั้นไหน
 *
 * ผลรอบแรก (18 ก.ย. 2026 ก่อนแก้อะไร) พิสูจน์ข้อสังเกตของเจ้าของโปรเจกต์ว่า
 * ชั้น 1-3 ไม่ต้องคิดอะไรเลยก็ผ่าน ซึ่งคือช่วงที่ผู้เล่นตัดสินใจว่าเกมน่าสนใจไหม
 *
 * ใช้เป็นตัวเทียบ "ก่อน/หลัง" ทุกครั้งที่แตะ balance — ห้ามแก้ balance โดยไม่รันตัวนี้
 */
const { gamedata, buildDerivedStats, runBattle, FORMULAS } = require('../dist/src/index.js');

/** จำนวน seed ต่อหนึ่งจุดวัด — มากขึ้น = นิ่งขึ้นแต่ช้าลง */
const SEEDS = 20;
/** ถือว่า "ผ่านชั้นนั้นได้จริง" เมื่อชนะไม่ต่ำกว่าสัดส่วนนี้ */
const WIN_THRESHOLD = 0.9;
const MAX_LEVEL_PROBED = 40;

/**
 * ผู้เล่นสมมติแต่ละแบบ
 * alloc = สัดส่วนการแจกแต้ม (จำลองว่าผู้เล่นคนนั้นอัพอะไร)
 * ระบบแจกแต้มด้วยมือกำลังจะถูกแทนด้วยค่าความชำนาญ — ตอนนั้น alloc จะกลายเป็น
 * "ผลลัพธ์ที่คาดว่าจะได้จากการเล่นแบบนี้" แทนที่จะเป็นสิ่งที่ผู้เล่นเลือกเอง
 */
const PLAYERS = {
  warrior: [
    {
      key: 'ไม่คิดเลย',
      note: 'ตี attack อย่างเดียว อัพ STR ล้วน — ผู้เล่นที่ไม่เคยเปิดหน้า BloxCode',
      alloc: { str: 1 },
      source: 'def turn():\n    attack(weakest(enemies))\n',
    },
    {
      key: 'คิดนิดหน่อย',
      note: 'มีเงื่อนไขเดียว: เลือดน้อยแล้วตั้งการ์ด',
      alloc: { str: 0.7, vit: 0.3 },
      source:
        'def turn():\n'
        + '    if me.hp_pct < 30:\n'
        + '        defend()\n'
        + '    else:\n'
        + '        attack(weakest(enemies))\n',
    },
    {
      key: 'คิดเต็มที่',
      note: 'ใช้สกิลตามสถานการณ์ + เลือกเป้าหมายเป็น',
      alloc: { str: 0.6, vit: 0.4 },
      source:
        'def turn():\n'
        + '    if me.hp_pct < 35:\n'
        + '        defend()\n'
        + '    elif count(enemies) >= 3:\n'
        + '        cast("whirlwind", enemies)\n'
        + '    else:\n'
        + '        cast("power_strike", deadliest(enemies))\n',
    },
  ],
  mage: [
    {
      key: 'ไม่คิดเลย',
      note: 'ตี attack อย่างเดียว อัพ STR ล้วน',
      alloc: { str: 1 },
      source: 'def turn():\n    attack(weakest(enemies))\n',
    },
    {
      key: 'คิดนิดหน่อย',
      note: 'ร่ายลูกไฟอย่างเดียว ไม่มีเงื่อนไข',
      alloc: { int: 1 },
      source: 'def turn():\n    cast("firebolt", weakest(enemies))\n',
    },
    {
      key: 'คิดเต็มที่',
      note: 'ฮีลตัวเอง + AoE เมื่อศัตรูเยอะ',
      alloc: { int: 0.8, vit: 0.2 },
      source:
        'def turn():\n'
        + '    if me.hp_pct < 40:\n'
        + '        cast("heal", me)\n'
        + '    elif count(enemies) >= 3:\n'
        + '        cast("blizzard", enemies)\n'
        + '    else:\n'
        + '        cast("firebolt", weakest(enemies))\n',
    },
  ],
  guardian: [
    {
      key: 'ไม่คิดเลย',
      note: 'ตี attack อย่างเดียว อัพ STR ล้วน',
      alloc: { str: 1 },
      source: 'def turn():\n    attack(weakest(enemies))\n',
    },
    {
      key: 'คิดเต็มที่',
      note: 'ยั่วยุ + เกราะ + ตีเมื่อปลอดภัย',
      alloc: { vit: 0.7, str: 0.3 },
      source:
        'def turn():\n'
        + '    if me.hp_pct < 45:\n'
        + '        cast("barrier", me)\n'
        + '    elif count(enemies) >= 2:\n'
        + '        cast("taunt", deadliest(enemies))\n'
        + '    else:\n'
        + '        attack(weakest(enemies))\n',
    },
  ],
};

function makeHero(classId, level, alloc, source) {
  const stats = { ...gamedata.classes[classId].baseStats };
  const points = (level - 1) * FORMULAS.statPointsPerLevel;
  for (const [k, weight] of Object.entries(alloc)) {
    stats[k] += Math.round(points * weight);
  }
  const skills = gamedata.skills
    .filter((s) => s.classId === classId && s.unlockLevel <= level)
    .map((s) => s.id);
  return {
    id: 'hero',
    name: 'Hero',
    side: 'party',
    classId,
    level,
    stats,
    derived: buildDerivedStats(classId, level, stats, []),
    skills,
    rules: gamedata.defaultRules[classId],
    programSource: source,
  };
}

function winRate(classId, level, player, floor) {
  let wins = 0;
  for (let i = 0; i < SEEDS; i++) {
    // seed คงที่ต่อ (ชั้น, ลำดับ) เพื่อให้รันซ้ำได้ผลเดิมเป๊ะ
    const seed = 1_000_000 + floor * 1009 + i * 7919;
    if (runBattle([makeHero(classId, level, player.alloc, player.source)], floor, seed).victory) {
      wins += 1;
    }
  }
  return wins / SEEDS;
}

/** เลเวลต่ำสุดที่ผ่านชั้นนั้นได้ตามเกณฑ์ — null = ไม่ผ่านเลยแม้เลเวลสูงสุดที่ลอง */
function minLevelToClear(classId, player, floor) {
  for (let lv = 1; lv <= MAX_LEVEL_PROBED; lv++) {
    if (winRate(classId, lv, player, floor) >= WIN_THRESHOLD) return lv;
  }
  return null;
}

function pad(s, n) {
  const str = String(s);
  return str.length >= n ? str : ' '.repeat(n - str.length) + str;
}

function main() {
  const classes = process.argv[2] ? [process.argv[2]] : Object.keys(PLAYERS);
  console.log(`เกณฑ์: ชนะ >= ${WIN_THRESHOLD * 100}% จาก ${SEEDS} seed · ตัวเลข = เลเวลต่ำสุดที่ผ่าน\n`);

  for (const classId of classes) {
    const players = PLAYERS[classId];
    console.log(`===== ${classId} =====`);
    for (const p of players) console.log(`  ${p.key}: ${p.note}`);
    console.log('');
    console.log(`ชั้น | ${players.map((p) => pad(p.key, 12)).join(' | ')}`);
    console.log('-'.repeat(5 + players.length * 15));
    for (let floor = 1; floor <= 10; floor++) {
      const cells = players.map((p) => pad(minLevelToClear(classId, p, floor) ?? 'ไม่ผ่าน', 12));
      console.log(`${pad(floor, 4)} | ${cells.join(' | ')}`);
    }

    // ตัวเลขที่ต้องจับตาที่สุด: ผู้เล่นที่ไม่คิดเลยไปได้ถึงชั้นไหน
    const naive = players.find((p) => p.key === 'ไม่คิดเลย');
    let reach = 0;
    for (let floor = 1; floor <= 10; floor++) {
      if (minLevelToClear(classId, naive, floor) !== null) reach = floor;
      else break;
    }
    console.log(`\n  >> ไม่คิดเลยไปได้ถึงชั้น ${reach} (ยิ่งต่ำยิ่งดี — เป้าหมายคือ 1)\n`);
  }
}

main();
