/**
 * โปรแกรม BloxCode ของผู้เล่น — ก่อนบันทึกต้องผ่านสองชั้นเสมอ (ย้ายมาจาก server/src/routes/program.ts)
 *   1. parse     → SyntaxError / IndentationError
 *   2. validate  → LockedFeatureError / NameError / TypeError / ValueError
 *      (ตามไวยากรณ์ที่ปลดล็อกจาก highest_floor + สกิลที่ปลดล็อกตามเลเวล)
 *
 * ข้อผิดพลาดของภาษาตอบเป็น 400 VALIDATION_ERROR — `details` เป็นข้อความรูปแบบตายตัว
 *   "<บรรทัด>:<คอลัมน์>:<ชื่อข้อผิดพลาด>:<ข้อความไทย>"
 * เพื่อให้ client แยกกลับเป็นเลขบรรทัดไปไฮไลต์ในเอดิเตอร์ได้ ขณะที่ยังเป็น array ของ string ตามสัญญา
 */
import { Injectable } from '@nestjs/common';
import {
  MAX_PROGRAM_LINES, parse, unlockedFeatures, validate,
  type ClassId, type LangError, type ValidateOptions,
} from '@tower/engine';
import { validationError } from '../common/api-error';
import type { Character } from '../generated/prisma/client';
import { requireCharacter } from '../game/character.repository';
import { MAX_PROGRAM_CHARS, unlockedSkills } from '../game/game-rules';
import { PrismaService } from '../prisma/prisma.service';
import type { ProgramDto } from './program.dto';

export function langOptions(row: Character): ValidateOptions {
  return {
    features: unlockedFeatures(row.highestFloor),
    availableSkills: unlockedSkills(row.classId as ClassId, row.level).map((s) => s.id),
  };
}

export const formatLangError = (e: LangError): string => `${e.line}:${e.col}:${e.name}:${e.messageTh}`;

const programError = (errors: LangError[]) => validationError(errors.map(formatLangError), 'โปรแกรมมีข้อผิดพลาด');

const syntaxError = (messageTh: string, line: number, col = 1): LangError =>
  ({ name: 'SyntaxError', messageTh, line, col }) as LangError;

/** จำนวนบรรทัดที่นับจริง (ตัดบรรทัดว่างท้ายไฟล์ออก เหมือน parser) */
function codeLineCount(source: string): number {
  const lines = source.split('\n');
  let count = lines.length;
  while (count > 0 && lines[count - 1].trim() === '') count--;
  return count;
}

/** ตรวจโปรแกรมครบทุกชั้น — คืนข้อผิดพลาด (ว่าง = ผ่าน) */
export function checkProgram(source: string, opts: ValidateOptions): LangError[] {
  if (source.length > MAX_PROGRAM_CHARS) {
    return [syntaxError(`โปรแกรมยาวเกินไป (${source.length} ตัวอักษร) — ตัดให้สั้นลงก่อน`, 1)];
  }
  const lines = codeLineCount(source);
  if (lines > MAX_PROGRAM_LINES) {
    return [
      syntaxError(
        `โปรแกรมยาว ${lines} บรรทัด เกินขีดจำกัด ${MAX_PROGRAM_LINES} บรรทัด — ตัดให้สั้นลงก่อน`,
        MAX_PROGRAM_LINES + 1,
      ),
    ];
  }
  const parsed = parse(source);
  if (!parsed.program) return parsed.errors;
  return validate(parsed.program, opts).errors;
}

@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  private view(row: Character): ProgramDto {
    const opts = langOptions(row);
    return {
      source: row.programSource,
      unlockedFeatures: [...opts.features],
      availableSkills: unlockedSkills(row.classId as ClassId, row.level).map((s) => ({
        id: s.id,
        nameTh: s.nameTh,
        mpCost: s.mpCost,
        aoe: s.aoe,
      })),
      highestFloorCleared: row.highestFloor,
    };
  }

  async current(coreUserId: string): Promise<ProgramDto> {
    return this.view(await requireCharacter(this.prisma, coreUserId));
  }

  async update(coreUserId: string, source: string): Promise<ProgramDto> {
    const row = await requireCharacter(this.prisma, coreUserId);
    // เอดิเตอร์บางตัวส่ง CRLF มา — เก็บเป็น LF อย่างเดียวเพื่อให้เลขบรรทัดตรงกันทุกฝั่ง
    const normalized = source.replace(/\r\n?/g, '\n');
    const errors = checkProgram(normalized, langOptions(row));
    if (errors.length > 0) throw programError(errors);
    const saved = await this.prisma.character.update({
      where: { id: row.id },
      data: { programSource: normalized },
    });
    return this.view(saved);
  }
}
