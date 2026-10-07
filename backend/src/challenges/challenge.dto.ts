import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CHALLENGE_MONSTER_LIMITS as L, CHALLENGE_MONSTER_SKILLS, CHALLENGE_TRIAL_CLASSES, gamedata } from '@tower/engine';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { CombatEventDto } from '../battles/battle.dto';
import { MAX_PROGRAM_CHARS } from '../game/game-rules';
import { NoNulCharacter, OptionalButNotNull } from '../common/validation';

const ARCHETYPE_IDS = gamedata.monsterArchetypes.map((a) => a.id);
const MONSTER_SKILLS: string[] = [...CHALLENGE_MONSTER_SKILLS];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * มอนของโจทย์หนึ่งตัวที่ผู้สอนส่งมา (docs/design-challenge-monsters.md ข้อ 3)
 * ขอบเขตมาจาก CHALLENGE_MONSTER_LIMITS ของ engine — service ตรวจซ้ำด้วย challengeMonsterIssues (รวมโปรแกรมของมอน)
 */
export class ChallengeMonsterInputDto {
  @ApiProperty({ example: 'สไลม์ขี้ระแวง', maxLength: L.nameMax })
  @Transform(trim)
  @IsString({ message: 'name ต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'name ห้ามว่าง' })
  @MaxLength(L.nameMax, { message: `name ยาวได้ไม่เกิน ${L.nameMax} ตัวอักษร` })
  @NoNulCharacter('name')
  name!: string;

  @ApiProperty({ enum: ARCHETYPE_IDS, example: 'slime', description: 'ต้นแบบ (ภาพ · สเตตัสพื้นฐาน · บทบาท)' })
  @IsString({ message: 'archetypeId ต้องเป็นข้อความ' })
  @IsIn(ARCHETYPE_IDS, { message: `archetypeId ต้องเป็นหนึ่งใน ${ARCHETYPE_IDS.join(', ')}` })
  archetypeId!: string;

  @ApiProperty({ minimum: L.levelMin, maximum: L.levelMax, example: 5 })
  @IsInt({ message: 'level ต้องเป็นจำนวนเต็ม' })
  @Min(L.levelMin, { message: `level ต้องไม่น้อยกว่า ${L.levelMin}` })
  @Max(L.levelMax, { message: `level ต้องไม่เกิน ${L.levelMax}` })
  level!: number;

  @ApiPropertyOptional({ minimum: L.hpMultMin, maximum: L.hpMultMax, default: 1, description: 'ตัวคูณ HP' })
  @OptionalButNotNull()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'hpMult ต้องเป็นตัวเลข' })
  @Min(L.hpMultMin, { message: `hpMult ต้องไม่น้อยกว่า ${L.hpMultMin}` })
  @Max(L.hpMultMax, { message: `hpMult ต้องไม่เกิน ${L.hpMultMax}` })
  hpMult?: number;

  @ApiPropertyOptional({ minimum: L.dmgMultMin, maximum: L.dmgMultMax, default: 1, description: 'ตัวคูณดาเมจ' })
  @OptionalButNotNull()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'dmgMult ต้องเป็นตัวเลข' })
  @Min(L.dmgMultMin, { message: `dmgMult ต้องไม่น้อยกว่า ${L.dmgMultMin}` })
  @Max(L.dmgMultMax, { message: `dmgMult ต้องไม่เกิน ${L.dmgMultMax}` })
  dmgMult?: number;

  @ApiPropertyOptional({
    type: [String], enum: MONSTER_SKILLS, maxItems: L.skillsMax, description: 'ไม่ส่งหรือว่าง = สกิลของต้นแบบ',
  })
  @OptionalButNotNull()
  @IsArray({ message: 'skills ต้องเป็น array' })
  @ArrayMaxSize(L.skillsMax, { message: `skills มีได้ไม่เกิน ${L.skillsMax} ตัว` })
  @IsIn(MONSTER_SKILLS, { each: true, message: `skills เลือกได้จาก ${MONSTER_SKILLS.join(', ')}` })
  skills?: string[];

  @ApiPropertyOptional({
    type: String, nullable: true, maxLength: MAX_PROGRAM_CHARS,
    description: 'โปรแกรม BloxCode ของมอน (ไม่บังคับ) · null/ไม่ส่ง = พฤติกรรมตามบทบาทของต้นแบบ',
  })
  @IsOptional()
  @IsString({ message: 'programSource ต้องเป็นข้อความ' })
  @MaxLength(MAX_PROGRAM_CHARS, { message: `programSource ยาวได้ไม่เกิน ${MAX_PROGRAM_CHARS} ตัวอักษร` })
  @NoNulCharacter('programSource')
  programSource?: string | null;
}

