/** POST /api/v1/item-upgrades — ตีบวกไอเทม +1 (แทน POST /upgrade เดิม) */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { ApiErrors, ApiSuccess } from '../common/swagger';
import { CreateItemUpgradeDto, ItemUpgradeDto } from './item.dto';
import { ItemsService } from './items.service';

@ApiTags('items')
@Controller('v1/item-upgrades')
export class ItemUpgradesController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions(Permission.ITEM_UPGRADE_CREATE_OWN)
  @ApiOperation({ summary: 'ตีบวกไอเทม +1 ด้วยทองและวัสดุ' })
  @ApiSuccess(ItemUpgradeDto, { status: 201 })
  @ApiErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateItemUpgradeDto): Promise<ItemUpgradeDto> {
    return this.items.upgrade(user.coreUserId, body.itemId);
  }
}
