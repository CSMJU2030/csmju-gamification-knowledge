/**
 * Engine entry — engine-dev เป็นเจ้าของไฟล์นี้และไฟล์อื่นใน src/ (ยกเว้น types.ts)
 * signature ต้องตรงกับ EngineApi ใน types.ts เสมอ
 */
export * from './types';
export { runBattle, runDuel, simulateWaves, DUEL_MAX_ROUNDS } from './battle';
export {
  listRegions, getRegion, battleRegions, floorForRegion, regionFloorRange,
  rollElite, enterRegion, buildRegionWaves, isBattleRegion,
} from './regions';
export type { RegionEntry } from './regions';
export { buildDerivedStats, equipmentCombatBonuses, itemMainStat } from './stats';
export { syncLoadout, syncLevelForFloor, syncStats, syncEquipment } from './sync';
export type { SyncedLoadout } from './sync';
/**
 * สตรีมสุ่มกลาง — เปิดให้ผู้เรียกนอก engine ใช้ได้ (รอบ 2W)
 *
 * ไม่ได้เปิดเพราะ "เผื่อมีคนอยากใช้" แต่เพราะ `simulateWaves` บังคับให้ผู้เรียกสร้าง rng เอง
 * (ดู SimOptions) ถ้าไม่ปล่อยสองตัวนี้ออกไป เซิร์ฟเวอร์จะไม่มีทางสร้างสตรีมเดียวกับ
 * `runBattle` ได้เลยนอกจากก๊อปสูตรไปไว้อีกที่ — ซึ่งเป็นบั๊กชนิดเดียวกับ duelSim.ts
 * กับ rollElite ที่เพิ่งลบทิ้งไปทั้งคู่เพราะมันเพี้ยนจากต้นฉบับเงียบ ๆ
 */
export { mulberry32, hashSeed } from './rng';
export type { Rng } from './rng';
export { buildWaves, MONSTER_STAT_GROWTH_PER_LEVEL } from './waves';
export { rollItem } from './drops';
export { gamedata } from './data';
export { proficiencyFromBattle, allocatePoints } from './proficiency';
export {
  regionProof, proofRequirements, regionSkillFor, skillsFor, archetypeOfId, PROOF_REGIONS,
} from './proofs';
export type { RegionProof, ProofCheck } from './proofs';

// ---- มอนของโจทย์ (docs/design-challenge-monsters.md) ----
export {
  CHALLENGE_MONSTER_LIMITS, CHALLENGE_MONSTER_SKILLS,
  challengeArchetype, challengeMonsterSkills, checkMonsterProgram, challengeMonsterIssues, challengeReward,
  challengeArchetypes, challengeSkillInfo, checkProgramWithSkills, CHALLENGE_TRIAL_CLASSES,
} from './challenge';
export { challengeMonsterId, buildChallengeWave, runChallengeBattle, trialHeroStats } from './challenge-battle';
export type {
  ChallengeMonsterSpec, ChallengeMonsterIssue, ChallengeArchetypeInfo, ChallengeSkillInfo, ChallengeTrialClassId,
} from './challenge';

// ---- BloxCode (เฟส 2B-1) ----
export {
  parse, validate, runTurn, toPython, fromRules, tokenize,
  resolveSkillName, preferredSkillName, KNOWN_SKILL_NAMES,
  describeSkill, describeSkillById, BASIC_ATTACK_TEXT_TH, DEFEND_TEXT_TH, MP_RULES_TEXT_TH,
  monsterProgramFor, isElifChain, SELF_TARGET,
  unlockedFeatures, BUFF_NAMES, DEBUFF_NAMES, STATUS_NAMES,
  GLOBALS, ME_ATTRS, UNIT_ATTRS, PURE_FUNCS, ACTION_FUNCS,
  FEATURE_UNLOCK, FEATURE_LABEL_TH,
  FALLBACK_ACTION, NODE_BUDGET_PER_TURN, MAX_PROGRAM_LINES, MAX_EXPR_DEPTH, MAX_AST_DEPTH,
} from './lang/index';
export type {
  Program, Stmt, Expr, Pos, CmpOp, BinOp,
  LangError, ErrorName, Feature,
  ParseResult, ValidateOptions, ValidateResult, TurnDecision,
  RuntimeUnit, TurnContext, SkillInfo, FromRulesOptions, SkillText,
} from './lang/index';