/** ช่อง monsters ของการสร้าง/แก้โจทย์ — ส่งแล้วแทนทั้งชุด · ว่าง = ลบมอนทั้งหมด */
const MonstersField = () =>
  function (target: object, key: string) {
    ApiPropertyOptional({
      type: [ChallengeMonsterInputDto], maxItems: L.maxMonsters,
      description: `มอนของโจทย์ 0–${L.maxMonsters} ตัว (เวฟเดียว) · ส่งแล้วแทนทั้งชุด`,
    })(target, key);
    OptionalButNotNull()(target, key);
    IsArray({ message: 'monsters ต้องเป็น array' })(target, key);
    ArrayMaxSize(L.maxMonsters, { message: `monsters มีได้ไม่เกิน ${L.maxMonsters} ตัว` })(target, key);
    ValidateNested({ each: true, message: 'monsters แต่ละตัวต้องเป็น object' })(target, key);
    Type(() => ChallengeMonsterInputDto)(target, key);
  };

export class CreateChallengeDto {
  @ApiProperty({ example: 'ตั้งการ์ดเมื่อถูกหมายหัว', maxLength: 120 })
  @Transform(trim)
  @IsString({ message: 'title ต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'title ห้ามว่าง' })
  @MaxLength(120, { message: 'title ยาวได้ไม่เกิน 120 ตัวอักษร' })
  @NoNulCharacter('title')
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @OptionalButNotNull()
  @IsString({ message: 'description ต้องเป็นข้อความ' })
  @MaxLength(4000, { message: 'description ยาวได้ไม่เกิน 4000 ตัวอักษร' })
  @NoNulCharacter('description')
  description?: string;

  @ApiPropertyOptional({ description: 'โปรแกรมตั้งต้นให้ผู้เล่น — ต้อง parse ผ่าน · เว้นไว้ = โปรแกรมพื้นฐาน', maxLength: MAX_PROGRAM_CHARS })
  @OptionalButNotNull()
  @IsString({ message: 'starterSource ต้องเป็นข้อความ' })
  @MaxLength(MAX_PROGRAM_CHARS, { message: `starterSource ยาวได้ไม่เกิน ${MAX_PROGRAM_CHARS} ตัวอักษร` })
  @NoNulCharacter('starterSource')
  starterSource?: string;

  @ApiPropertyOptional({ type: String, example: 'frostland', nullable: true, description: 'ภูมิภาคที่โจทย์นี้ผูกด้วย (ถ้ามี)' })
  @IsOptional()
  @IsString({ message: 'regionId ต้องเป็นข้อความ' })
  @MaxLength(64, { message: 'regionId ยาวเกินไป' })
  @NoNulCharacter('regionId')
  regionId?: string | null;

  @MonstersField()
  monsters?: ChallengeMonsterInputDto[];
}

/**
 * แก้บางช่อง — เขียนเองแทน PartialType เพราะ PartialType ใส่ @IsOptional ให้ทุกช่อง
 * ซึ่งปล่อย null ผ่าน · ที่นี่มีแค่ regionId ที่ส่ง null ได้ (= เลิกผูกกับภูมิภาค)
 */
export class UpdateChallengeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @OptionalButNotNull()
  @Transform(trim)
  @IsString({ message: 'title ต้องเป็นข้อความ' })
  @IsNotEmpty({ message: 'title ห้ามว่าง' })
  @MaxLength(120, { message: 'title ยาวได้ไม่เกิน 120 ตัวอักษร' })
  @NoNulCharacter('title')
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @OptionalButNotNull()
  @IsString({ message: 'description ต้องเป็นข้อความ' })
  @MaxLength(4000, { message: 'description ยาวได้ไม่เกิน 4000 ตัวอักษร' })
  @NoNulCharacter('description')
  description?: string;

  @ApiPropertyOptional({ maxLength: MAX_PROGRAM_CHARS })
  @OptionalButNotNull()
  @IsString({ message: 'starterSource ต้องเป็นข้อความ' })
  @MaxLength(MAX_PROGRAM_CHARS, { message: `starterSource ยาวได้ไม่เกิน ${MAX_PROGRAM_CHARS} ตัวอักษร` })
  @NoNulCharacter('starterSource')
  starterSource?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'null = เลิกผูกกับภูมิภาค' })
  @IsOptional()
  @IsString({ message: 'regionId ต้องเป็นข้อความ' })
  @MaxLength(64, { message: 'regionId ยาวเกินไป' })
  @NoNulCharacter('regionId')
  regionId?: string | null;

  @MonstersField()
  monsters?: ChallengeMonsterInputDto[];
}

/** มอนของโจทย์ที่ส่งออก — skills เป็นสกิลที่ใช้จริง (ต้นแบบเมื่อผู้สอนไม่เลือก) */
export class ChallengeMonsterDto {
  @ApiProperty({ minimum: 1, description: 'ลำดับในเวฟ' }) position!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ARCHETYPE_IDS }) archetypeId!: string;
  @ApiProperty() level!: number;
  @ApiProperty() hpMult!: number;
  @ApiProperty() dmgMult!: number;
  @ApiProperty({ type: [String] }) skills!: string[];
  @ApiProperty({ type: String, nullable: true, description: 'null = พฤติกรรมตามบทบาทของต้นแบบ' }) programSource!: string | null;
}

/** ผลของผู้เรียกกับมอนของโจทย์นี้ */
export class ChallengeMyResultDto {
  @ApiProperty({ description: 'สู้ไปแล้วกี่ครั้ง' }) attempts!: number;
  @ApiProperty({ description: 'ชนะแล้วหรือยัง' }) cleared!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) firstClearedAt!: string | null;
}

