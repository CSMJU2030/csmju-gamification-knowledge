/*
 * ⚠️  คำเตือนของ PM (22 ก.ย. 2026) — อ่านก่อนเชื่อตัวเลขจากเครื่องมือนี้
 *
 * เครื่องมือนี้จำลองคนขี้เกียจที่ "แพ้แล้วถอยไปฟาร์ม +2 เลเวล แล้วกลับมาท้าใหม่"
 * ตอนเขียนมันตรงกับพฤติกรรมที่ผู้เล่นทดสอบรอบ 2T ทำจริง — แต่หลังรอบ 2F
 * **กลยุทธ์นั้นไม่ใช่ทางที่ดีที่สุดของคนขี้เกียจอีกแล้ว**
 *
 * วัดกับเซิร์ฟเวอร์จริง 6 รอบ (docs/measurements/fix-after-2f.txt):
 *   · ถอยไปฟาร์มแบบเครื่องมือนี้    → จบหอคอย 49-70 การรบ
 *   · ไม่ถอยเลย ท้าชั้นหน้าซ้ำ ๆ     → จบหอคอย 34-38 การรบ · ชนะแค่ 10 แพ้ 24-28
 * เครื่องมือนี้บอกว่าคนขี้เกียจจบเกมได้ 1 ใน 8 · ของจริงจบได้ 6 ใน 6
 *
 * สาเหตุ: รอบ 2F ลงโทษการ "ถอย" (farmFalloff) แต่การแพ้ที่ชั้นหน้าจ่าย 20-60% ของชนะ
 * และไม่โดน falloff เพราะมอนเลเวลเท่าตัวเรา → การแพ้ซ้ำ ๆ กลายเป็นวิธีฟาร์มที่ดีที่สุด
 * เครื่องมือนี้ไม่เคยลองกลยุทธ์นั้น ตัวเลขของมันจึงดีเกินจริง
 *
 * **ห้ามใช้ผลของเครื่องมือนี้ตัดสินว่าคนขี้เกียจตันหรือไม่** จนกว่าจะเพิ่ม persona
 * "ไม่ถอยเลย" เข้าไป — และบทเรียนที่ใหญ่กว่านั้นคือ: แบบจำลองวัดได้แค่กลยุทธ์ที่เราคิดออก
 * ผู้เล่นจริงไม่ได้ถูกจำกัดด้วยสิ่งที่เราคิดออก
 */
/**
 * เครื่องมือวัดวงจร "แพ้ → ถอยไปฟาร์มชั้นเก่า → กลับมาชนะ" (รอบ 2F §3.1)
 *
 * รันด้วย `npm run lazyprobe -w engine` (ต้อง `npm run build -w engine` ก่อน)
 *   node tools/lazyprobe.cjs              ค่าปัจจุบันใน gamedata — รายงานทุก persona
 *   node tools/lazyprobe.cjs lazy --log   ดูบันทึกการรบทีละครั้งของชีวิตแรก
 *   node tools/lazyprobe.cjs sweep        กวาดค่าคงที่ของ §3.1 แล้วเทียบผลกัน
 *   node tools/lazyprobe.cjs nogear       ทดลองปิดของดรอป (ตอบว่า "อะไรพาเขาผ่าน")
 *
 * ทำไมต้องมีทั้งที่มี probe.cjs กับ tune.cjs อยู่แล้ว:
 * สองตัวนั้นถามว่า "เลเวลเท่าไรถึงจะผ่านชั้นนี้" ซึ่งเป็นคำถามของสแนปช็อต —
 * มันสมมติเลเวลขึ้นมาแล้ววัดการรบครั้งเดียว จึงมองไม่เห็นสิ่งที่รอบ 2T วัดได้จริง:
 * **ผู้เล่นได้เลเวลกับของพวกนั้นมาจากไหน** ถ้าการแพ้จ่าย EXP เกือบเท่าการชนะ และชั้นเก่า
 * จ่ายเท่าเดิมตลอดกาล เลเวลก็เป็นของฟรีที่รอเวลา ไม่ใช่ผลของการเขียนโค้ดให้ดีขึ้น
 * (docs/measurements/playtest-2t.txt ข้อ [1] — คันโยกที่ใหญ่ที่สุดของรอบนี้)
 *
 * ตัวนี้จึงจำลอง *ทั้งชีวิตของผู้เล่นหนึ่งคน* ตั้งแต่เลเวล 1 จนตันหรือจบเกม:
 * รบ → ได้ EXP/ของ → เลเวลอัพ → ใส่ของที่ดีกว่า → เลือกชั้นถัดไปตามนิสัยของ persona
 * แล้วตอบคำถามเดียวของเกณฑ์ F1: **ตันที่ชั้นไหน ที่เลเวลเท่าไร ใช้การรบกี่ครั้ง**
 *
 * ความซื่อสัตย์ของเครื่องมือ (อ่านก่อนเชื่อตัวเลข):
 *  · ลูป exp/เลเวล/แต้ม สะท้อน server/src/progression.ts `persistBattle` ตรง ๆ
 *    ถ้าไฟล์นั้นเปลี่ยนกฎการแจกแต้ม ที่นี่ต้องเปลี่ยนตาม (engine เรียก server ไม่ได้)
 *  · จำลอง "ใส่ของที่ดรอป" แต่ **ไม่จำลองการตีบวก/ร้านค้า** ผู้เล่นจริงจึงแรงกว่านี้เล็กน้อย
 *    = ตัวเลขที่ได้เป็นขอบล่างของความสามารถ ไม่ใช่ขอบบน
 *  · ทุกอย่าง deterministic ต่อ seed ของชีวิต — รันซ้ำได้ผลเดิมเป๊ะ
 */
