import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthUser } from '../auth.types';

/** ผู้ใช้ที่ CoreHubJwtGuard ตรวจแล้ว — route ที่ไม่ใช่ @Public จะมีค่าเสมอ */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
