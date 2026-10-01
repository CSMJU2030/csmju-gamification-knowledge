/**
 * กระเป๋า
 *   GET    /api/v1/items          แทน GET /inventory เดิม
 *   PATCH  /api/v1/items/:id      { equipped } แทน POST /equip · /unequip เดิม
 *   DELETE /api/v1/items/:id      ย่อยไอเทม แทน POST /salvage เดิม
 */
import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { Page } from '../common/envelope';
import { SearchPageQueryDto } from '../common/pagination.dto';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import { uuidParam } from '../common/validation';
import { ItemDto } from '../characters/character.dto';
import type { EnrichedItem } from '../game/character.view';
import { SalvagedItemDto, UpdateItemDto } from './item.dto';
import { ItemsService } from './items.service';

@ApiTags('items')
@Controller('v1/items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @RequirePermissions(Permission.ITEM_READ_OWN)
  @ApiOperation({ summary: 'ไอเทมทั้งหมดในกระเป๋า เรียงตามลำดับที่ได้มา · q ค้นในชื่อไอเทม' })
  @ApiSuccess(ItemDto, { paginated: true })
  @ApiErrors(400, 401, 403, 404)
  list(@CurrentUser() user: AuthUser, @Query() query: SearchPageQueryDto): Promise<Page<EnrichedItem>> {
    return this.items.list(user.coreUserId, query);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ITEM_UPDATE_OWN)
  @ApiOperation({ summary: 'สวมหรือถอดไอเทม' })
  @ApiSuccess(ItemDto)
  @ApiErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', uuidParam()) id: string,
    @Body() body: UpdateItemDto,
  ): Promise<EnrichedItem> {
    return this.items.setEquipped(user.coreUserId, id, body.equipped);
  }

  @Delete(':id')
  @RequirePermissions(Permission.ITEM_DELETE_OWN)
  @ApiOperation({ summary: 'ย่อยไอเทมเป็นวัสดุ' })
  @ApiSuccess(SalvagedItemDto)
  @ApiErrors(400, 401, 403, 404, 409)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuidParam()) id: string): Promise<SalvagedItemDto> {
    return this.items.salvage(user.coreUserId, id);
  }
}