const fs = require('fs');
const path = require('path');

const DIST_DATA = path.join(__dirname, '../dist/data/gamedata.json');
const ORIGINAL = fs.readFileSync(DIST_DATA, 'utf8');

/** โหลด engine ใหม่หลังแก้ไฟล์ข้อมูล — วิธีเดียวกับ tune.cjs เป๊ะ */
function loadEngine() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/engine/dist/')) delete require.cache[key];
  }
  return require('../dist/src/index.js');
}

function withBalance(patch, fn) {
  if (!patch) return fn(loadEngine());
  const data = JSON.parse(ORIGINAL);
  Object.assign(data.balance, patch);
  fs.writeFileSync(DIST_DATA, JSON.stringify(data, null, 2));
  try {
    return fn(loadEngine());
  } finally {
    fs.writeFileSync(DIST_DATA, ORIGINAL);
  }
}

/** id ของ hero ต้องตรงกับที่ persistBattle ใช้ ไม่งั้น proficiencyFromBattle อ่านงานไม่เจอ */
const HERO_ID = 'p1';

// ---------------------------------------------------------------- นิสัยผู้เล่น

/**
 * กติกาของ persona "ไม่คิด" มาจากบันทึกจริงใน docs/playtest/lazy.md:
 *   "เมื่อแพ้ คำตอบคือเลเวลเพิ่ม ไม่ใช่โค้ดที่ดีขึ้น" — แพ้แล้วถอยไปฟาร์มชั้นที่ผ่านแล้ว
 *   จนได้อีกสองเลเวล แล้วกลับมาท้าใหม่ (ที่วัดได้คือ "+2 เลเวล สามครั้ง" แล้วจบเกม)
 */
const FARM_LEVELS = 2;
/**
 * เงื่อนไขยอมแพ้ มีสองข้อ อะไรมาก่อนถือข้อนั้น:
 *  1. ฟาร์มไป 10 เลเวลที่ชั้นเดิมแล้วยังไม่ผ่าน — เงื่อนไขเดียวกับที่ผู้เล่นทดสอบรอบ 2T
 *     ตั้งไว้กับตัวเอง (และรอบนั้นไม่เคยถูกแตะเลยสักครั้ง)
 *  2. รบที่ชั้นเดิม 25 ครั้งแล้วยังไม่ผ่าน — ต้องมีข้อนี้เพราะพอ §3.1 ตัดรางวัลของชั้นต่ำ
 *     "10 เลเวล" อาจกินเวลาเป็นร้อยการรบ ซึ่งไม่มีเด็กคนไหนเล่นถึง การวัดที่ซื่อสัตย์
 *     ต้องวัด "เวลาที่ลงไป" ด้วย ไม่ใช่วัดแต่เลเวล (25 การรบ = การรบ 10 เวฟยี่สิบห้ารอบ
 *     ที่ชั้นเดิม ราวหนึ่งชั่วโมงกับการทำสิ่งเดิมซ้ำ)
 */
