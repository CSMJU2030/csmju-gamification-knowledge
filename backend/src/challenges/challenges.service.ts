/**
 * โจทย์ BloxCode ที่ผู้สอนสร้าง — **ร่างตามข้อเสนอ D4** (docs/design-csmju-migration.md)
 * ขอบเขตจริง (ให้คะแนนไหม · ผูกกับห้องเรียนไหม) รอ PL ตัดสิน · ตอนนี้มีแค่ CRUD + ตรวจโปรแกรมตั้งต้น
 *
 * ownership ตรวจกับข้อมูลจริงในชั้นนี้เสมอ: `:own` = challenge.core_user_id === token.sub
 */
import { Injectable } from '@nestjs/common';
import { parse } from '@tower/engine';
import type { AuthUser } from '../auth/auth.types';
import { Permission } from '../auth/permissions';
import { forbidden, notFound, validationError } from '../common/api-error';
import { Page } from '../common/envelope';
import type { PageQueryDto } from '../common/pagination.dto';
import type { Challenge } from '../generated/prisma/client';
import { TRIVIAL_PROGRAM } from '../game/game-rules';
import { regionById } from '../game/world';
import { formatLangError } from '../programs/programs.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ChallengeDto, CreateChallengeDto, UpdateChallengeDto } from './challenge.dto';

const toDto = (c: Challenge): ChallengeDto => ({
  id: c.id,
  coreUserId: c.coreUserId,
  title: c.title,
  description: c.description,
  starterSource: c.starterSource,
  regionId: c.regionId,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

function checkContent(body: UpdateChallengeDto): void {
  const problems: string[] = [];
  if (body.regionId !== undefined && !regionById(body.regionId)) problems.push(`regionId: ไม่พบภูมิภาค "${body.regionId}"`);
  if (body.starterSource !== undefined) {
    const parsed = parse(body.starterSource.replace(/\r\n?/g, '\n'));
    if (!parsed.program) problems.push(...parsed.errors.map((e) => `starterSource: ${formatLangError(e)}`));
  }
  if (problems.length > 0) throw validationError(problems);
}

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQueryDto): Promise<Page<ChallengeDto>> {
    const [rows, total] = await Promise.all([
      this.prisma.challenge.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.challenge.count(),
    ]);
    return Page.of(rows.map(toDto), total, query.page, query.limit);
  }

  private async find(id: string): Promise<Challenge> {
    const row = await this.prisma.challenge.findUnique({ where: { id } });
    if (!row) throw notFound('ไม่พบโจทย์นี้');
    return row;
  }

  async get(id: string): Promise<ChallengeDto> {
    return toDto(await this.find(id));
  }

  async create(user: AuthUser, body: CreateChallengeDto): Promise<ChallengeDto> {
    checkContent(body);
    const row = await this.prisma.challenge.create({
      data: {
        coreUserId: user.coreUserId,
        title: body.title.trim(),
        description: body.description ?? '',
        starterSource: body.starterSource?.replace(/\r\n?/g, '\n') ?? TRIVIAL_PROGRAM,
        regionId: body.regionId ?? null,
      },
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
    checkContent(body);
    const updated = await this.prisma.challenge.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.starterSource !== undefined ? { starterSource: body.starterSource.replace(/\r\n?/g, '\n') } : {}),
        ...(body.regionId !== undefined ? { regionId: body.regionId } : {}),
      },
    });
    return toDto(updated);
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string; deleted: true }> {
    const row = await this.find(id);
    this.assertCanModify(user, row, Permission.CHALLENGE_DELETE_ANY, Permission.CHALLENGE_DELETE_OWN);
    await this.prisma.challenge.delete({ where: { id } });
    return { id, deleted: true };
  }
}
