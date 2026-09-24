/**
 * กระเป๋าของผู้เล่น (ย้ายมาจาก server/src/routes/inventory.ts)
 *
 * ไอเทมเป็นของตัวละครเจ้าของเสมอ: หาไม่เจอ → 404 · เจอแต่เป็นของคนอื่น → 403
 * (authorization.md ข้อ 5 ห้ามตอบ 404 แทน 403 เพื่อซ่อนข้อมูล)
 */
import { Injectable } from '@nestjs/common';
import { FORMULAS, SALVAGE_MATERIALS, UPGRADE_MAX_LEVEL, type Rarity } from '@tower/engine';
import { conflict, forbidden, notFound } from '../common/api-error';
import { Page } from '../common/envelope';
import type { PageQueryDto } from '../common/pagination.dto';
import type { Item } from '../generated/prisma/client';
import { lockCharacter, requireCharacter } from '../game/character.repository';
import { enrichItem, type EnrichedItem } from '../game/character.view';
import { PrismaService, type Tx } from '../prisma/prisma.service';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(coreUserId: string, query: PageQueryDto): Promise<Page<EnrichedItem>> {
    const own = await requireCharacter(this.prisma, coreUserId);
    const where = { characterId: own.id };
    const [rows, total] = await Promise.all([
      this.prisma.item.findMany({ where, orderBy: { seq: 'asc' }, skip: query.skip, take: query.limit }),
      this.prisma.item.count({ where }),
    ]);
    return Page.of(rows.map(enrichItem), total, query.page, query.limit);
  }

  /** อ่านไอเทมภายในทรานแซกชันที่ล็อกตัวละครไว้แล้ว — ตรวจทั้งมีอยู่จริงและเป็นของคนนี้ */
  private async ownItem(tx: Tx, characterId: string, itemId: string): Promise<Item> {
    const item = await tx.item.findUnique({ where: { id: itemId } });
    if (!item) throw notFound('ไม่พบไอเทมนี้');
    if (item.characterId !== characterId) throw forbidden('ไอเทมนี้เป็นของผู้เล่นคนอื่น');
    return item;
  }

  /** สวม (ถอดของเดิมในช่องเดียวกันให้) หรือถอด */
  async setEquipped(coreUserId: string, itemId: string, equipped: boolean): Promise<EnrichedItem> {
    const own = await requireCharacter(this.prisma, coreUserId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockCharacter(tx, own.id);
      const item = await this.ownItem(tx, own.id, itemId);
      if (equipped) {
        if (item.isEquipped) throw conflict('ไอเทมนี้สวมใส่อยู่แล้ว');
        await tx.item.updateMany({
          where: { characterId: own.id, slot: item.slot, isEquipped: true },
          data: { isEquipped: false },
        });
      } else if (!item.isEquipped) {
        throw conflict('ไอเทมนี้ไม่ได้สวมใส่อยู่');
      }
      return tx.item.update({ where: { id: item.id }, data: { isEquipped: equipped } });
    });
    return enrichItem(updated);
  }

  /** ย่อยไอเทมเป็นวัสดุ — ของที่สวมอยู่ย่อยไม่ได้ */
  async salvage(coreUserId: string, itemId: string) {
    const own = await requireCharacter(this.prisma, coreUserId);
    return this.prisma.$transaction(async (tx) => {
      await lockCharacter(tx, own.id);
      const item = await this.ownItem(tx, own.id, itemId);
      if (item.isEquipped) throw conflict('ไม่สามารถย่อยไอเทมที่สวมใส่อยู่ได้ กรุณาถอดก่อน');
      const materialsGained = SALVAGE_MATERIALS[item.rarity as Rarity] ?? 0;
      await tx.item.delete({ where: { id: item.id } });
      const character = await tx.character.update({
        where: { id: own.id },
        data: { materials: { increment: materialsGained } },
      });
      return { id: item.id, deleted: true as const, materialsGained, materials: character.materials };
    });
  }

  /** ตีบวก +1 — ใช้ทองและวัสดุตามสูตรของ engine */
  async upgrade(coreUserId: string, itemId: string) {
    const own = await requireCharacter(this.prisma, coreUserId);
    return this.prisma.$transaction(async (tx) => {
      const character = await lockCharacter(tx, own.id);
      const item = await this.ownItem(tx, own.id, itemId);
      if (item.upgradeLevel >= UPGRADE_MAX_LEVEL) {
        throw conflict(`ไอเทมนี้ตีบวกถึงขั้นสูงสุด (+${UPGRADE_MAX_LEVEL}) แล้ว`);
      }
      const materialsSpent = FORMULAS.upgradeMaterialCost(item.upgradeLevel);
      const goldSpent = FORMULAS.upgradeGoldCost(item.upgradeLevel);
      if (character.materials < materialsSpent || character.gold < goldSpent) {
        throw conflict(`ทรัพยากรไม่พอ: ต้องใช้ ${goldSpent} ทอง และ ${materialsSpent} วัสดุ`);
      }
      const after = await tx.character.update({
        where: { id: own.id },
        data: { gold: character.gold - goldSpent, materials: character.materials - materialsSpent },
      });
      const upgraded = await tx.item.update({
        where: { id: item.id },
        data: { upgradeLevel: { increment: 1 } },
      });
      return {
        item: enrichItem(upgraded),
        goldSpent,
        materialsSpent,
        gold: after.gold,
        materials: after.materials,
      };
    });
  }
}