const GIVE_UP_LEVELS = 10;
const GIVE_UP_BATTLES_PER_FLOOR = 25;
/** กันลูปไม่รู้จบเมื่อ balance เพี้ยนจนฟาร์มไม่ขึ้นเลเวลเลย */
const MAX_BATTLES = 600;

const NAIVE = 'def turn():\n    attack(weakest(enemies))\n';

/**
 * persona = ลำดับเวอร์ชันของโปรแกรม เรียงจากง่ายไปยาก
 * ผู้เล่นจะใช้เวอร์ชันที่ "ดีที่สุดเท่าที่ปลดล็อกแล้วและมีสกิลครบ" เสมอ
 * (ชั้นที่ต้องผ่านคำนวณจาก validate จริง ไม่ได้กรอกมือ — ถ้าบันไดปลดล็อกเสีย
 *  เช่น arith ปลดชั้น 13 ที่เกมไปไม่ถึง เวอร์ชันนั้นจะไม่มีวันถูกใช้ และตัวเลขจะฟ้องเอง)
 */
const PERSONAS = {
  /** คนที่เขียนบรรทัดเดียวแล้วไม่แก้อีกเลย — ตัวเอกของเกณฑ์ F1 */
  lazy: {
    label: 'ไม่คิด (บรรทัดเดียว ไม่เคยแก้)',
    classId: 'warrior',
    versions: [{ src: NAIVE, minLevel: 1 }],
  },
  /**
   * คนที่เขียนเงื่อนไขเดียวแล้วพอ — ตัวชี้ขาดว่า "กำแพง" ที่สร้างขึ้นเป็นทางลาดหรือหน้าผา
   * ถ้าคนกลุ่มนี้ตันที่เดียวกับคนไม่คิด แปลว่าเราไม่ได้ให้รางวัลการคิด เราแค่ทำเกมให้ยากขึ้น
   * ซึ่งกฎเหล็ก §2 ห้ามไว้ · เงื่อนไขเดียวที่เขาเขียนคือสิ่งที่ปลดล็อกให้ตั้งแต่ผ่านชั้น 1
   */
  medium: {
    label: 'คิดนิดเดียว (if เดียว เลือกเป้าเป็น)',
    classId: 'warrior',
    versions: [
      { src: NAIVE, minLevel: 1 },
      {
        src: 'def turn():\n'
          + '    if me.hp_pct < 25:\n'
          + '        defend()\n'
          + '    else:\n'
          + '        attack(deadliest(enemies))\n',
        minLevel: 1,
      },
    ],
  },
  /**
   * คนที่แก้โค้ดตามที่เกมเปิดให้ — ใช้วัดเกณฑ์ F2 ("คิดเป็นต้องไปได้ไกลกว่าชัดเจน")
   * โปรแกรมชุดนี้คือชุดเดียวกับ SMART ใน tune.cjs เพื่อให้สองเครื่องมือพูดถึงคนคนเดียวกัน
   */
  smart: {
    label: 'คิดเป็น (แก้โค้ดตามที่ปลดล็อก)',
    classId: 'warrior',
    versions: [
      { src: NAIVE, minLevel: 1 },
      {
        src: 'def turn():\n'
          + '    if me.hp_pct < 25:\n'
          + '        defend()\n'
          + '    else:\n'
          + '        attack(deadliest(enemies))\n',
        minLevel: 1,
      },
      {
        // ใช้สกิลที่เกมแจกให้ตั้งแต่เลเวล 1 แทนการตีเปล่า — ต้องมี "ข้อความ" (ปลดชั้น 2)
        src: 'def turn():\n'
          + '    if me.hp_pct < 25:\n'
          + '        defend()\n'
          + '    else:\n'
          + '        cast("power_strike", deadliest(enemies))\n',
        minLevel: 1,
      },
      {
        src: 'def turn():\n'
          + '    if me.hp_pct < 25:\n'
          + '        defend()\n'
          + '    elif count(enemies) >= 3:\n'
          + '        cast("whirlwind", enemies)\n'
          + '    else:\n'
          + '        cast("power_strike", deadliest(enemies))\n',
        minLevel: 5, // ดาบหมุนวนปลดที่เลเวล 5 — ร่ายก่อนหน้านั้นคือเสียเทิร์นเปล่า
      },
    ],
  },
};

// ---------------------------------------------------------------- ตัวละคร

/**
 * ชีวิตหนึ่งชีวิต — ทุกอย่างที่เกมจำเกี่ยวกับผู้เล่นคนนี้
 * (E = engine ที่โหลดมาแล้ว ส่งเข้ามาเพื่อให้โหมด sweep สลับ balance ได้)
 */
