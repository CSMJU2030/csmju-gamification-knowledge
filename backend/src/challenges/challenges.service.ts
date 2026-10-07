/**
 * โจทย์ BloxCode ที่ผู้สอนสร้าง (D4 · docs/design-csmju-migration.md) และมอนของโจทย์ (docs/design-challenge-monsters.md)
 *
 * ownership ตรวจกับข้อมูลจริงในชั้นนี้เสมอ: `:own` = challenge.core_user_id === token.sub
 * มอนของโจทย์ใช้สิทธิ์ชุดเดียวกับโจทย์ — แก้มอน = แก้โจทย์ · ดูผลของผู้เล่น = เจ้าของโจทย์ หรือผู้มีสิทธิ์แก้ทุกโจทย์
 */
import { Injectable } from '@nestjs/common';
import { challengeMonsterIssues, challengeMonsterSkills, parse, type ChallengeMonsterSpec } from '@tower/engine';
import type { AuthUser } from '../auth/auth.types';
import { Permission } from '../auth/permissions';
import { forbidden, notFound, validationError } from '../common/api-error';
import { Page } from '../common/envelope';
import type { PageQueryDto, SearchPageQueryDto } from '../common/pagination.dto';
import type { Challenge, ChallengeMonster } from '../generated/prisma/client';
import { TRIVIAL_PROGRAM } from '../game/game-rules';
import { regionById } from '../game/world';
import { formatLangError } from '../programs/programs.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChallengeAttemptSummaryDto, ChallengeDto, ChallengeMonsterDto, ChallengeMonsterInputDto, ChallengeMyResultDto,
  CreateChallengeDto, UpdateChallengeDto,
} from './challenge.dto';

type ChallengeWithMonsters = Challenge & { monsters: ChallengeMonster[] };

const normalizeSource = (s: string) => s.replace(/\r\n?/g, '\n');

/** แถวของตาราง → รูปที่ engine ใช้ (ผ่านการตรวจตอนบันทึกแล้ว) */
export const monsterSpecOf = (m: ChallengeMonster): ChallengeMonsterSpec => ({
  name: m.name,
  archetypeId: m.archetypeId,
  level: m.level,
  hpMult: m.hpMult,
  dmgMult: m.dmgMult,
  skills: m.skills ?? [],
  programSource: m.programSource,
});

const monsterDto = (m: ChallengeMonster): ChallengeMonsterDto => ({
  position: m.position,
  name: m.name,
  archetypeId: m.archetypeId,
  level: m.level,
  hpMult: m.hpMult,
  dmgMult: m.dmgMult,
  skills: challengeMonsterSkills({ archetypeId: m.archetypeId, skills: m.skills ?? [] }),
  programSource: m.programSource,
});

const toDto = (c: ChallengeWithMonsters): ChallengeDto => ({
  id: c.id,
  coreUserId: c.coreUserId,
  title: c.title,
  description: c.description,
  starterSource: c.starterSource,
  regionId: c.regionId,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  monsters: [...c.monsters].sort((a, b) => a.position - b.position).map(monsterDto),
});

/** ค่าที่ผู้สอนส่ง → spec ที่ engine ตรวจได้ (ค่าเริ่มต้นของตัวคูณ = 1 · โปรแกรมว่าง = ไม่มีโปรแกรม) */
const specOfInput = (m: ChallengeMonsterInputDto): ChallengeMonsterSpec => ({
  name: m.name,
  archetypeId: m.archetypeId,
  level: m.level,
  hpMult: m.hpMult ?? 1,
  dmgMult: m.dmgMult ?? 1,
  skills: m.skills ?? [],
  programSource: typeof m.programSource === 'string' && m.programSource.trim() !== '' ? normalizeSource(m.programSource) : null,
});

function checkContent(body: UpdateChallengeDto): ChallengeMonsterSpec[] | undefined {
  const problems: string[] = [];
  if (typeof body.regionId === 'string' && !regionById(body.regionId)) {
    problems.push(`regionId: ไม่พบภูมิภาค "${body.regionId}"`);
  }
  if (body.starterSource !== undefined) {
    const parsed = parse(normalizeSource(body.starterSource));
    if (!parsed.program) problems.push(...parsed.errors.map((e) => `starterSource: ${formatLangError(e)}`));
  }
  const specs = body.monsters?.map(specOfInput);
  if (specs) problems.push(...challengeMonsterIssues(specs).map((i) => `${i.field}: ${i.messageTh}`));
  if (problems.length > 0) throw validationError(problems);
  return specs;
}

