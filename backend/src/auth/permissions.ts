/**
 * permission ของ Code Tower — เขียนไว้ที่เดียว (authorization.md ข้อ 4, 6)
 *
 * รูปแบบ `<resource>:<action>[:own|:any]` · `:own` = เฉพาะข้อมูลที่ `core_user_id === token.sub`
 * guard ตรวจแค่ว่ามี permission อย่างน้อยหนึ่งข้อ — service ต้องตรวจ ownership กับข้อมูลจริงอีกชั้น
 *
 * ของในเกม (ตัวละคร ไอเทม โปรแกรม รอบในภูมิภาค การรบ) เป็นของผู้เล่นเจ้าของเสมอ
 * endpoint ฝั่งผู้เล่นทุกตัวทำงานกับ "ตัวละครของ token นี้" เท่านั้น จึงมีแต่ `:own`
 */
import type { SubsystemRole } from './role-mapping';

export const Permission = {
  CHARACTER_CREATE_OWN: 'character:create:own',
  CHARACTER_READ_OWN: 'character:read:own',
  CHARACTER_UPDATE_OWN: 'character:update:own',
  PROGRAM_READ_OWN: 'program:read:own',
  PROGRAM_UPDATE_OWN: 'program:update:own',
  ITEM_READ_OWN: 'item:read:own',
  ITEM_UPDATE_OWN: 'item:update:own',
  ITEM_DELETE_OWN: 'item:delete:own',
  ITEM_UPGRADE_CREATE_OWN: 'item-upgrade:create:own',
  BATTLE_CREATE_OWN: 'battle:create:own',
  BATTLE_READ_OWN: 'battle:read:own',
  TOWER_PROGRESS_READ_OWN: 'tower-progress:read:own',
  REGION_READ: 'region:read',
  REGION_RUN_CREATE_OWN: 'region-run:create:own',
  REGION_RUN_DELETE_OWN: 'region-run:delete:own',
  GAME_DATA_READ: 'game-data:read',
  CHALLENGE_READ: 'challenge:read',
  CHALLENGE_CREATE: 'challenge:create',
  CHALLENGE_UPDATE_OWN: 'challenge:update:own',
  CHALLENGE_UPDATE_ANY: 'challenge:update:any',
  CHALLENGE_DELETE_OWN: 'challenge:delete:own',
  CHALLENGE_DELETE_ANY: 'challenge:delete:any',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const PLAY: Permission[] = [
  Permission.CHARACTER_CREATE_OWN,
  Permission.CHARACTER_READ_OWN,
  Permission.CHARACTER_UPDATE_OWN,
  Permission.PROGRAM_READ_OWN,
  Permission.PROGRAM_UPDATE_OWN,
  Permission.ITEM_READ_OWN,
  Permission.ITEM_UPDATE_OWN,
  Permission.ITEM_DELETE_OWN,
  Permission.ITEM_UPGRADE_CREATE_OWN,
  Permission.BATTLE_CREATE_OWN,
  Permission.BATTLE_READ_OWN,
  Permission.TOWER_PROGRESS_READ_OWN,
  Permission.REGION_READ,
  Permission.REGION_RUN_CREATE_OWN,
  Permission.REGION_RUN_DELETE_OWN,
  Permission.GAME_DATA_READ,
  Permission.CHALLENGE_READ,
];

/**
 * เมทริกซ์สิทธิ์
 *
 * | Permission              | PLAYER | INSTRUCTOR | ADMIN |
 * |-------------------------|:------:|:----------:|:-----:|
 * | เล่นเกม (ของตัวเอง)      |   ✅   |     ✅     |  ✅   |
 * | challenge:read          |   ✅   |     ✅     |  ✅   |
 * | challenge:create        |   —    |     ✅     |  ✅   |
 * | challenge:update/delete:own | —  |     ✅     |  ✅   |
 * | challenge:update/delete:any | —  |     —      |  ✅   |
 */
export const ROLE_PERMISSIONS: Record<SubsystemRole, ReadonlySet<Permission>> = {
  PLAYER: new Set(PLAY),
  INSTRUCTOR: new Set([
    ...PLAY,
    Permission.CHALLENGE_CREATE,
    Permission.CHALLENGE_UPDATE_OWN,
    Permission.CHALLENGE_DELETE_OWN,
  ]),
  ADMIN: new Set([
    ...PLAY,
    Permission.CHALLENGE_CREATE,
    Permission.CHALLENGE_UPDATE_OWN,
    Permission.CHALLENGE_UPDATE_ANY,
    Permission.CHALLENGE_DELETE_OWN,
    Permission.CHALLENGE_DELETE_ANY,
  ]),
};

export function permissionsFor(role: SubsystemRole): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role];
}
