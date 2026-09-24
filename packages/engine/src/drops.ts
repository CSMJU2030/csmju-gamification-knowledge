/**
 * Loot: rarity roll (floor-shifted weights), affix rolls, item instancing.
 */
import { AFFIX_SLOTS } from './types';
import type { Affix, ItemInstance, Rarity } from './types';
import { gamedata } from './data';
import { hashSeed, mulberry32, pick, rngInt, type Rng } from './rng';

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Base equip drop chance for normal monsters (boss drops are guaranteed). */
export const NORMAL_EQUIP_DROP_CHANCE = 0.12;

/**
 * Every 3 floors, move 4 points of weight from common:
 * +2 rare, +1.5 epic, +0.5 legendary.
 */
export function rarityWeightsForFloor(floor: number): Record<Rarity, number> {
  const w: Record<Rarity, number> = { ...gamedata.rarityWeights };
  const steps = Math.floor(floor / 3);
  const moved = Math.min(w.common, 4 * steps);
  w.common -= moved;
  w.rare += moved * (2 / 4);
  w.epic += moved * (1.5 / 4);
  w.legendary += moved * (0.5 / 4);
  return w;
}

function rollRarity(rng: Rng, floor: number): Rarity {
  const w = rarityWeightsForFloor(floor);
  const total = RARITY_ORDER.reduce((acc, r) => acc + w[r], 0);
  let roll = rng() * total;
  for (const r of RARITY_ORDER) {
    roll -= w[r];
    if (roll < 0) return r;
  }
  return 'legendary';
}

/**
 * Deterministically roll a full item using an existing RNG stream.
 * `idSuffix` must be unique per roll (counter + seed-derived string).
 */
export function rollItemWithRng(floor: number, rng: Rng, idSuffix: string): ItemInstance {
  const base = pick(rng, gamedata.baseItems);
  const rarity = rollRarity(rng, floor);
  const [lo, hi] = AFFIX_SLOTS[rarity];
  const affixCount = rngInt(rng, lo, hi);

  const poolCopy = [...gamedata.affixPool];
  const affixes: Affix[] = [];
  for (let i = 0; i < affixCount && poolCopy.length > 0; i++) {
    const idx = rngInt(rng, 0, poolCopy.length - 1);
    const [entry] = poolCopy.splice(idx, 1); // no duplicate stats
    affixes.push({ stat: entry.stat, value: rngInt(rng, entry.min, entry.max) });
  }

  return {
    id: `itm_${idSuffix}`,
    baseId: base.baseId,
    slot: base.slot,
    rarity,
    upgradeLevel: 0,
    droppedFloor: floor,
    affixes,
  };
}

/**
 * Public API: one drop attempt for a normal monster kill.
 * Chance = 12% * (1 + dropBonus); returns null when the roll fails.
 * Deterministic for the same (floor, seed, dropBonus).
 */
export function rollItem(floor: number, seed: number, dropBonus: number): ItemInstance | null {
  const rng = mulberry32(hashSeed(seed, floor * 31337));
  if (rng() >= NORMAL_EQUIP_DROP_CHANCE * (1 + dropBonus)) return null;
  return rollItemWithRng(floor, rng, `${(seed >>> 0).toString(36)}_f${floor}_0`);
}
