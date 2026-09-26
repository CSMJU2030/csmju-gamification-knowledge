/**
 * e2e ทั้งเส้นทาง: Core Hub (จำลอง) → token → guard → service → Prisma → PostgreSQL จริง
 *
 * ต้องตั้ง TEST_DATABASE_URL ให้ชี้ฐานข้อมูลที่ลบทิ้งได้ (ทุกครั้งที่รันจะล้าง schema public)
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/code_tower_test pnpm --filter backend test:e2e
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FakeCoreHub, testEnv, type CoreRoleClaim } from '../support/fake-core-hub';
import { resetDatabase } from '../support/test-db';

const DB = process.env.TEST_DATABASE_URL;
if (!DB) throw new Error('ตั้ง TEST_DATABASE_URL ก่อนรัน e2e (ฐานข้อมูลนี้จะถูกล้าง)');

const hub = new FakeCoreHub();
let app: INestApplication;
let http: ReturnType<typeof request>;

const token = (sub: string, role: CoreRoleClaim = 'student') => hub.sign(sub, role);
const as = (sub: string, role: CoreRoleClaim = 'student') => ({ Authorization: `Bearer ${token(sub, role)}` });

beforeAll(async () => {
  await hub.start();
  Object.assign(process.env, testEnv(hub, DB));
  await resetDatabase(DB);
  // import หลังตั้ง env — ConfigModule.forRoot ตรวจ env ตอน import โมดูล
  const { AppModule } = await import('../../src/app.module');
  const { configureApp } = await import('../../src/main');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
  await hub.stop();
});

describe('ตัวตนและสิทธิ์', () => {
  it('GET /api/health public', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok', service: 'csmju-code-tower' } });
  });

  it('ไม่มี token → 401 · token ถูก → /me คืนตัวตนจาก claim', async () => {
    await http.get('/api/v1/me').expect(401);
    const res = await http.get('/api/v1/me').set(as('user-002')).expect(200);
    expect(res.body.data).toMatchObject({ id: 'user-002', coreRole: 'student', subsystemRole: 'PLAYER' });
  });

  it('endpoint ที่ไม่มี → 404 envelope · ไม่มี login ของตัวเอง', async () => {
    const res = await http.post('/api/v1/auth/login').set(as('user-002')).send({ email: 'x', password: 'y' }).expect(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('ตัวละคร', () => {
  it('ยังไม่มี → 404 · สร้าง → 201 · ซ้ำ → 409 · ชื่อซ้ำกับคนอื่น → 409 · ชื่อผิดรูป → 400', async () => {
    await http.get('/api/v1/characters/current').set(as('p-alice')).expect(404);
    const created = await http.post('/api/v1/characters').set(as('p-alice')).send({ displayName: 'alice' }).expect(201);
    expect(created.body.data).toMatchObject({ displayName: 'alice', classId: 'novice', level: 1, gold: 100 });
    await http.post('/api/v1/characters').set(as('p-alice')).send({ displayName: 'alice2' }).expect(409);
    await http.post('/api/v1/characters').set(as('p-bob')).send({ displayName: 'alice' }).expect(409);
    const bad = await http.post('/api/v1/characters').set(as('p-bob')).send({ displayName: 'a' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await http.post('/api/v1/characters').set(as('p-bob')).send({ displayName: 'บ๊อบ_01' }).expect(201);
  });

  it('เลือกอาชีพก่อนผ่านชั้น 1 → 409 · อาชีพที่ไม่มี → 400', async () => {
    await http.patch('/api/v1/characters/current').set(as('p-alice')).send({ classId: 'warrior' }).expect(409);
    await http.patch('/api/v1/characters/current').set(as('p-alice')).send({ classId: 'novice' }).expect(400);
  });
});

describe('การรบและกระเป๋า', () => {
  it('หอคอยชั้น 1 → 201 ผลเต็ม + ตัวละครหลังบันทึก · ข้ามชั้น → 409', async () => {
    const res = await http.post('/api/v1/battles').set(as('p-alice')).send({ towerFloor: 1 }).expect(201);
    const d = res.body.data;
    expect(d.result.events.length).toBeGreaterThan(0);
    expect(d.character.exp + (d.leveledUp ? 1 : 0)).toBeGreaterThan(0);
    await http.post('/api/v1/battles').set(as('p-alice')).send({ towerFloor: 9 }).expect(409);
    await http.post('/api/v1/battles').set(as('p-alice')).send({}).expect(400);
  });

  it('playtest รอบ A: นับครั้งที่รบที่จุดเดียวกัน + ผลครั้งก่อน · ทุก event ของผู้ลงมือมี mpAfter', async () => {
    await http.post('/api/v1/characters').set(as('p-attempt')).send({ displayName: 'attempt' }).expect(201);
    const first = (await http.post('/api/v1/battles').set(as('p-attempt')).send({ towerFloor: 1 }).expect(201)).body.data;
    expect(first.attempt).toEqual({ attemptNo: 1, firstAttempt: true, previous: null });
    for (const e of first.result.events) {
      const system = e.note === 'wave_start' || e.note === 'wave_clear';
      expect(typeof e.mpAfter).toBe(system ? 'undefined' : 'number');
    }

    const second = (await http.post('/api/v1/battles').set(as('p-attempt')).send({ towerFloor: 1 }).expect(201)).body.data;
    expect(second.attempt).toMatchObject({
      attemptNo: 2,
      firstAttempt: false,
      previous: { victory: first.result.victory, wavesCleared: first.result.wavesCleared },
    });
    expect(Date.parse(second.attempt.previous.createdAt)).not.toBeNaN();
  });

  it('สองการรบพร้อมกัน — exp รวมตรงกับผลรวมจริง (ไม่มีการเขียนทับกัน)', async () => {
    await http.post('/api/v1/characters').set(as('p-carol')).send({ displayName: 'carol' }).expect(201);
    const before = (await http.get('/api/v1/characters/current').set(as('p-carol'))).body.data;
    const [a, b] = await Promise.all([
      http.post('/api/v1/battles').set(as('p-carol')).send({ towerFloor: 1 }),
      http.post('/api/v1/battles').set(as('p-carol')).send({ towerFloor: 1 }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    // ล็อกแถวตัวละครทำให้นับครั้งไม่ชนกัน: ได้ 1 กับ 2 เสมอ
    expect([a.body.data.attempt.attemptNo, b.body.data.attempt.attemptNo].sort()).toEqual([1, 2]);
    const gold = a.body.data.result.drops.gold + b.body.data.result.drops.gold;
    const after = (await http.get('/api/v1/characters/current').set(as('p-carol'))).body.data;
    expect(after.gold).toBe(before.gold + gold);
    const items = await http.get('/api/v1/items?limit=100').set(as('p-carol')).expect(200);
    expect(items.body.meta.total).toBe(a.body.data.result.drops.items.length + b.body.data.result.drops.items.length);
  });

  it('สวม → ค่าที่คำนวณเปลี่ยน · ของคนอื่น → 403 · ไม่มีอยู่ → 404 · ย่อยของที่สวม → 409', async () => {
    const list = await http.get('/api/v1/items?page=1&limit=100').set(as('p-alice')).expect(200);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 100 });
    const item = list.body.data[0];
    const equipped = await http.patch(`/api/v1/items/${item.id}`).set(as('p-alice')).send({ equipped: true }).expect(200);
    expect(equipped.body.data.equipped).toBe(true);
    await http.patch(`/api/v1/items/${item.id}`).set(as('p-alice')).send({ equipped: true }).expect(409);
    const char = await http.get('/api/v1/characters/current').set(as('p-alice')).expect(200);
    expect(char.body.data.equipment[item.slot].id).toBe(item.id);

    await http.patch(`/api/v1/items/${item.id}`).set(as('p-bob')).send({ equipped: false }).expect(403);
    await http.delete(`/api/v1/items/${item.id}`).set(as('p-bob')).expect(403);
    await http.delete('/api/v1/items/99999999-9999-4999-8999-999999999999').set(as('p-alice')).expect(404);
    await http.delete('/api/v1/items/not-a-uuid').set(as('p-alice')).expect(400);
    await http.delete(`/api/v1/items/${item.id}`).set(as('p-alice')).expect(409);

    await http.patch(`/api/v1/items/${item.id}`).set(as('p-alice')).send({ equipped: false }).expect(200);
    const salvaged = await http.delete(`/api/v1/items/${item.id}`).set(as('p-alice')).expect(200);
    expect(salvaged.body.data).toMatchObject({ id: item.id, deleted: true });
  });

  it('ตีบวก: ทรัพยากรไม่พอ → 409 และไม่หักอะไร', async () => {
    const list = await http.get('/api/v1/items').set(as('p-alice')).expect(200);
    const before = (await http.get('/api/v1/characters/current').set(as('p-alice'))).body.data;
    let res = await http.post('/api/v1/item-upgrades').set(as('p-alice')).send({ itemId: list.body.data[0].id });
    while (res.status === 201) res = await http.post('/api/v1/item-upgrades').set(as('p-alice')).send({ itemId: list.body.data[0].id });
    expect(res.status).toBe(409);
    const after = (await http.get('/api/v1/characters/current').set(as('p-alice'))).body.data;
    expect(after.gold).toBeLessThanOrEqual(before.gold);
    expect(after.gold).toBeGreaterThanOrEqual(0);
    expect(after.materials).toBeGreaterThanOrEqual(0);
  });
});

describe('โปรแกรม', () => {
  it('บันทึกได้ (CRLF → LF) · ผิด → 400 VALIDATION_ERROR พร้อมเลขบรรทัด', async () => {
    const ok = await http.patch('/api/v1/programs/current').set(as('p-alice'))
      .send({ source: 'def turn():\r\n    attack(weakest(enemies))\r\n' }).expect(200);
    expect(ok.body.data.source).toBe('def turn():\n    attack(weakest(enemies))\n');
    const bad = await http.patch('/api/v1/programs/current').set(as('p-alice'))
      .send({ source: 'def turn():\n    atack(weakest(enemies))\n' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.details[0]).toMatch(/^2:\d+:NameError:/);
  });
});

describe('ภูมิภาค', () => {
  it('เข้า → ประกาศ · คนอื่นรบรอบของเรา → 403 · รบ → 201 · รบซ้ำ → 409 · ออก → 200 · ออกซ้ำ → 404', async () => {
    const regions = await http.get('/api/v1/regions').set(as('p-alice')).expect(200);
    expect(regions.body.data.find((r: { id: string }) => r.id === 'greenwood')).toMatchObject({ unlocked: true });
    await http.post('/api/v1/region-runs').set(as('p-alice')).send({ regionId: 'nowhere', depth: 1 }).expect(404);
    await http.post('/api/v1/region-runs').set(as('p-alice')).send({ regionId: 'haven', depth: 1 }).expect(400);
    await http.post('/api/v1/region-runs').set(as('p-alice')).send({ regionId: 'greenwood', depth: 4 }).expect(409);

    const run = await http.post('/api/v1/region-runs').set(as('p-alice')).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    expect(run.body.data).toMatchObject({ regionId: 'greenwood', depth: 1, floor: 1 });
    expect(Date.parse(run.body.data.expiresAt)).toBeGreaterThan(Date.now());

    await http.post('/api/v1/battles').set(as('p-bob')).send({ regionRunId: run.body.data.id }).expect(403);
    const [first, second] = await Promise.all([
      http.post('/api/v1/battles').set(as('p-alice')).send({ regionRunId: run.body.data.id }),
      http.post('/api/v1/battles').set(as('p-alice')).send({ regionRunId: run.body.data.id }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const won = first.status === 201 ? first : second;
    expect(won.body.data.announce.id).toBe(run.body.data.id);

    await http.delete(`/api/v1/region-runs/${run.body.data.id}`).set(as('p-alice')).expect(200);
    await http.delete(`/api/v1/region-runs/${run.body.data.id}`).set(as('p-alice')).expect(404);
    const history = await http.get('/api/v1/battles').set(as('p-alice')).expect(200);
    expect(history.body.data[0]).toMatchObject({ regionId: 'greenwood', depth: 1 });
  });

  it('สองคนในโซนเดียวกันช่วงเลเวลเดียวกัน → จับคู่สองทาง และทั้งคู่ได้บันทึกดวลชุดเดียวกัน', async () => {
    for (const [sub, name] of [['p-erin', 'erin'], ['p-frank', 'frank']]) {
      await http.post('/api/v1/characters').set(as(sub)).send({ displayName: name }).expect(201);
    }
    const e = await http.post('/api/v1/region-runs').set(as('p-erin')).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    const f = await http.post('/api/v1/region-runs').set(as('p-frank')).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    expect(f.body.data.duel).toMatchObject({ displayName: 'erin', live: true });
    const fe = await http.post('/api/v1/battles').set(as('p-erin')).send({ regionRunId: e.body.data.id }).expect(201);
    const ff = await http.post('/api/v1/battles').set(as('p-frank')).send({ regionRunId: f.body.data.id }).expect(201);
    expect(fe.body.data.duel.opponent.displayName).toBe('frank');
    expect(JSON.stringify(fe.body.data.duel.events)).toBe(JSON.stringify(ff.body.data.duel.events));
    expect(fe.body.data.duel.won).toBe(!ff.body.data.duel.won);
  });
});

describe('โจทย์ (D4)', () => {
  it('ผู้สอนสร้าง · ผู้เล่นอ่านได้แต่สร้างไม่ได้ · แก้ของคนอื่นไม่ได้ · admin แก้ได้', async () => {
    await http.post('/api/v1/challenges').set(as('p-alice')).send({ title: 'x' }).expect(403);
    const created = await http.post('/api/v1/challenges').set(as('t-one', 'staff'))
      .send({ title: 'ตั้งการ์ดเมื่อถูกหมายหัว', regionId: 'frostland' }).expect(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ coreUserId: 't-one', regionId: 'frostland' });
    await http.post('/api/v1/challenges').set(as('t-one', 'staff')).send({ title: 'y', starterSource: 'def turn(:\n' }).expect(400);
    await http.post('/api/v1/challenges').set(as('t-one', 'staff')).send({ title: '' }).expect(400);

    const list = await http.get('/api/v1/challenges?limit=1').set(as('p-alice')).expect(200);
    expect(list.body.meta).toMatchObject({ total: 1, limit: 1 });
    await http.get(`/api/v1/challenges/${id}`).set(as('p-alice')).expect(200);
    await http.patch(`/api/v1/challenges/${id}`).set(as('t-two', 'staff')).send({ title: 'ยึด' }).expect(403);
    await http.patch(`/api/v1/challenges/${id}`).set(as('a-one', 'admin')).send({ title: 'แก้โดยผู้ดูแล' }).expect(200);
    await http.delete(`/api/v1/challenges/${id}`).set(as('t-one', 'staff')).expect(200);
    await http.get(`/api/v1/challenges/${id}`).set(as('p-alice')).expect(404);
  });
});

describe('game-data', () => {
  it('ผู้สอนที่ไม่มีตัวละครอ่านชื่อภูมิภาคได้ (ฟอร์มโจทย์ใช้) ขณะที่ GET /regions ต้องมีตัวละคร', async () => {
    const gd = await http.get('/api/v1/game-data').set(as('t-three', 'staff')).expect(200);
    const regions = gd.body.data.regions as { id: string; nameTh: string; depths: number }[];
    expect(regions.length).toBeGreaterThan(1);
    expect(regions).toContainEqual(expect.objectContaining({ id: 'frostland', depths: expect.any(Number) }));
    await http.get('/api/v1/regions').set(as('t-three', 'staff')).expect(404);
  });
});

describe('SSO callback', () => {
  it('token ถูก → 200 + คุกกี้ HttpOnly SameSite=Lax อายุไม่เกิน exp · คุกกี้อย่างเดียวเข้า /me ได้', async () => {
    const res = await http.get('/auth/callback').query({ access_token: token('user-004', 'alumni'), state: 'xyz' }).expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^core_hub_access_token=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(Number(/Max-Age=(\d+)/.exec(cookie)![1])).toBeLessThanOrEqual(900);
    expect(res.body.data).toMatchObject({ id: 'user-004', coreRole: 'alumni', state: 'xyz' });
    const me = await http.get('/api/v1/me').set('Cookie', cookie.split(';')[0]).expect(200);
    expect(me.body.data.id).toBe('user-004');
  });

  it('token ปลอม → 401 และไม่มี Set-Cookie · ไม่มี token → 400', async () => {
    const res = await http.get('/auth/callback').query({ access_token: hub.unsigned('user-001', 'admin') }).expect(401);
    expect(res.headers['set-cookie']).toBeUndefined();
    await http.get('/auth/callback').expect(400);
  });
});

/**
 * ข้อที่การทดสอบแบบพยายามล้ม (ก.ย. 2026) เจอว่าตอบ 500 — ต้องไม่กลับมาอีก
 */