export class ChallengeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'core_user_id ของผู้สร้าง' }) coreUserId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() starterSource!: string;
  @ApiProperty({ type: String, nullable: true, description: 'ภูมิภาคที่ผูก · null = ไม่ผูก' }) regionId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [ChallengeMonsterDto], description: 'มอนของโจทย์ (ว่าง = โจทย์ไม่มีมอน)' }) monsters!: ChallengeMonsterDto[];
  @ApiPropertyOptional({
    type: ChallengeMyResultDto, nullable: true,
    description: 'มีเฉพาะ GET /challenges/:id — ผลของผู้เรียก · null = ยังไม่มีตัวละคร',
  })
  myResult?: ChallengeMyResultDto | null;
}

/** ผลของผู้เล่นหนึ่งคนกับมอนของโจทย์ — ผู้สอนเจ้าของโจทย์และผู้ดูแลเท่านั้น */
export class ChallengeAttemptSummaryDto {
  @ApiProperty({ format: 'uuid' }) characterId!: string;
  @ApiProperty({ description: 'ชื่อในเกม (รหัสนักศึกษา/บุคลากร)' }) displayName!: string;
  @ApiProperty() attempts!: number;
  @ApiProperty() cleared!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) firstClearedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) lastAttemptAt!: string;
}

const TRIAL_CLASSES: string[] = [...CHALLENGE_TRIAL_CLASSES];

/**
 * ทดลองสู้มอนของโจทย์ด้วยตัวละครตัวอย่าง (ข้อ M7) — ใช้กับมอนในฟอร์มที่ยังไม่บันทึกได้ จึงรับมอนทั้งชุดมาเอง
 */
export class CreateChallengeTrialDto {
  @ApiProperty({ type: [ChallengeMonsterInputDto], minItems: 1, maxItems: L.maxMonsters, description: 'มอนที่จะทดลอง (ยังไม่ต้องบันทึก)' })
  @IsArray({ message: 'monsters ต้องเป็น array' })
  @ArrayMinSize(1, { message: 'ใส่มอนอย่างน้อย 1 ตัวก่อนทดลองสู้' })
  @ArrayMaxSize(L.maxMonsters, { message: `monsters มีได้ไม่เกิน ${L.maxMonsters} ตัว` })
  @ValidateNested({ each: true, message: 'monsters แต่ละตัวต้องเป็น object' })
  @Type(() => ChallengeMonsterInputDto)
  monsters!: ChallengeMonsterInputDto[];

  @ApiProperty({ enum: TRIAL_CLASSES, example: 'warrior', description: 'อาชีพของตัวละครตัวอย่าง' })
  @IsIn(TRIAL_CLASSES, { message: `classId ต้องเป็นหนึ่งใน ${TRIAL_CLASSES.join(', ')}` })
  classId!: string;

  @ApiProperty({ minimum: L.levelMin, maximum: L.levelMax, example: 5, description: 'เลเวลของตัวละครตัวอย่าง' })
  @IsInt({ message: 'level ต้องเป็นจำนวนเต็ม' })
  @Min(L.levelMin, { message: `level ต้องไม่น้อยกว่า ${L.levelMin}` })
  @Max(L.levelMax, { message: `level ต้องไม่เกิน ${L.levelMax}` })
  level!: number;

  @ApiPropertyOptional({
    maxLength: MAX_PROGRAM_CHARS,
    description: 'โปรแกรมของตัวละครตัวอย่าง (เช่น โปรแกรมตั้งต้นของโจทย์) · ไม่ส่งหรือว่าง = โปรแกรมตัวอย่างของอาชีพที่เลเวลนั้น',
  })
  @OptionalButNotNull()
  @IsString({ message: 'programSource ต้องเป็นข้อความ' })
  @MaxLength(MAX_PROGRAM_CHARS, { message: `programSource ยาวได้ไม่เกิน ${MAX_PROGRAM_CHARS} ตัวอักษร` })
  @NoNulCharacter('programSource')
  programSource?: string;
}

export class ChallengeTrialResultDto {
  @ApiProperty() victory!: boolean;
  @ApiProperty() wavesCleared!: number;
  @ApiProperty({ type: [CombatEventDto] }) events!: CombatEventDto[];
}

/** ผลทดลองสู้ — ไม่บันทึกอะไร ไม่มีรางวัล */
export class ChallengeTrialDto {
  @ApiProperty({ enum: TRIAL_CLASSES }) classId!: string;
  @ApiProperty() level!: number;
  @ApiProperty() maxHp!: number;
  @ApiProperty() maxMp!: number;
  @ApiProperty({ description: 'โปรแกรมที่ตัวละครตัวอย่างใช้จริง' }) programSource!: string;
  @ApiProperty({ description: 'ชื่อของตัวละครตัวอย่างใน events (actorName) — หน้าเว็บใช้จับเทิร์นของตัวละครกับบรรทัดโค้ด' }) heroName!: string;
  @ApiProperty({ type: ChallengeTrialResultDto }) result!: ChallengeTrialResultDto;
}
