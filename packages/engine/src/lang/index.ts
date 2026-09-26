/**
 * BloxCode — จุดเข้าใช้งานเดียวของโมดูลภาษา
 * server ใช้ parse + validate ก่อนบันทึก, battle.ts ใช้ runTurn, เอดิเตอร์ใช้ toPython
 */
export * from './spec';
export { parse, isElifChain } from './parser';
export { tokenize, KEYWORDS } from './tokenizer';
export type { Token, TokType, TokenizeResult } from './tokenizer';
export { validate, BUFF_NAMES, DEBUFF_NAMES, STATUS_NAMES } from './validate';
export { runTurn, SELF_TARGET } from './evaluator';
export type { RuntimeUnit, TurnContext } from './evaluator';
export { toPython, exprToPython, stringLiteral, numberLiteral } from './printer';
export { fromRules } from './fromRules';
export type { FromRulesOptions } from './fromRules';
export {
  resolveSkillName, preferredSkillName, KNOWN_SKILL_NAMES, describeSkillById,
} from './skills';
export type { SkillInfo } from './skills';
export {
  describeSkill, BASIC_ATTACK_TEXT_TH, DEFEND_TEXT_TH, MP_RULES_TEXT_TH,
} from './skillText';
export type { SkillText } from './skillText';
export { LangErrorException, editDistance, closestName } from './errors';
export {
  monsterProgramFor, clearMonsterProgramCache, DEFAULT_MONSTER_PROGRAM_KEY,
} from './monsterAi';