function newCharacter(E, seed) {
  return {
    E,
    classId: 'novice', // เลือกอาชีพได้หลังผ่านชั้น 1 เหมือนของจริง (CLASS_CHOICE_FLOOR)
    level: 1,
    exp: 0,
    stats: { ...E.gamedata.classes.novice.baseStats },
    carry: { str: 0, int: 0, vit: 0, agi: 0, luk: 0 },
    equipment: {}, // slot -> ItemInstance
    gold: 0,
    materials: 0,
    highestFloor: 0,
    battles: 0,
    farmBattles: 0,
    losses: 0,
    expTotal: 0,
    rng: E.mulberry32(E.hashSeed(seed, 0x1a2f, 7)),
  };
}

const equipmentList = (ch) => Object.values(ch.equipment);

function combatantOf(ch, src) {
  const equipment = equipmentList(ch);
  return {
    id: HERO_ID,
    name: 'lazy',
    side: 'party',
    classId: ch.classId,
    level: ch.level,
    stats: ch.stats,
    derived: ch.E.buildDerivedStats(ch.classId, ch.level, ch.stats, equipment),
    skills: ch.E.gamedata.skills
      .filter((s) => s.classId === ch.classId && s.unlockLevel <= ch.level).map((s) => s.id),
    rules: ch.E.gamedata.defaultRules[ch.classId] ?? [],
    equipment,
    programSource: src,
  };
}

/**
 * "ของชิ้นนี้ดีกว่าของที่ใส่อยู่ไหม" — วัดด้วยพลังรวมที่ได้จริง ไม่ใช่เทียบเลขหน้าไอเทม
 * (ผู้เล่นจริงเทียบด้วยสายตา แต่การให้เครื่องมือเทียบ "ของที่ทำให้ตัวเองแรงขึ้นจริง"
 *  เป็นขอบบนของสายตาคน = ยังเป็นการประเมินที่ใจดีกับผู้เล่นไม่คิด ซึ่งเป็นฝั่งที่ควรใจดี)
 */
function power(ch, equipment) {
  const d = ch.E.buildDerivedStats(ch.classId, ch.level, ch.stats, equipment);
  const offense = ch.classId === 'mage' ? d.matk : d.atk;
  return offense * 2 + d.maxHp * 0.25 + d.def * 1.5;
}

function takeLoot(ch, items) {
  for (const item of items) {
    const current = ch.equipment[item.slot];
    const withNew = equipmentList(ch).filter((e) => e.slot !== item.slot).concat([item]);
    if (!current || power(ch, withNew) > power(ch, equipmentList(ch))) {
      ch.equipment[item.slot] = item;
    }
  }
}

// ---------------------------------------------------------------- การรบหนึ่งครั้ง

/**
 * รบหนึ่งครั้งแล้วเขียนผลลงตัวละคร — สะท้อน persistBattle() ของเซิร์ฟเวอร์
 * (แจกแต้มทีละเลเวล · งานสะสมรีเซ็ตเมื่อเลเวลอัพ · ของที่ดรอปเข้ากระเป๋าทันที)
 */
function fight(ch, floor, src, opts) {
  const E = ch.E;
  const seed = Math.floor(ch.rng() * 0x100000000);
  const hero = combatantOf(ch, src);
  const result = E.runBattle([hero], floor, seed);

  const battleWork = E.proficiencyFromBattle(result, HERO_ID, hero.derived.maxHp);
  const work = {
    str: ch.carry.str + battleWork.str,
    int: ch.carry.int + battleWork.int,
    vit: ch.carry.vit + battleWork.vit,
    agi: ch.carry.agi + battleWork.agi,
    luk: ch.carry.luk + battleWork.luk,
  };

  ch.exp += result.expGained;
  ch.expTotal += result.expGained;
  let leveledUp = false;
  while (ch.exp >= E.FORMULAS.expToNext(ch.level)) {
    ch.exp -= E.FORMULAS.expToNext(ch.level);
    ch.level += 1;
    leveledUp = true;
    const gained = E.allocatePoints(work, E.FORMULAS.statPointsPerLevel, ch.classId, ch.level);
    for (const k of Object.keys(ch.stats)) ch.stats[k] += gained[k];
  }
  ch.carry = leveledUp ? { str: 0, int: 0, vit: 0, agi: 0, luk: 0 } : work;

  ch.gold += result.drops.gold;
  ch.materials += result.drops.materials;
  if (!opts.noGear) takeLoot(ch, result.drops.items);
  ch.battles += 1;
  if (!result.victory) ch.losses += 1;
  if (result.victory && floor > ch.highestFloor) ch.highestFloor = floor;

  return { victory: result.victory, wavesCleared: result.wavesCleared, exp: result.expGained };
}

