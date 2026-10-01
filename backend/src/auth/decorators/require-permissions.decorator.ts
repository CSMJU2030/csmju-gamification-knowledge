import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** ต้องมี permission อย่างน้อยหนึ่งข้อในรายการ — ไม่มีสักข้อ → 403 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
