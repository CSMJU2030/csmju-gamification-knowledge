/**
 * ตัวเรียก API ข้อมูลกลางของ Core Hub — GET /people/me (reference-data.md 1.3 ข้อ 5 · 7.4)
 * ยิงผ่าน HTTP จริงไปที่ Core Hub จำลอง ไม่ได้ mock fetch
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { configuration, type AppConfig } from '../../src/config/configuration';
import { CoreHubClient } from '../../src/core-hub/core-hub.client';
import { FakeCoreHub, testEnv } from '../support/fake-core-hub';

const hub = new FakeCoreHub();
let client: CoreHubClient;

const build = (env: Record<string, string> = {}) => {
  Object.assign(process.env, testEnv(hub), env);
  client = new CoreHubClient(new ConfigService<AppConfig, true>(configuration()));
};

beforeAll(async () => {
  await hub.start();
});
afterAll(() => hub.stop());
beforeEach(() => {
  hub.people.clear();
  hub.peopleStatus = null;
  hub.peopleRetryAfter = null;
  hub.peopleRawBody = null;
  hub.peopleDelayMs = 0;
  delete process.env.CORE_HUB_REQUEST_TIMEOUT_MS;
  build();
});

describe('GET /people/me', () => {
  it('ได้ personCode ของเจ้าของ token · ส่ง token ของผู้ใช้เป็น Bearer', async () => {
    hub.people.set('user-002', '6504101234');
    const token = hub.sign('user-002', 'student');
    await expect(client.peopleMe(token)).resolves.toEqual({ personCode: '6504101234' });
    expect(hub.lastPeopleAuthorization).toBe(`Bearer ${token}`);
  });

  it('บัญชีไม่ได้ผูกกับบุคคล (data: null) → personCode null', async () => {
    await expect(client.peopleMe(hub.sign('user-001', 'admin'))).resolves.toEqual({ personCode: null });
  });

  it.each([
    [401, 'UNAUTHORIZED', 401],
    [403, 'FORBIDDEN', 403],
  ])('Core Hub ตอบ %i → %s', async (status, code, ours) => {
    hub.peopleStatus = status;
    const error = await client.peopleMe(hub.sign('user-002', 'student')).catch((e: unknown) => e);
    expect(error).toMatchObject({ errorCode: code });
    expect((error as { getStatus(): number }).getStatus()).toBe(ours);
  });

  it.each([
    ['429 + Retry-After 12', 429, '12', 12],
    ['429 + Retry-After ยาวเกิน → เพดาน 300', 429, '99999', 300],
    ['429 ไม่บอกเวลา', 429, null, 30],
    ['500', 500, null, 30],
    ['503 + Retry-After 5', 503, '5', 5],
  ])('%s → 503 SERVICE_UNAVAILABLE + Retry-After', async (_label, status, retryAfter, expected) => {
    hub.peopleStatus = status;
    hub.peopleRetryAfter = retryAfter;
    const error = await client.peopleMe(hub.sign('user-002', 'student')).catch((e: unknown) => e);
    expect(error).toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE', retryAfterSec: expected });
  });

  it('ช้าเกิน CORE_HUB_REQUEST_TIMEOUT_MS → 503', async () => {
    build({ CORE_HUB_REQUEST_TIMEOUT_MS: '150' });
    hub.peopleDelayMs = 1_000;
    await expect(client.peopleMe(hub.sign('user-002', 'student'))).rejects.toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE', retryAfterSec: 30 });
  });

  it('ต่อไม่ติด → 503', async () => {
    build({ CORE_HUB_URL: 'http://127.0.0.1:1' });
    await expect(client.peopleMe(hub.sign('user-002', 'student'))).rejects.toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE' });
  });

  it.each([
    ['ไม่ใช่ JSON', 'not json'],
    ['personCode ไม่ใช่ข้อความ', '{"success":true,"data":{"personCode":42}}'],
    ['personCode มีอักขระแปลก', '{"success":true,"data":{"personCode":"<b>x</b>"}}'],
    ['personCode ยาวเกิน 64', `{"success":true,"data":{"personCode":"${'1'.repeat(65)}"}}`],
    ['ไม่มี data', '{"success":true}'],
  ])('คำตอบผิดรูป (%s) → 503 ไม่เอาค่าแปลกไปเป็นชื่อ', async (_label, body) => {
    hub.peopleRawBody = body;
    await expect(client.peopleMe(hub.sign('user-002', 'student'))).rejects.toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE' });
  });

  it('log ไม่มี token และไม่มีรหัสของผู้ใช้ (log-events.json 1.1)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const token = hub.sign('user-002', 'student');
    hub.peopleStatus = 500;
    await client.peopleMe(token).catch(() => undefined);
    hub.peopleStatus = null;
    hub.peopleRawBody = '{"success":true,"data":{"personCode":"<6504101234>"}}';
    await client.peopleMe(token).catch(() => undefined);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(JSON.parse(line)).toMatchObject({ event: 'core_hub.request.failure', path: '/api/v1/people/me' });
      expect(line).not.toContain(token.split('.')[1]);
      expect(line).not.toContain('6504101234');
    }
  });
});
