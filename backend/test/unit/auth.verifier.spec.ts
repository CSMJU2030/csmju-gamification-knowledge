/**
 * ชั้น auth — ตรวจ token ครบ 10 ขั้น + ข้อกำหนดของ JWKS client (auth-contract.md 1.2 ข้อ 4, 4.1)
 * ขั้น 9–10 (อายุ token · azp) conformance ทดสอบไม่ได้ (ไม่มี token จริงแบบนั้น) — สัญญาให้ unit test ของระบบย่อยครอบคลุมเอง
 * ทุกเคสยิงผ่าน JWKS จริงบน HTTP (Core Hub จำลอง) ไม่ได้ mock ตัวดึงกุญแจ
 */
import { Logger } from '@nestjs/common';
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

describe('ตรวจ token ขั้น 1–8', () => {
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

describe('ขั้น 9 อายุ token · ขั้น 10 azp (สัญญา 1.2)', () => {
  const now = () => Math.floor(Date.now() / 1000);

  it.each([
    ['ไม่มี iat', () => hub.sign('user-002', 'student', { omit: ['iat'] })],
    ['อายุ 7 วันแบบ refresh token', () => hub.sign('user-002', 'student', { payload: { iat: now(), exp: now() + 7 * 24 * 3600 } })],
    ['อายุ 961 วินาที (เกิน 900 + 60)', () => hub.sign('user-002', 'student', { payload: { iat: now() - 1, exp: now() + 960 } })],
    ['azp เป็นของระบบอื่น', () => hub.sign('user-002', 'student', { payload: { azp: 'csmju-equipment' } })],
    ['azp ไม่ใช่ข้อความ', () => hub.sign('user-002', 'student', { payload: { azp: 42 } })],
    ['azp ว่าง', () => hub.sign('user-002', 'student', { payload: { azp: '' } })],
  ])('ปฏิเสธ: %s → 401', async (_label, make) => {
    await rejects(make());
  });

  it('อายุพอดี 960 วินาที (900 + 60) → ผ่าน', async () => {
    const t = now();
    await expect(verifier.verify(hub.sign('user-002', 'student', { payload: { iat: t, exp: t + 960 } }))).resolves.toMatchObject({ sub: 'user-002' });
  });

  it('azp ตรงกับ SUBSYSTEM_ID → ผ่าน · ไม่มี azp (Core Hub ตอนนี้) → ผ่าน', async () => {
    const own = hub.sign('user-002', 'student', { payload: { azp: 'csmju-gamification-knowledge' } });
    await expect(verifier.verify(own)).resolves.toMatchObject({ sub: 'user-002' });
    await expect(verifier.verify(hub.sign('user-002', 'student'))).resolves.toMatchObject({ sub: 'user-002' });
  });

  it('sub ไม่ใช่ UUID (นักศึกษาจาก CSV) · claim อื่นเพิ่มมา · role ใหม่ → ผ่าน ไม่ตรวจรูปแบบ sub', async () => {
    const token = hub.sign('user-6304101234', 'lecturer', { payload: { department: 'CS', nickname: 'x' } });
    await expect(verifier.verify(token)).resolves.toEqual(
      expect.objectContaining({ sub: 'user-6304101234', role: 'lecturer' }),
    );
  });
});

describe('log jwt.verification.failure (log-events.json 1.1)', () => {
  const failures = async (token: string, path: string) => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(verifier.verify(token, path)).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
    const lines = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    return lines;
  };

  it.each([
    ['token_lifetime_exceeded', () => hub.sign('user-002', 'student', { payload: { exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 } })],
    ['token_lifetime_exceeded', () => hub.sign('user-002', 'student', { omit: ['iat'] })],
    ['invalid_azp', () => hub.sign('user-002', 'student', { payload: { azp: 'csmju-equipment' } })],
    ['expired', () => hub.sign('user-002', 'student', { payload: { exp: Math.floor(Date.now() / 1000) - 60 } })],
    ['invalid_signature', () => hub.sign('user-002', 'student', { key: hub.foreignKey })],
    ['invalid_issuer', () => hub.sign('user-002', 'student', { payload: { iss: 'evil-hub' } })],
    ['invalid_audience', () => hub.sign('user-002', 'student', { payload: { aud: 'another-platform' } })],
    ['unsupported_algorithm', () => hub.unsigned('user-001', 'admin')],
    ['missing_kid', () => hub.sign('user-002', 'student', { header: { kid: undefined } })],
    ['malformed_token', () => 'not-a-jwt'],
  ])('reason %s · มี kid และ path ไม่มี token หรืออีเมล', async (reason, make) => {
    const token = make();
    const lines = await failures(token, '/api/v1/me');
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line).toMatchObject({ event: 'jwt.verification.failure', reason, path: '/api/v1/me' });
    expect(Object.keys(line).sort()).toEqual(['event', 'kid', 'path', 'reason']);
    expect(lines[0]).not.toContain(token.split('.')[1] || token);
    expect(lines[0]).not.toContain('@core.local');
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