describe('regression: คำขอพร้อมกันและอินพุตผิดปกติ', () => {
  const player = async (sub: string) => {
    await http.post('/api/v1/characters').set(as(sub)).send({ displayName: sub.replace(/-/g, '_') });
    return sub;
  };

  it('หลายคนเข้าโซนพร้อมกันซ้ำ ๆ ข้ามภูมิภาค → ไม่มี deadlock / 500 · คนละคนได้ 201 เสมอ', async () => {
    const [a, b, c] = [await player('r-dl-a'), await player('r-dl-b'), await player('r-dl-c')];
    const distinct: number[] = [];
    const sameUser: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await Promise.all([
        http.post('/api/v1/region-runs').set(as(a)).send({ regionId: i % 2 ? 'tower' : 'greenwood', depth: 1 }),
        http.post('/api/v1/region-runs').set(as(b)).send({ regionId: i % 2 ? 'greenwood' : 'tower', depth: 1 }),
        http.post('/api/v1/region-runs').set(as(c)).send({ regionId: 'greenwood', depth: 1 }),
        http.post('/api/v1/region-runs').set(as(a)).send({ regionId: 'tower', depth: 1 }),
      ]);
      distinct.push(res[1].status, res[2].status);
      sameUser.push(res[0].status, res[3].status);
    }
    expect(new Set(distinct)).toEqual(new Set([201]));
    // คนเดียวกดเข้าซ้อนกัน: อย่างน้อยหนึ่งคำขอสำเร็จ อีกคำขอได้ 201 หรือ 409 — ไม่มี 500
    expect(sameUser.every((s) => s === 201 || s === 409)).toBe(true);
    const ok = await http.post('/api/v1/region-runs').set(as(a)).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    expect(ok.body.data.regionId).toBe('greenwood');
  });

  it('โปรแกรมที่เป็นสายยาว (1+1+… เกือบ 20,000 ตัวอักษร) → 400 ไม่ใช่ 500', async () => {
    const a = await player('r-chain');
    const source = `def turn():\n    attack(${Array(9900).fill('1').join('+')})\n`;
    const res = await http.patch('/api/v1/programs/current').set(as(a)).send({ source }).expect(400);
    expect(res.body.error.details[0]).toMatch(/SyntaxError/);
    await http.post('/api/v1/challenges').set(as('t-chain', 'staff')).send({ title: 'สายยาว', starterSource: source }).expect(400);
  });

  it('สองคนกดเข้าโซนเดียวกันพร้อมกันเป๊ะ → ยังจับคู่ดวลกันได้ (ไม่หายเพราะมองไม่เห็นกัน)', async () => {
    let paired = 0;
    for (let i = 0; i < 6; i++) {
      const [x, y] = [await player(`r-sim-x${i}`), await player(`r-sim-y${i}`)];
      const [rx, ry] = await Promise.all([
        http.post('/api/v1/region-runs').set(as(x)).send({ regionId: 'isles', depth: 1 }),
        http.post('/api/v1/region-runs').set(as(y)).send({ regionId: 'isles', depth: 1 }),
      ]);
      // isles ยังไม่ปลดล็อกสำหรับตัวละครใหม่ → ใช้ greenwood ถ้าถูกปฏิเสธ
      const [gx, gy] = rx.status === 201 ? [rx, ry] : await Promise.all([
        http.post('/api/v1/region-runs').set(as(x)).send({ regionId: 'greenwood', depth: 1 }),
        http.post('/api/v1/region-runs').set(as(y)).send({ regionId: 'greenwood', depth: 1 }),
      ]);
      expect([gx.status, gy.status]).toEqual([201, 201]);
      if (gx.body.data.duel?.live || gy.body.data.duel?.live) paired += 1;
      await http.delete(`/api/v1/region-runs/${gx.body.data.id}`).set(as(x));
      await http.delete(`/api/v1/region-runs/${gy.body.data.id}`).set(as(y));
    }
    expect(paired).toBe(6);
  });

  it('ออกจากรอบเดียวกันพร้อมกัน 10 คำขอ → 200 หนึ่งครั้ง ที่เหลือ 404', async () => {
    const a = await player('r-leave');
    const run = await http.post('/api/v1/region-runs').set(as(a)).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    const res = await Promise.all(Array.from({ length: 10 }, () => http.delete(`/api/v1/region-runs/${run.body.data.id}`).set(as(a))));
    expect(res.map((r) => r.status).sort()).toEqual([200, ...Array(9).fill(404)]);
  });

  it('ลบ/แก้โจทย์เดียวกันพร้อมกัน → 200 หนึ่งครั้ง ที่เหลือ 404', async () => {
    const created = await http.post('/api/v1/challenges').set(as('t-race', 'staff')).send({ title: 'แข่งกันลบ' }).expect(201);
    const id = created.body.data.id;
    const res = await Promise.all([
      ...Array.from({ length: 5 }, () => http.delete(`/api/v1/challenges/${id}`).set(as('t-race', 'staff'))),
      ...Array.from({ length: 5 }, () => http.patch(`/api/v1/challenges/${id}`).set(as('t-race', 'staff')).send({ title: 'x' })),
    ]);
    const statuses = res.map((r) => r.status);
    expect(statuses.filter((s) => s >= 500)).toEqual([]);
    expect(res.slice(0, 5).filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('อินพุตผิดปกติ → 400 envelope ไม่ใช่ 500', async () => {
    const a = await player('r-input');
    const deep = `def turn():\n    attack(${'('.repeat(1000)}weakest(enemies)${')'.repeat(1000)})\n`;
    const cases = [
      http.post('/api/v1/battles').set(as(a)).send({ towerFloor: null }),
      http.post('/api/v1/battles').set(as(a)).send({ regionRunId: null }),
      http.patch('/api/v1/programs/current').set(as(a)).send({ source: deep }),
      http.patch('/api/v1/programs/current').set(as(a)).send({ source: 'def turn():\n    defend()\n# \u0000\n' }),
      http.get('/api/v1/items?page=1e308').set(as(a)),
      http.patch('/api/v1/programs/current').set(as(a)).set('Content-Type', 'application/json').send(JSON.stringify({ source: '#'.repeat(200_000) })),
    ];
    for (const res of await Promise.all(cases)) {
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(['BAD_REQUEST', 'VALIDATION_ERROR']).toContain(res.body.error.code);
    }
  });
});

