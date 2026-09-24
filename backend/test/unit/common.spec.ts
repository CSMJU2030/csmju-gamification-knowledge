/** envelope · error code ปิด 7 ค่า · ไม่รั่วรายละเอียดภายใน (api-conventions.md ข้อ 3-5) */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiError, ERROR_HTTP_STATUS, conflict, validationError } from '../../src/common/api-error';
import { toErrorBody } from '../../src/common/all-exceptions.filter';
import { Page, wrap } from '../../src/common/envelope';
import { PageQueryDto } from '../../src/common/pagination.dto';
import { createValidationPipe } from '../../src/common/validation';
import { CreateBattleDto } from '../../src/battles/battle.dto';
import { CreateChallengeDto, UpdateChallengeDto } from '../../src/challenges/challenge.dto';
import { UpdateProgramDto } from '../../src/programs/program.dto';

const CLOSED = ['BAD_REQUEST', 'VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR'];

describe('envelope', () => {
  it('ข้อมูลเดี่ยว → { success: true, data }', () => {
    expect(wrap({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
  });
  it('คอลเลกชัน → data[] + meta ครบ 4 ช่อง', () => {
    expect(wrap(Page.of([1, 2], 5, 1, 2))).toEqual({
      success: true, data: [1, 2], meta: { total: 5, page: 1, limit: 2, totalPages: 3 },
    });
  });
  it('คอลเลกชันว่าง → data: [] และ total 0', () => {
    expect(wrap(Page.of([], 0, 1, 20))).toEqual({ success: true, data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  });
});

describe('error envelope', () => {
  it('รหัสทั้งหมดอยู่ในรายการปิด และ VALIDATION_ERROR เป็น 400', () => {
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual([...CLOSED].sort());
    expect(ERROR_HTTP_STATUS.VALIDATION_ERROR).toBe(400);
  });
  it('ApiError → code/message/details ตรงตัว', () => {
    expect(toErrorBody(validationError(['a', 'b']))).toEqual({
      status: 400,
      body: { success: false, error: { code: 'VALIDATION_ERROR', message: expect.any(String), details: ['a', 'b'] } },
    });
    expect(toErrorBody(conflict('ซ้ำ')).status).toBe(409);
  });
  it.each([
    [new NotFoundException('Cannot GET /api/v1/x'), 404, 'NOT_FOUND'],
    [new BadRequestException('x'), 400, 'BAD_REQUEST'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
  ])('HttpException ของ Nest แปลงเป็นรหัสมาตรฐาน', (exception, status, code) => {
    const { status: s, body } = toErrorBody(exception);
    expect(s).toBe(status);
    expect(body.error.code).toBe(code);
    expect(body.error.message).not.toContain('Cannot GET');
  });
  it('JSON พังจาก body-parser → 400 BAD_REQUEST', () => {
    const err = Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' });
    expect(toErrorBody(err)).toMatchObject({ status: 400, body: { error: { code: 'BAD_REQUEST' } } });
  });
  it('ข้อผิดพลาดที่ไม่รู้จัก → 500 INTERNAL_ERROR ไม่มี stack / SQL / ชื่อไฟล์', () => {
    const err = new Error('SELECT * FROM characters failed at /app/src/x.ts:1:1 PrismaClient');
    const { status, body } = toErrorBody(err);
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toMatch(/SELECT|PrismaClient|\.ts:|stack/);
  });
  it.each([
    ['P2025', 404, 'NOT_FOUND'],
    ['P2002', 409, 'CONFLICT'],
    ['P2034', 409, 'CONFLICT'],
    ['P2028', 500, 'INTERNAL_ERROR'],
  ])('Prisma %s (คำขอแข่งกัน) → %i %s พร้อมข้อความที่ไม่รั่วรายละเอียด', (code, status, errorCode) => {
    const err = Object.assign(new Error('Invalid `prisma.x.delete()` invocation'), { name: 'PrismaClientKnownRequestError', code });
    const out = toErrorBody(err);
    expect(out.status).toBe(status);
    expect(out.body.error.code).toBe(errorCode);
    expect(JSON.stringify(out.body)).not.toContain('prisma');
  });
  it.each([413, 415])('body-parser %i → 400 BAD_REQUEST (สถานะต้องตรงกับตารางรหัส)', (status) => {
    const err = Object.assign(new Error('too large'), { status, type: 'entity.too.large' });
    expect(toErrorBody(err)).toMatchObject({ status: 400, body: { error: { code: 'BAD_REQUEST' } } });
  });
  it('ApiError เป็น HttpException ที่ Nest รู้จัก', () => {
    expect(new ApiError('CONFLICT', 'x').getStatus()).toBe(409);
  });
});

describe('validation', () => {
  const pipe = createValidationPipe();
  const run = (metatype: new () => object, value: unknown, type: 'query' | 'body' = 'body') =>
    pipe.transform(value, { type, metatype });

  it('page/limit ค่าเริ่มต้น 1/20', async () => {
    const q = (await run(PageQueryDto, {}, 'query')) as PageQueryDto;
    expect([q.page, q.limit, q.skip]).toEqual([1, 20, 0]);
  });
  it.each([{ limit: 'not-a-number' }, { limit: '101' }, { page: '0' }])('query %j → 400 VALIDATION_ERROR', async (query) => {
    await expect(run(PageQueryDto, query, 'query')).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });
  it('field ที่ไม่รู้จัก → 400 VALIDATION_ERROR พร้อม details', async () => {
    await expect(run(CreateBattleDto, { towerFloor: 1, hack: true })).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      details: [expect.stringContaining('hack')],
    });
  });
  it('towerFloor ต้องเป็นจำนวนเต็ม 1-10 ชนิด number จริง (ไม่แปลง "1" หรือ true ให้)', async () => {
    for (const bad of [0, 11, 1.5, 'x', '1', true, null]) {
      const errors = await validate(plainToInstance(CreateBattleDto, { towerFloor: bad }));
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['towerFloor: null', CreateBattleDto, { towerFloor: null }],
    ['regionRunId: null', CreateBattleDto, { regionRunId: null }],
    ['starterSource: null', CreateChallengeDto, { title: 't', starterSource: null }],
    ['PATCH title: null', UpdateChallengeDto, { title: null }],
    ['PATCH description: null', UpdateChallengeDto, { description: null }],
    ['title มีแต่ช่องว่าง', CreateChallengeDto, { title: '   ' }],
    ['NUL ในโปรแกรม', UpdateProgramDto, { source: 'def turn():\n    defend()\n# \u0000\n' }],
    ['NUL ในชื่อโจทย์', CreateChallengeDto, { title: 'a\u0000b' }],
    ['starterSource ยาวเกิน 20000', CreateChallengeDto, { title: 't', starterSource: '#'.repeat(20001) }],
  ])('%s → 400 VALIDATION_ERROR (เดิมหลุดไปเป็น 500)', async (_label, dto, body) => {
    await expect(run(dto as new () => object, body)).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });
  it('PATCH regionId: null ได้ (= เลิกผูกภูมิภาค)', async () => {
    await expect(run(UpdateChallengeDto, { regionId: null })).resolves.toMatchObject({ regionId: null });
  });
  it('page ใหญ่ผิดปกติ (1e308) → 400 แทน 500', async () => {
    await expect(run(PageQueryDto, { page: '1e308' }, 'query')).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });
});