// ---------------------------------------------------------------- ชีวิตหนึ่งชีวิต

/** ชั้นต่ำสุดที่โปรแกรมนี้ผ่าน validate ได้ (null = ไปไม่ถึงในเกมนี้) */
function minFloorFor(E, src, skills, maxFloor) {
  const p = E.parse(src);
  if (!p.program || p.errors.length > 0) throw new Error(`โปรแกรมของ persona ผิดไวยากรณ์: ${src}`);
  for (let f = 0; f <= maxFloor; f++) {
    const errs = E.validate(p.program, { features: E.unlockedFeatures(f), availableSkills: skills })
      .errors.filter((e) => e.name === 'LockedFeatureError');
    if (errs.length === 0) return f;
  }
  return null;
}

/**
 * เล่นจนตันหรือจบเกม แล้วคืนว่า "ตันที่ชั้นไหน เลเวลเท่าไร"
 *
 * ลูปคือวงจรที่ playtest-2t วัดได้ตรง ๆ: ท้าชั้นถัดไป → แพ้ → ถอยไปฟาร์มชั้นที่ผ่านแล้ว
 * จนได้ +FARM_LEVELS เลเวล → กลับมาท้าใหม่ · ไม่มีการแก้โค้ดนอกจากที่ persona อนุญาต
 */
function career(E, persona, seed, opts = {}) {
  const maxFloor = Math.max(...E.battleRegions().map((r) => E.regionFloorRange(r)[1]));
  const ch = newCharacter(E, seed);
  const allSkills = E.gamedata.skills
    .filter((s) => s.classId === persona.classId).map((s) => s.id);
  const versions = persona.versions
    .map((v) => ({ ...v, minFloor: minFloorFor(E, v.src, allSkills, maxFloor) }));

  /** เวอร์ชันที่ดีที่สุดที่ใช้ได้ตอนนี้ (ปลดล็อกแล้ว + มีสกิลครบ) */
  const programNow = () => {
    let best = versions[0];
    for (const v of versions) {
      if (v.minFloor !== null && v.minFloor <= ch.highestFloor && v.minLevel <= ch.level) best = v;
    }
    return best.src;
  };

  const log = [];
  let target = 1;
  let levelAtFirstTry = ch.level;
  let battlesAtTarget = 0;

  const done = (outcome) => ({ outcome, floor: target, level: ch.level, ch, log, maxFloor });

  while (ch.battles < MAX_BATTLES) {
    const r = fight(ch, target, programNow(), opts);
    battlesAtTarget += 1;
    log.push(`  #${ch.battles} ชั้น ${target} ${r.victory ? 'ชนะ' : `แพ้ (${r.wavesCleared}/10)`}`
      + ` exp ${r.exp} → lv ${ch.level}`);

    if (r.victory) {
      // ผ่านชั้น 1 แล้วเลือกอาชีพ เหมือนของจริง (ผู้เล่นไม่คิดเลือกตามคำแนะนำหน้าเลือกอาชีพ)
      if (ch.classId === 'novice' && ch.highestFloor >= 1) ch.classId = persona.classId;
      if (target >= maxFloor) return done('จบเกม');
      target += 1;
      levelAtFirstTry = ch.level;
      battlesAtTarget = 0;
      continue;
    }

    // แพ้ → ถอยไปฟาร์มชั้นที่ผ่านแล้ว (ชั้น 1 ไม่มีที่ให้ถอย ก็ตีซ้ำที่เดิม)
    const farmFloor = Math.max(1, Math.min(ch.highestFloor, target - 1));
    const levelBefore = ch.level;
    while (ch.level < levelBefore + FARM_LEVELS && ch.battles < MAX_BATTLES) {
      if (ch.level - levelAtFirstTry >= GIVE_UP_LEVELS) break;
      if (battlesAtTarget >= GIVE_UP_BATTLES_PER_FLOOR) break;
      const f = fight(ch, farmFloor, programNow(), opts);
      ch.farmBattles += 1;
      battlesAtTarget += 1;
      log.push(`  #${ch.battles} ฟาร์มชั้น ${farmFloor} ${f.victory ? 'ชนะ' : 'แพ้'}`
        + ` exp ${f.exp} → lv ${ch.level}`);
    }
    if (ch.level - levelAtFirstTry >= GIVE_UP_LEVELS) return done('ตัน(เลเวล)');
    if (battlesAtTarget >= GIVE_UP_BATTLES_PER_FLOOR) return done('ตัน(เวลา)');
  }
  return done('หมดโควตา');
}

