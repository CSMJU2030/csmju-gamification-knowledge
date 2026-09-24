import { Injectable } from '@nestjs/common';
import { PLAYABLE_CLASSES, gamedata, type ClassId } from '@tower/engine';
import { conflict } from '../common/api-error';
import { Prisma } from '../generated/prisma/client';
import { type CharacterView } from '../game/character.view';
import { loadCharacterView, lockCharacter, requireCharacter } from '../game/character.repository';
import { CLASS_CHOICE_FLOOR, STARTING_CLASS, TRIVIAL_PROGRAM } from '../game/game-rules';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CharactersService {
  constructor(private readonly prisma: PrismaService) {}

  async current(coreUserId: string): Promise<CharacterView> {
    const row = await requireCharacter(this.prisma, coreUserId);
    return loadCharacterView(this.prisma, row.id);
  }

  /**
   * สร้างตัวละครให้ผู้ใช้ของ token นี้ — หนึ่งคนมีได้ตัวเดียว
   *
   * แทน `POST /auth/register` เดิม: ระบบนี้ไม่มีบัญชีของตัวเองแล้ว ตัวตนมาจาก Core Hub
   * สิ่งที่เหลือให้สร้างคือ "ตัวละครในเกม" ของตัวตนนั้น
   * ได้โปรแกรมพื้นฐานตั้งแต่วินาทีแรก เพื่อให้การรบครั้งแรกขับด้วยโค้ดของผู้เล่นเสมอ
   */
  async create(coreUserId: string, displayName: string): Promise<CharacterView> {
    const base = gamedata.classes[STARTING_CLASS].baseStats;
    try {
      const row = await this.prisma.character.create({
        data: {
          coreUserId,
          displayName,
          classId: STARTING_CLASS,
          statStr: base.str,
          statInt: base.int,
          statVit: base.vit,
          statAgi: base.agi,
          statLuk: base.luk,
          programSource: TRIVIAL_PROGRAM,
        },
      });
      return loadCharacterView(this.prisma, row.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = JSON.stringify(error.meta ?? {});
        throw conflict(
          target.includes('display_name') || target.includes('displayName')
            ? 'ชื่อนี้มีผู้เล่นใช้แล้ว'
            : 'บัญชีนี้มีตัวละครอยู่แล้ว',
        );
      }
      throw error;
    }
  }

  /**
   * เลือกอาชีพ — ครั้งเดียวเท่านั้น (รอบ 2P §3.3) · เปลี่ยนแค่ class_id สเตตัสไม่รีเซ็ต
   * ตรวจตามลำดับ "ผิดที่คำขอ (DTO) → ผิดที่สถานะ" ให้ข้อความบอกสาเหตุที่แก้ได้ก่อนเสมอ
   */
  async chooseClass(coreUserId: string, classId: string): Promise<CharacterView> {
    const own = await requireCharacter(this.prisma, coreUserId);
    if (!(PLAYABLE_CLASSES as readonly string[]).includes(classId)) {
      throw conflict(`เลือกอาชีพได้เฉพาะ ${PLAYABLE_CLASSES.join(' · ')} เท่านั้น`);
    }
    await this.prisma.$transaction(async (tx) => {
      const row = await lockCharacter(tx, own.id);
      if (row.classId !== STARTING_CLASS) {
        const current = gamedata.classes[row.classId as ClassId]?.nameTh ?? row.classId;
        throw conflict(`เลือกอาชีพได้ครั้งเดียว — ตอนนี้เป็น${current}แล้ว เปลี่ยนอาชีพยังทำไม่ได้ในรอบนี้`);
      }
      if (row.highestFloor < CLASS_CHOICE_FLOOR) {
        throw conflict(
          `ต้องผ่านชั้น ${CLASS_CHOICE_FLOOR} ก่อนถึงจะเลือกอาชีพได้ — ลองสู้ให้เห็นการต่อสู้จริงสักครั้งก่อน`,
        );
      }
      await tx.character.update({ where: { id: row.id }, data: { classId } });
    });
    return loadCharacterView(this.prisma, own.id);
  }
}
