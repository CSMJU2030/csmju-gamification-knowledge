/**
 * PermissionsGuard — รู้ตัวตนแล้ว แต่ไม่มี permission ที่ route ต้องการสักข้อ → 403 (ไม่ใช่ 401 / 404)
 * ownership (`:own`) ตรวจซ้ำกับข้อมูลจริงในชั้น service เสมอ
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden } from '../../common/api-error';
import type { AuthUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { Permission } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user && required.some((p) => user.permissions.has(p))) return true;
    throw forbidden();
  }
}