// ---------------------------------------------------------------- รายงาน

const pad = (s, n) => {
  const str = String(s);
  return str.length >= n ? str : ' '.repeat(n - str.length) + str;
};
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** ผลรวมของ persona หนึ่งตัวที่ balance ชุดหนึ่ง */
function runPersona(E, persona, careers, opts) {
  const rows = [];
  for (let i = 0; i < careers; i++) {
    const seed = 4242 + i * 101;
    const r = career(E, persona, seed, opts);
    rows.push({ seed, ...r });
  }
  const maxFloor = rows[0].maxFloor;
  return {
    rows,
    maxFloor,
    // "ตันที่ชั้นไหน" ของคนที่จบเกม นับเป็น maxFloor+1 เพื่อให้มัธยฐานเปรียบเทียบกันได้
    stall: median(rows.map((r) => (r.outcome === 'จบเกม' ? maxFloor + 1 : r.floor))),
    level: median(rows.map((r) => r.level)),
    battles: median(rows.map((r) => r.ch.battles)),
    finished: rows.filter((r) => r.outcome === 'จบเกม').length,
  };
}

function report(E, names, careers, opts) {
  for (const name of names) {
    const persona = PERSONAS[name];
    const s = runPersona(E, persona, careers, opts);
    console.log(`===== ${name}: ${persona.label} =====`);
    console.log('seed |    ผล     | ชั้นที่ตัน | เลเวล | การรบ | ฟาร์ม | แพ้ | EXP รวม');
    for (const r of s.rows) {
      console.log(`${pad(r.seed, 4)} | ${pad(r.outcome, 9)} | ${pad(r.floor, 9)} | ${pad(r.level, 5)}`
        + ` | ${pad(r.ch.battles, 5)} | ${pad(r.ch.farmBattles, 5)} | ${pad(r.ch.losses, 3)}`
        + ` | ${pad(r.ch.expTotal, 7)}`);
      if (opts.log && r === s.rows[0]) for (const line of r.log) console.log(line);
    }
    console.log(s.stall > s.maxFloor
      ? `\n  >> ${name} จบเกมได้ ${s.finished}/${careers} ชีวิต · เลเวล ${s.level} · ${s.battles} การรบ (มัธยฐาน)\n`
      : `\n  >> ${name} ตันที่ชั้น ${s.stall} ที่เลเวล ${s.level} · ${s.battles} การรบ (มัธยฐาน)`
        + ` · จบเกมได้ ${s.finished}/${careers} ชีวิต\n`);
  }
}

// ---------------------------------------------------------------- main

