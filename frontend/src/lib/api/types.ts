/**
 * ชื่อสั้นของ type ที่ generate จาก backend/openapi.json (tech-stack.md: ห้ามเขียน type ของ response เอง)
 * ไฟล์นี้ตั้งชื่อเล่นอย่างเดียว ไม่ประกาศรูปร่างเอง — แก้ endpoint แล้วรัน `pnpm generate:api`
 */
import type { components } from './schema';

type S = components['schemas'];

export type ErrorCode = S['ErrorDetailDto']['code'];
export type PageMeta = S['PageMetaDto'];

export type Me = S['MeDto'];
export type Character = S['CharacterDto'];
export type Item = S['ItemDto'];
export type EquipSlot = Item['slot'];
export type Rarity = Item['rarity'];
export type SkillSummary = S['SkillSummaryDto'];
export type Program = S['ProgramDto'];
export type SalvagedItem = S['SalvagedItemDto'];
export type ItemUpgrade = S['ItemUpgradeDto'];
export type Region = S['RegionDto'];
export type RegionRun = S['RegionRunDto'];
export type BattleOutcome = S['BattleOutcomeDto'];
export type RegionProof = S['RegionProofDto'];
export type RegionProofInfo = S['RegionProofInfoDto'];
export type RegionSkill = S['RegionSkillDto'];
export type ClassTrial = S['ClassTrialDto'];
export type BattleResult = S['BattleResultDto'];
export type CombatEvent = S['CombatEventDto'];
export type DuelBlock = S['DuelBlockDto'];
export type BattleSummary = S['BattleSummaryDto'];
export type TowerProgress = S['TowerProgressDto'];
export type GameData = S['GameDataDto'];
export type SkillDef = S['SkillDefDto'];
export type Challenge = S['ChallengeDto'];
export type CreateChallenge = S['CreateChallengeDto'];
export type UpdateChallenge = S['UpdateChallengeDto'];
export type ChallengeMonster = S['ChallengeMonsterDto'];
export type ChallengeMonsterInput = S['ChallengeMonsterInputDto'];
export type ChallengeMyResult = S['ChallengeMyResultDto'];
export type ChallengeAttemptSummary = S['ChallengeAttemptSummaryDto'];
export type ChallengeTrial = S['ChallengeTrialDto'];
export type Deleted = S['DeletedDto'];
