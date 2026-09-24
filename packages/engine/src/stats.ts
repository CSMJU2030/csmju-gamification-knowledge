/**
 * Derived-stat computation (FORMULAS + equipment main stats + affixes).
 */
import { FORMULAS } from './types';
import type { BaseStats, ClassId, DerivedStats, ItemInstance } from './types';
import { gamedata } from './data';

/** Base critDmg multiplier before crit_dmg affixes. */
export const BASE_CRIT_DMG = 1.5;

/** Derived stats straight from FORMULAS — used for both heroes and monsters. */
export function derivedFromBase(stats: BaseStats, level: number): DerivedStats {
  return {
    maxHp: FORMULAS.maxHp(stats.vit, level),
    maxMp: FORMULAS.maxMp(stats.int, level),
    atk: FORMULAS.atk(stats.str),
    matk: FORMULAS.matk(stats.int),
    def: FORMULAS.def(stats.vit),
    mdef: FORMULAS.mdef(stats.int, stats.vit),
    speed: FORMULAS.speed(stats.agi),
    critRate: FORMULAS.critRate(stats.luk),
    critDmg: BASE_CRIT_DMG,
    evasion: FORMULAS.evasion(stats.agi),
    dropBonus: FORMULAS.dropBonus(stats.luk),
  };
}

/**
 * Main-stat value of an item instance:
 * round((baseValue + perFloor * droppedFloor) * (1 + 0.08 * upgradeLevel))
 */
export function itemMainStat(
  item: ItemInstance,
): { stat: 'atk' | 'matk' | 'def' | 'mdef'; value: number } | null {
  const base = gamedata.baseItems.find((b) => b.baseId === item.baseId);
  if (!base) return null;
  const raw = base.baseValue + base.perFloor * item.droppedFloor;
  const value = Math.round(raw * (1 + FORMULAS.upgradeBonusPerLevel * item.upgradeLevel));
  return { stat: base.stat, value };
}

/**
 * Combat bonuses that are NOT part of DerivedStats (contract type is frozen):
 * lifesteal heals the attacker by that fraction of physical/magic damage dealt;
 * expBonus multiplies expGained. Both are fractions (affix value 5 → 0.05).
 */
export function equipmentCombatBonuses(
  equipment: ItemInstance[],
): { lifesteal: number; expBonus: number } {
  let lifesteal = 0;
  let expBonus = 0;
  for (const item of equipment) {
    for (const affix of item.affixes) {
      if (affix.stat === 'lifesteal') lifesteal += affix.value / 100;
      else if (affix.stat === 'exp_bonus') expBonus += affix.value / 100;
    }
  }
  return { lifesteal, expBonus };
}

export function buildDerivedStats(
  _classId: ClassId,
  level: number,
  stats: BaseStats,
  equipment: ItemInstance[],
): DerivedStats {
  const d = derivedFromBase(stats, level);

  // 1) Equipment main stats add flat to the matching derived stat.
  for (const item of equipment) {
    const main = itemMainStat(item);
    if (main) d[main.stat] += main.value;
  }

  // 2) Sum affixes per stat, then apply.
  const sum: Partial<Record<string, number>> = {};
  for (const item of equipment) {
    for (const affix of item.affixes) {
      sum[affix.stat] = (sum[affix.stat] ?? 0) + affix.value;
    }
  }
  const s = (k: string) => sum[k] ?? 0;

  // Percent multipliers on the relevant derived stat (after main stats).
  d.atk = Math.round(d.atk * (1 + s('atk_pct') / 100));
  d.matk = Math.round(d.matk * (1 + s('matk_pct') / 100));
  d.maxHp = Math.round(d.maxHp * (1 + s('hp_pct') / 100));
  d.def = Math.round(d.def * (1 + s('def_pct') / 100));

  // Flat adds.
  d.speed += s('speed_flat');
  d.maxMp += s('mp_flat');

  // Fractional adds (affix value in percent points).
  d.critRate += s('crit_rate') / 100;
  d.critDmg += s('crit_dmg') / 100;
  d.evasion += s('evasion') / 100;
  d.dropBonus += s('drop_bonus') / 100;

  // lifesteal / exp_bonus intentionally NOT in DerivedStats — see equipmentCombatBonuses().
  return d;
}
