/**
 * guard ทั้งสองชั้น — 401 เมื่อไม่รู้ว่าเป็นใคร · 403 เมื่อรู้แล้วแต่สิทธิ์ไม่พอ (authorization.md ข้อ 6: ต้องมีเคส 403)
 */
import { type ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type AuthUser, CORE_ROLES } from '../../src/auth/auth.types';
import { PERMISSIONS_KEY } from '../../src/auth/decorators/require-permissions.decorator';
import { extractToken, readCookie, toAuthUser } from '../../src/auth/guards/core-hub-jwt.guard';
import { PermissionsGuard } from '../../src/auth/guards/permissions.guard';
import { Permission, ROLE_PERMISSIONS } from '../../src/auth/permissions';
import { CORE_ROLE_TO_SUBSYSTEM_ROLE, mapCoreRole } from '../../src/auth/role-mapping';

const req = (headers: Record<string, string>) => ({ headers }) as unknown as Request;

describe('รับ token จาก header หรือคุกกี้', () => {
  it('Bearer header', () => {
    expect(extractToken(req({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
  });
  it('header มาก่อนคุกกี้เสมอ', () => {
    expect(extractToken(req({ authorization: 'Bearer from-header', cookie: 'csmju_gamification_knowledge_access_token=from-cookie' }))).toBe('from-header');
  });
  it('ไม่มี header → ใช้คุกกี้ csmju_gamification_knowledge_access_token (สัญญา 1.1 ข้อ 5.1)', () => {
    expect(extractToken(req({ cookie: 'theme=dark; csmju_gamification_knowledge_access_token=tok%2E1; x=1' }))).toBe('tok.1');
  });
  it.each([
    ['ไม่มีอะไรเลย', {}],
    ['scheme ไม่ใช่ Bearer', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['Bearer ว่าง', { authorization: 'Bearer ' }],
    ['คุกกี้ชื่ออื่น', { cookie: 'session=abc' }],
    ['คุกกี้ชื่อเดิมก่อนสัญญา 1.1', { cookie: 'core_hub_access_token=abc' }],
    ['คุกกี้ของเว็บ Core Hub บน localhost (ต้องไม่อ่าน · ข้อ 6)', { cookie: 'csmju_access_token=abc; csmju_refresh_token=def' }],
  ])('%s → 401', (_label, headers) => {
    expect(() => extractToken(req(headers as Record<string, string>))).toThrow(expect.objectContaining({ errorCode: 'UNAUTHORIZED' }));
  });
  it('readCookie อ่านเฉพาะชื่อที่ตรงเป๊ะ', () => {
    expect(readCookie('xcore_hub_access_token=1; core_hub_access_token=2', 'core_hub_access_token')).toBe('2');
  });
});

describe('role mapping (authorization.md 1.1 · core role 6 ค่า)', () => {
  it('รับ 5 role: lecturer ใช้สิทธิ์ชุดเดียวกับ staff · guest ไม่อยู่ในตาราง', () => {
    expect(CORE_ROLE_TO_SUBSYSTEM_ROLE).toEqual({
      student: 'PLAYER', alumni: 'PLAYER', staff: 'INSTRUCTOR', lecturer: 'INSTRUCTOR', admin: 'ADMIN',
    });
    expect(CORE_ROLES).toEqual(['student', 'alumni', 'staff', 'lecturer', 'guest', 'admin']);
    expect(mapCoreRole('lecturer')).toBe('INSTRUCTOR');
    expect(mapCoreRole('guest')).toBeNull();
  });
  it('lecturer สร้างโจทย์ได้เหมือน staff', () => {
    const lecturer = toAuthUser({ sub: 'user-lec', email: '', role: 'lecturer', exp: 0 });
    expect(lecturer.subsystemRole).toBe('INSTRUCTOR');
    expect(lecturer.permissions.has(Permission.CHALLENGE_CREATE)).toBe(true);
  });
  it.each(['guest', 'superuser', 42, undefined])('role %p ที่ระบบไม่รับ → 403 (รู้ตัวตนแล้ว ไม่ใช่ 401) + log role_mapping_failed ด้วย sub เท่านั้น', (role) => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    expect(() => toAuthUser({ sub: 'user-9', email: 'guest@example.com', role, exp: 0 })).toThrow(
      expect.objectContaining({ errorCode: 'FORBIDDEN' }),
    );
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line).toEqual({
      event: 'authorization.role_mapping_failed',
      sub: 'user-9',
      coreRole: typeof role === 'string' ? role : null,
    });
    expect(String(warn.mock.calls[0][0])).not.toContain('guest@example.com');
    warn.mockRestore();
  });
  it('ผู้เล่นมีแต่สิทธิ์ :own ของเกม — ไม่มีสิทธิ์สร้างโจทย์', () => {
    const player = ROLE_PERMISSIONS.PLAYER;
    expect(player.has(Permission.BATTLE_CREATE_OWN)).toBe(true);
    expect(player.has(Permission.CHALLENGE_CREATE)).toBe(false);
    expect([...player].every((p) => !p.endsWith(':any'))).toBe(true);
  });
});

describe('PermissionsGuard', () => {
  const ctx = (user: AuthUser | undefined, required: Permission[] | undefined): ExecutionContext => {
    const handler = () => undefined;
    const reflector = new Reflector();
    if (required) Reflect.defineMetadata(PERMISSIONS_KEY, required, handler);
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      __reflector: reflector,
    } as unknown as ExecutionContext;
  };
  const guard = new PermissionsGuard(new Reflector());
  const student = toAuthUser({ sub: 'user-002', email: 's@core.local', role: 'student', exp: 0 });
  const staff = toAuthUser({ sub: 'user-003', email: 't@core.local', role: 'staff', exp: 0 });

  it('student สร้างโจทย์ → 403 FORBIDDEN', () => {
    expect(() => guard.canActivate(ctx(student, [Permission.CHALLENGE_CREATE]))).toThrow(
      expect.objectContaining({ errorCode: 'FORBIDDEN' }),
    );
  });
  it('staff สร้างโจทย์ได้', () => {
    expect(guard.canActivate(ctx(staff, [Permission.CHALLENGE_CREATE]))).toBe(true);
  });
  it('มีอย่างน้อยหนึ่งข้อในรายการก็พอ', () => {
    expect(guard.canActivate(ctx(staff, [Permission.CHALLENGE_UPDATE_ANY, Permission.CHALLENGE_UPDATE_OWN]))).toBe(true);
  });
  it('route ที่ไม่ได้ประกาศ permission — ผ่าน (ล็อกด้วย CoreHubJwtGuard อยู่แล้ว)', () => {
    expect(guard.canActivate(ctx(student, undefined))).toBe(true);
  });
});