const monsterRows = (challengeId: string, specs: ChallengeMonsterSpec[]) =>
  specs.map((m, i) => ({
    challengeId,
    position: i + 1,
    name: m.name.trim(),
    archetypeId: m.archetypeId,
    level: m.level,
    hpMult: m.hpMult,
    dmgMult: m.dmgMult,
    skills: m.skills,
    programSource: m.programSource ?? null,
  }));

const withMonsters = { monsters: { orderBy: { position: 'asc' as const } } };

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  /** q ค้นในชื่อและคำอธิบายของโจทย์ */
  async list(query: SearchPageQueryDto): Promise<Page<ChallengeDto>> {
    // Prisma ส่ง contains เป็น ILIKE โดยไม่ escape — % และ _ ของผู้ใช้ต้องเป็นตัวอักษรธรรมดา (ไม่งั้น % ได้ทุกแถว)
    const needle = query.q?.replace(/[\\%_]/g, (c) => `\\${c}`);
    const where = needle
      ? {
          OR: [
            { title: { contains: needle, mode: 'insensitive' as const } },
            { description: { contains: needle, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.challenge.findMany({
        where,
        include: withMonsters,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.challenge.count({ where }),
    ]);
    return Page.of(rows.map(toDto), total, query.page, query.limit);
  }

  async find(id: string): Promise<ChallengeWithMonsters> {
    const row = await this.prisma.challenge.findUnique({ where: { id }, include: withMonsters });
    if (!row) throw notFound('ไม่พบโจทย์นี้');
    return row;
  }

  /** ผลของผู้เรียกกับมอนของโจทย์นี้ · null = ยังไม่มีตัวละคร */
  private async myResult(challengeId: string, coreUserId: string): Promise<ChallengeMyResultDto | null> {
    const character = await this.prisma.character.findUnique({ where: { coreUserId }, select: { id: true } });
    if (!character) return null;
    const where = { challengeId, characterId: character.id };
    const [attempts, firstWin] = await Promise.all([
      this.prisma.challengeAttempt.count({ where }),
      this.prisma.challengeAttempt.findFirst({ where: { ...where, isVictory: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { attempts, cleared: firstWin !== null, firstClearedAt: firstWin?.createdAt.toISOString() ?? null };
  }

  async get(user: AuthUser, id: string): Promise<ChallengeDto> {
    const row = await this.find(id);
    return { ...toDto(row), myResult: await this.myResult(id, user.coreUserId) };
  }

  async create(user: AuthUser, body: CreateChallengeDto): Promise<ChallengeDto> {
    const specs = checkContent(body) ?? [];
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.challenge.create({
        data: {
          coreUserId: user.coreUserId,
          title: body.title,
          description: body.description ?? '',
          starterSource: body.starterSource !== undefined ? normalizeSource(body.starterSource) : TRIVIAL_PROGRAM,
          regionId: body.regionId ?? null,
        },
      });
      if (specs.length > 0) await tx.challengeMonster.createMany({ data: monsterRows(created.id, specs) });
      return tx.challenge.findUniqueOrThrow({ where: { id: created.id }, include: withMonsters });
    });
    return toDto(row);
  }

  /** แก้/ลบได้ถ้ามีสิทธิ์ :any หรือเป็นเจ้าของ (:own) — ไม่ใช่ทั้งสอง → 403 */
  private assertCanModify(user: AuthUser, row: Challenge, any: Permission, own: Permission): void {
    if (user.permissions.has(any)) return;
    if (user.permissions.has(own) && row.coreUserId === user.coreUserId) return;
    throw forbidden('แก้ไขได้เฉพาะโจทย์ที่ตัวเองสร้าง');
  }

  async update(user: AuthUser, id: string, body: UpdateChallengeDto): Promise<ChallengeDto> {
    const row = await this.find(id);
    this.assertCanModify(user, row, Permission.CHALLENGE_UPDATE_ANY, Permission.CHALLENGE_UPDATE_OWN);
    const specs = checkContent(body);
    const updated = await this.prisma.$transaction(async (tx) => {
      // ล็อกแถวโจทย์ก่อน — คำขอแก้พร้อมกัน (สองแท็บ · กดบันทึกซ้ำ) ต่อคิวกัน แทนการชนกันตอนลบแล้วใส่มอนชุดใหม่
      // (เดิมคำขอที่ชนได้ 409 "ข้อมูลซ้ำกับที่มีอยู่แล้ว" ที่ผู้สอนอ่านไม่เข้าใจ) · ถูกลบไปก่อน → 404
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM challenges WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw notFound('ไม่พบโจทย์นี้');
      await tx.challenge.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.starterSource !== undefined ? { starterSource: normalizeSource(body.starterSource) } : {}),
          ...(body.regionId !== undefined ? { regionId: body.regionId } : {}),
        },
      });
      // ส่ง monsters มา = แทนทั้งชุด · ไม่ส่ง = คงเดิม (ผลการสู้ที่ผ่านมายังอยู่)
      if (specs) {
        await tx.challengeMonster.deleteMany({ where: { challengeId: id } });
        if (specs.length > 0) await tx.challengeMonster.createMany({ data: monsterRows(id, specs) });
      }
      return tx.challenge.findUniqueOrThrow({ where: { id }, include: withMonsters });
    });
    return toDto(updated);
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string; deleted: true }> {
    const row = await this.find(id);
    this.assertCanModify(user, row, Permission.CHALLENGE_DELETE_ANY, Permission.CHALLENGE_DELETE_OWN);
    // ลบพร้อมกันหลายคำขอ: ตัวแรกได้ 200 ที่เหลือได้ 404 (ไม่ใช่ 500) · มอนและผลการสู้ถูกลบตาม (ON DELETE CASCADE)
    const { count } = await this.prisma.challenge.deleteMany({ where: { id } });
    if (count === 0) throw notFound('ไม่พบโจทย์นี้');
    return { id, deleted: true };
  }

  /**
   * ผลของผู้เล่นรายคน (ข้อ M5) — เจ้าของโจทย์ที่มีสิทธิ์แก้โจทย์ตัวเอง หรือผู้มีสิทธิ์แก้ทุกโจทย์ · คนอื่น 403
   * เรียงคนที่ชนะแล้วก่อน (ชนะก่อนอยู่บน) แล้วตามด้วยคนที่ยังไม่ชนะ (สู้ล่าสุดอยู่บน)
   * จำนวนคนต่อโจทย์คือจำนวนนักศึกษาในรายวิชา จึงสรุปทั้งหมดก่อนแล้วตัดหน้า
   */
  async attempts(user: AuthUser, id: string, query: PageQueryDto): Promise<Page<ChallengeAttemptSummaryDto>> {
    const row = await this.find(id);
    const canRead =
      user.permissions.has(Permission.CHALLENGE_UPDATE_ANY) ||
      (user.permissions.has(Permission.CHALLENGE_UPDATE_OWN) && row.coreUserId === user.coreUserId);
    if (!canRead) throw forbidden('ดูผลของผู้เล่นได้เฉพาะเจ้าของโจทย์');

    const [all, wins] = await Promise.all([
      this.prisma.challengeAttempt.groupBy({
        by: ['characterId'],
        where: { challengeId: id },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.challengeAttempt.groupBy({
        by: ['characterId'],
        where: { challengeId: id, isVictory: true },
        _min: { createdAt: true },
      }),
    ]);
    const firstWin = new Map(wins.map((w) => [w.characterId, w._min.createdAt]));
    const names = new Map(
      (await this.prisma.character.findMany({
        where: { id: { in: all.map((a) => a.characterId) } },
        select: { id: true, displayName: true },
      })).map((c) => [c.id, c.displayName]),
    );
    const rows = all
      .map((a) => ({
        characterId: a.characterId,
        displayName: names.get(a.characterId) ?? '',
        attempts: a._count._all,
        cleared: firstWin.has(a.characterId),
        firstClearedAt: firstWin.get(a.characterId)?.toISOString() ?? null,
        lastAttemptAt: (a._max.createdAt ?? new Date(0)).toISOString(),
      }))
      .sort((a, b) => {
        if (a.cleared !== b.cleared) return a.cleared ? -1 : 1;
        if (a.cleared) return a.firstClearedAt!.localeCompare(b.firstClearedAt!) || a.characterId.localeCompare(b.characterId);
        return b.lastAttemptAt.localeCompare(a.lastAttemptAt) || a.characterId.localeCompare(b.characterId);
      });
    return Page.of(rows.slice(query.skip, query.skip + query.limit), rows.length, query.page, query.limit);
  }
}