/** ชุดค่าที่กวาดในโหมด sweep — ตอบว่า "ทำไมต้องเป็นเลขนี้ ไม่ใช่เลขอื่น" */
const SWEEP = [
  { label: 'ก่อนรอบ 2F (ไม่มีตัวคูณเลย)', patch: { farmFalloffFreeGap: 99, farmFalloffGraceLevel: 0, defeatRewardMin: 1, defeatRewardMax: 1 } },
  { label: 'ตัดเฉพาะตอนแพ้', patch: { farmFalloffFreeGap: 99, farmFalloffGraceLevel: 0 } },
  { label: 'ตัดเฉพาะชั้นต่ำ', patch: { defeatRewardMin: 1, defeatRewardMax: 1 } },
  { label: 'ไม่มี grace · 4 · 0.7', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 4, farmFalloffPerLevel: 0.7 } },
  { label: 'ไม่มี grace · 2 · 0.8', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.8 } },
  { label: 'ไม่มี grace · 2 · 0.7', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.7 } },
  { label: 'ไม่มี grace · 2 · 0.6', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.6 } },
  { label: 'ไม่มี grace · 2 · 0.5', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.5 } },
  { label: 'ไม่มี grace · 1 · 0.8', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 1, farmFalloffPerLevel: 0.8 } },
  { label: 'ไม่มี grace · 1 · 0.7', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 1, farmFalloffPerLevel: 0.7 } },
  { label: 'ไม่มี grace · 1 · 0.6', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 1, farmFalloffPerLevel: 0.6 } },
  { label: 'ไม่มี grace · 0 · 0.7', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 0, farmFalloffPerLevel: 0.7 } },
  { label: 'ไม่มี grace · 0 · 0.6', patch: { farmFalloffGraceLevel: 0, farmFalloffFreeGap: 0, farmFalloffPerLevel: 0.6 } },
  { label: 'grace 8 · 2 · 0.5', patch: { farmFalloffGraceLevel: 8, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.5 } },
  { label: 'grace 10 · 2 · 0.5', patch: { farmFalloffGraceLevel: 10, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.5 } },
  { label: 'grace 10 · 2 · 0.6', patch: { farmFalloffGraceLevel: 10, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.6 } },
  { label: 'grace 12 · 2 · 0.5', patch: { farmFalloffGraceLevel: 12, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.5 } },
  { label: 'grace 12 · 2 · 0.6', patch: { farmFalloffGraceLevel: 12, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.6 } },
  { label: 'grace 14 · 2 · 0.5', patch: { farmFalloffGraceLevel: 14, farmFalloffFreeGap: 2, farmFalloffPerLevel: 0.5 } },
  { label: 'grace 12 · 1 · 0.5', patch: { farmFalloffGraceLevel: 12, farmFalloffFreeGap: 1, farmFalloffPerLevel: 0.5 } },
  { label: 'grace 12 · 3 · 0.5', patch: { farmFalloffGraceLevel: 12, farmFalloffFreeGap: 3, farmFalloffPerLevel: 0.5 } },
  { label: 'ค่าปัจจุบันใน gamedata', patch: null },
];

function main() {
  const args = process.argv.slice(2);
  const opts = { log: args.includes('--log'), noGear: args.includes('nogear') };
  const careers = Number(process.env.CAREERS ?? 8);
  const mode = args.find((a) => !a.startsWith('--'));

  if (mode === 'sweep') {
    console.log(`กวาดค่าของ §3.1 · ${careers} ชีวิตต่อช่อง · ตัวเลข = ชั้นที่ตัน / เลเวล / จำนวนการรบ`);
    console.log('(ชั้นที่ตัน "จบ" = ไปถึงชั้นสุดท้ายได้ = ยังแก้ปัญหาของรอบนี้ไม่ได้)\n');
    console.log(`${pad('ชุดค่า', 26)} | ${pad('ไม่คิด', 20)} | ${pad('คิดนิดเดียว', 20)}`
      + ` | ${pad('คิดเป็น', 20)}`);
    console.log('-'.repeat(94));
    for (const { label, patch } of SWEEP) {
      const cells = withBalance(patch, (E) => ['lazy', 'medium', 'smart'].map((n) => {
        const s = runPersona(E, PERSONAS[n], careers, opts);
        const where = s.stall > s.maxFloor ? 'จบ' : `ชั้น ${s.stall}`;
        return pad(`${where} / lv${s.level} / ${s.battles} รบ`, 20);
      }));
      console.log(`${pad(label, 26)} | ${cells.join(' | ')}`);
    }
    return;
  }

  const names = mode && PERSONAS[mode] ? [mode] : Object.keys(PERSONAS);
  withBalance(null, (E) => {
    const maxFloor = Math.max(...E.battleRegions().map((r) => E.regionFloorRange(r)[1]));
    console.log(`ชั้นสูงสุดของเกม ${maxFloor} · ${careers} ชีวิตต่อ persona`
      + ` · แพ้แล้วฟาร์ม +${FARM_LEVELS} เลเวลแล้วกลับมาท้าใหม่`
      + `\nยอมแพ้เมื่อ: ฟาร์ม ${GIVE_UP_LEVELS} เลเวลแล้วยังไม่ผ่าน`
      + ` หรือรบที่ชั้นเดิม ${GIVE_UP_BATTLES_PER_FLOOR} ครั้งแล้วยังไม่ผ่าน`
      + `${opts.noGear ? '\n** โหมด nogear: ไม่ใส่ของที่ดรอปเลย (ทดลองว่าอะไรพาผู้เล่นผ่าน) **' : ''}\n`);
    report(E, names, careers, opts);
  });
}

main();
