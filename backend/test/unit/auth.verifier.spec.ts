/**
 * ชั้น auth — ตรวจ token ครบ 8 ขั้น + ข้อกำหนดของ JWKS client (auth-contract.md ข้อ 4, 4.1)
 * ทุกเคสยิงผ่าน JWKS จริงบน HTTP (Core Hub จำลอง) ไม่ได้ mock ตัวดึงกุญแจ
 */
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import { ApiError } from '../../src/common/api-error';
import { configuration, type AppConfig } from '../../src/config/configuration';
import { CoreHubTokenVerifier } from '../../src/auth/core-hub-token.verifier';
import { JwksService } from '../../src/auth/jwks.service';
import { FakeCoreHub, testEnv } from '../support/fake-core-hub';

const hub = new FakeCoreHub();
let verifier: CoreHubTokenVerifier;
let jwks: JwksService;

function build(): void {
  const config = new ConfigService<AppConfig, true>(configuration());
  jwks = new JwksService(config);
  verifier = new CoreHubTokenVerifier(jwks, config);
}

async function rejects(token: string): Promise<void> {
  await expect(verifier.verify(token)).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
  await expect(verifier.verify(token)).rejects.toBeInstanceOf(ApiError);
}

beforeAll(async () => {
  await hub.start();
  Object.assign(process.env, testEnv(hub));
});
afterAll(() => hub.stop());
beforeEach(() => {
  hub.jwksHits = 0;
  hub.down = false;
  hub.publishedKid = hub.kid;
  hub.extraJwks = [];
  jest.restoreAllMocks();
  build();
});

describe('ตรวจ token 8 ขั้น', () => {
  it('token ที่ถูกต้องผ่าน และคืน sub · email · role · exp', async () => {
    const claims = await verifier.verify(hub.sign('user-002', 'student'));
    expect(claims).toMatchObject({ sub: 'user-002', email: 'user-002@core.local', role: 'student' });
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it.each([
    ['ข้อความที่ไม่ใช่ JWT', () => 'not-a-jwt'],
    ['ว่าง', () => ''],
    ['alg=none', () => hub.unsigned('user-001', 'admin')],
    ['ลงนามแบบสมมาตร (HMAC)', () => hub.signSymmetric('user-001', 'admin')],
    ['alg อื่นใน header แม้ลายเซ็นเป็น RSA', () => hub.sign('user-002', 'student', { header: { alg: 'RS512' } })],
    ['ลายเซ็นจากกุญแจอื่น', () => hub.sign('user-002', 'student', { key: hub.foreignKey })],
    ['iss ผิด', () => hub.sign('user-002', 'student', { payload: { iss: 'evil-hub' } })],
    ['aud ผิด', () => hub.sign('user-002', 'student', { payload: { aud: 'another-platform' } })],
    ['หมดอายุเกิน clock skew', () => hub.sign('user-002', 'student', { payload: { exp: Math.floor(Date.now() / 1000) - 60 } })],
    ['ไม่มี exp', () => hub.sign('user-002', 'student', { omit: ['exp'] })],
    ['ไม่มี sub', () => hub.sign('user-002', 'student', { omit: ['sub'] })],
    ['sub ว่าง', () => hub.sign('   ', 'student')],
    ['ไม่มี kid', () => hub.sign('user-002', 'student', { header: { kid: undefined } })],
  ])('ปฏิเสธ: %s → 401', async (_label, make) => {
    await rejects(make());
  });

  it('แก้ payload หลังลงนาม (ยกระดับ role) → 401', async () => {
    const [h, p, s] = hub.sign('user-002', 'student').split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...payload, role: 'admin' })).toString('base64url')}.${s}`;
    await rejects(tampered);
  });

  it('หมดอายุแต่ยังอยู่ใน clock skew (5 วินาที) → ผ่าน', async () => {
    const token = hub.sign('user-002', 'student', { payload: { exp: Math.floor(Date.now() / 1000) - 2 } });
    await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-002' });
  });
});

describe('JWKS client', () => {
  it('แคชกุญแจ — ตรวจหลายครั้งดึง JWKS ครั้งเดียว', async () => {
    for (let i = 0; i < 5; i++) await verifier.verify(hub.sign(`user-00${i}`, 'student'));
    expect(hub.jwksHits).toBe(1);
  });

  it('kid ที่ไม่รู้จัก → รีเฟรชหนึ่งครั้ง แล้วปฏิเสธ · ครั้งต่อไปในช่วงจำกัดอัตราไม่รีเฟรชซ้ำ', async () => {
    await verifier.verify(hub.sign('user-002', 'student'));
    expect(hub.jwksHits).toBe(1);
    const clock = jest.spyOn(performance, 'now');
    const t0 = performance.now();
    clock.mockReturnValue(t0 + 31_000);
    await rejects(hub.sign('user-002', 'student', { header: { kid: 'unknown-key-9999' } }));
    expect(hub.jwksHits).toBe(2);
    clock.mockReturnValue(t0 + 32_000);
    await rejects(hub.sign('user-002', 'student', { header: { kid: 'unknown-key-9999' } }));
    expect(hub.jwksHits).toBe(2);
  });

  it('หมุนกุญแจ: kid ใหม่ที่ไม่อยู่ในแคช → รีเฟรชแล้วเจอ → ผ่าน', async () => {
    await verifier.verify(hub.sign('user-002', 'student'));
    hub.publishedKid = 'core-hub-2027';
    jest.spyOn(performance, 'now').mockReturnValue(performance.now() + 31_000);
    const rotated = hub.sign('user-002', 'student', { header: { kid: 'core-hub-2027' } });
    await expect(verifier.verify(rotated)).resolves.toMatchObject({ sub: 'user-002' });
    expect(hub.jwksHits).toBe(2);
  });

  it('Core Hub ล่มหลังแคชหมดอายุ → ใช้กุญแจที่แคชไว้ต่อ', async () => {
    await verifier.verify(hub.sign('user-002', 'student'));
    hub.down = true;
    jest.spyOn(performance, 'now').mockReturnValue(performance.now() + 700_000);
    await expect(verifier.verify(hub.sign('user-003', 'staff'))).resolves.toMatchObject({ sub: 'user-003' });
    expect(hub.jwksHits).toBe(2);
  });

  it('ไม่ใช้ JWK ที่มี private material หรือไม่ใช่ RSA', async () => {
    hub.publishedKid = 'rotated-away';
    hub.extraJwks = [hub.privateJwk() as Record<string, unknown>, { kty: 'oct', k: 'c2VjcmV0', kid: hub.kid }];
    (hub.extraJwks[0] as Record<string, unknown>).kid = hub.kid;
    await rejects(hub.sign('user-002', 'student'));
  });
});
