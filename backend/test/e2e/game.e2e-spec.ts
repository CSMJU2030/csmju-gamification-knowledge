/**
 * e2e ทั้งเส้นทาง: Core Hub (จำลอง) → token → guard → service → Prisma → PostgreSQL จริง
 *
 * ต้องตั้ง TEST_DATABASE_URL ให้ชี้ฐานข้อมูลที่ลบทิ้งได้ (ทุกครั้งที่รันจะล้าง schema public)
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/code_tower_test pnpm --filter backend test:e2e
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FORMULAS, allocatePoints, gamedata } from '@tower/engine';
import { FakeCoreHub, testEnv, type CoreRoleClaim } from '../support/fake-core-hub';
import { insertItems, queryRows, resetDatabase } from '../support/test-db';

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
    expect(res.body).toEqual({ success: true, data: { status: 'ok', service: 'csmju-gamification-knowledge' } });
  });

  it('ไม่มี token → 401 · token ถูก → /me คืนตัวตนจาก claim', async () => {
    await http.get('/api/v1/me').expect(401);
    const res = await http.get('/api/v1/me').set(as('user-002')).expect(200);
    expect(res.body.data).toMatchObject({ id: 'user-002', coreRole: 'student', subsystemRole: 'PLAYER' });
  });

  it('endpoint ที่ไม่มี → 404 envelope · ไม่มี login/logout ของตัวเอง (auth-contract ข้อ 9)', async () => {
    const res = await http.post('/api/v1/auth/login').set(as('user-002')).send({ email: 'x', password: 'y' }).expect(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    // ปุ่มออกจากระบบแค่พาไปหน้าแรกของ Core Hub — route ลบคุกกี้เดิมถูกถอดแล้ว
    const gone = await http.delete('/api/v1/sessions/current').set(as('user-002')).expect(404);
    expect(gone.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('ตัวละคร', () => {
  it('มีรหัสใน Core Hub → ชื่อในเกมคือรหัส (ไม่สนชื่อที่ส่งมา) · เรียก /people/me ด้วย token ของผู้ใช้คนนั้น · เก็บ person_code', async () => {
    hub.people.set('p-std', '6504101234');
    await http.get('/api/v1/characters/current').set(as('p-std')).expect(404);
    const token = hub.sign('p-std', 'student');
    const created = await http.post('/api/v1/characters').set('Authorization', `Bearer ${token}`).send({ displayName: 'ชื่อที่ไม่ใช้' }).expect(201);
    expect(created.body.data).toMatchObject({ displayName: '6504101234', classId: 'novice', level: 1, gold: 100 });
    expect(hub.lastPeopleAuthorization).toBe(`Bearer ${token}`);
    const rows = await queryRows(DB!, 'SELECT person_code, display_name FROM characters WHERE core_user_id = $1', ['p-std']);
    expect(rows[0]).toEqual({ person_code: '6504101234', display_name: '6504101234' });

    // อีกบัญชีของคนเดียวกัน (รหัสเดียวกัน) → 409 · บัญชีเดิมสร้างซ้ำ → 409 โดยไม่เรียก Core Hub
    hub.people.set('p-std-sso', '6504101234');
    const dup = await http.post('/api/v1/characters').set(as('p-std-sso')).send({}).expect(409);
    expect(dup.body.error.message).toContain('รหัสนี้มีตัวละครอยู่แล้ว');
    const hits = hub.peopleHits;
    await http.post('/api/v1/characters').set(as('p-std')).send({}).expect(409);
    expect(hub.peopleHits).toBe(hits);

    // บุคลากร: รหัสคือส่วนหน้าอีเมลมหาวิทยาลัย
    hub.people.set('p-lec', 'somchai.j');
    const lec = await http.post('/api/v1/characters').set(as('p-lec', 'lecturer')).send({}).expect(201);
    expect(lec.body.data.displayName).toBe('somchai.j');
  });

  it('ไม่มีรหัสใน Core Hub → 400 ให้ตั้งชื่อเอง · ชื่อต้องมีอักษรไทย (ไม่ปลอมเป็นรหัส) · ซ้ำ → 409 · ผิดรูป → 400', async () => {
    const none = await http.post('/api/v1/characters').set(as('p-alice')).send({}).expect(400);
    expect(none.body.error.code).toBe('VALIDATION_ERROR');
    expect(none.body.error.details[0]).toMatch(/^displayName: /);
    for (const fake of ['alice', '6504101234', 'somchai_j']) {
      const res = await http.post('/api/v1/characters').set(as('p-alice')).send({ displayName: fake }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const created = await http.post('/api/v1/characters').set(as('p-alice')).send({ displayName: 'อลิซ' }).expect(201);
    expect(created.body.data).toMatchObject({ displayName: 'อลิซ', classId: 'novice', level: 1, gold: 100 });
    const rows = await queryRows(DB!, 'SELECT person_code FROM characters WHERE core_user_id = $1', ['p-alice']);
    expect(rows[0].person_code).toBeNull();
    await http.post('/api/v1/characters').set(as('p-alice')).send({ displayName: 'อลิซ2' }).expect(409);
    await http.post('/api/v1/characters').set(as('p-bob')).send({ displayName: 'อลิซ' }).expect(409);
    const bad = await http.post('/api/v1/characters').set(as('p-bob')).send({ displayName: 'อ' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await http.post('/api/v1/characters').set(as('p-bob')).send({ displayName: 'บ๊อบ_01' }).expect(201);
  });

  it('Core Hub ล่ม/จำกัดอัตรา → 503 + Retry-After · session จบที่ Core Hub → 401 · ทุกกรณีไม่สร้างตัวละคร', async () => {
    hub.people.set('p-down', '6504109999');
    try {
      hub.peopleStatus = 502;
      const down = await http.post('/api/v1/characters').set(as('p-down')).send({}).expect(503);
      expect(down.body).toMatchObject({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      expect(down.headers['retry-after']).toBe('30');

      hub.peopleStatus = 429;
      hub.peopleRetryAfter = '7';
      const busy = await http.post('/api/v1/characters').set(as('p-down')).send({}).expect(503);
      expect(busy.headers['retry-after']).toBe('7');

      hub.peopleStatus = 401;
      hub.peopleRetryAfter = null;
      const ended = await http.post('/api/v1/characters').set(as('p-down')).send({}).expect(401);
      expect(ended.body.error.code).toBe('UNAUTHORIZED');
    } finally {
      hub.peopleStatus = null;
      hub.peopleRetryAfter = null;
    }
    await http.get('/api/v1/characters/current').set(as('p-down')).expect(404);
  });

  it('เลือกอาชีพก่อนผ่านชั้น 1 → 409 · อาชีพที่ไม่มี → 400', async () => {
    await http.patch('/api/v1/characters/current').set(as('p-alice')).send({ classId: 'warrior' }).expect(409);
    await http.patch('/api/v1/characters/current').set(as('p-alice')).send({ classId: 'novice' }).expect(400);
  });

  it('playtest รอบ B: ดูตัวอย่างอาชีพได้ก่อนเลือก (ไม่บันทึก) · อาชีพผิด → 400 · เลือกแล้ว → 409', async () => {
    await http.post('/api/v1/characters').set(as('p-trial')).send({ displayName: 'ทดลองอาชีพ' }).expect(201);
    const before = (await http.get('/api/v1/characters/current').set(as('p-trial'))).body.data;
    const res = await http.post('/api/v1/characters/current/class-trials').set(as('p-trial')).send({ classId: 'mage' }).expect(200);
    const t = res.body.data;
    expect(t).toMatchObject({ classId: 'mage', level: 1, floor: 1, waves: 3, skills: ['m_firebolt'] });
    expect(t.program).toContain('cast("firebolt"');
    expect(t.result.events.some((e: { actorId: string; skillId?: string }) => e.actorId === 'p1' && e.skillId === 'm_firebolt')).toBe(true);
    expect(t.summary.skillCasts).toBeGreaterThan(0);
    // ไม่บันทึกอะไร: ตัวละครเหมือนเดิมทุกค่า และไม่มีบันทึกการรบเพิ่ม
    const after = (await http.get('/api/v1/characters/current').set(as('p-trial'))).body.data;
    expect(after).toEqual(before);
    expect((await http.get('/api/v1/battles').set(as('p-trial'))).body.meta.total).toBe(0);

    const bad = await http.post('/api/v1/characters/current/class-trials').set(as('p-trial')).send({ classId: 'novice' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    // ผ่านชั้น 1 แล้วเลือกอาชีพ → ดูตัวอย่างไม่ได้แล้ว
    let won = false;
    for (let i = 0; i < 6 && !won; i++) {
      won = (await http.post('/api/v1/battles').set(as('p-trial')).send({ towerFloor: 1 }).expect(201)).body.data.result.victory;
    }
    expect(won).toBe(true);
    await http.patch('/api/v1/characters/current').set(as('p-trial')).send({ classId: 'warrior' }).expect(200);
    await http.post('/api/v1/characters/current/class-trials').set(as('p-trial')).send({ classId: 'mage' }).expect(409);
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
    await http.post('/api/v1/characters').set(as('p-attempt')).send({ displayName: 'นับครั้ง' }).expect(201);
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
    await http.post('/api/v1/characters').set(as('p-carol')).send({ displayName: 'แครอล' }).expect(201);
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
    // ผู้เล่นสองคนที่มีรหัสใน Core Hub — คู่ดวลเห็นรหัสของอีกฝ่ายเป็นชื่อ
    for (const [sub, code] of [['p-erin', '6504100001'], ['p-frank', '6504100002']]) {
      hub.people.set(sub, code);
      await http.post('/api/v1/characters').set(as(sub)).send({}).expect(201);
    }
    const e = await http.post('/api/v1/region-runs').set(as('p-erin')).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    const f = await http.post('/api/v1/region-runs').set(as('p-frank')).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    expect(f.body.data.duel).toMatchObject({ displayName: '6504100001', live: true });
    const fe = await http.post('/api/v1/battles').set(as('p-erin')).send({ regionRunId: e.body.data.id }).expect(201);
    const ff = await http.post('/api/v1/battles').set(as('p-frank')).send({ regionRunId: f.body.data.id }).expect(201);
    expect(fe.body.data.duel.opponent.displayName).toBe('6504100002');
    expect(JSON.stringify(fe.body.data.duel.events)).toBe(JSON.stringify(ff.body.data.duel.events));
    expect(fe.body.data.duel.won).toBe(!ff.body.data.duel.won);
  });
});

describe('สกิลประจำภูมิภาค (8 ต.ค. 2569 · ระยะ S1)', () => {
  const MARKED = 'def turn():\n    if has_debuff("marked"):\n        defend()\n    else:\n        attack(weakest(enemies))\n';
  type Proof = { eligible: boolean; passed: boolean; newlyProved: boolean; checks: { code: string; ok: boolean }[]; skill: { id: string } | null };
  type Outcome = { proof: Proof; character: { skills: { id: string; region?: string }[] } };
  let code = 6504109000;
  /** ตัวละครใหม่ที่มีรหัสใน Core Hub (ชื่อในเกม = รหัส) */
  const create = async (sub: string) => {
    hub.people.set(sub, String(code++));
    await http.post('/api/v1/characters').set(as(sub)).send({}).expect(201);
  };

  /** ผู้พิทักษ์เลเวล 10 สเตตัสแจกตามน้ำหนักมาตรฐาน (เหมือน tools/proofprobe.cjs) · ผ่านชั้น 4 · ป่าเคลียร์ถึงรอบ 3 */
  async function readyGuardian(sub: string) {
    await create(sub);
    const stats = { ...gamedata.classes.guardian.baseStats };
    for (let l = 2; l <= 10; l++) {
      const g = allocatePoints({ str: 0, int: 0, vit: 0, agi: 0, luk: 0 }, FORMULAS.statPointsPerLevel, 'guardian', l);
      for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] += g[k];
    }
    const [row] = await queryRows<{ id: string }>(DB!,
      `UPDATE characters SET class_id = 'guardian', level = 10, highest_floor = 4, program_source = $2,
         stat_str = $3, stat_int = $4, stat_vit = $5, stat_agi = $6, stat_luk = $7
       WHERE core_user_id = $1 RETURNING id`,
      [sub, MARKED, stats.str, stats.int, stats.vit, stats.agi, stats.luk]);
    await queryRows(DB!,
      `INSERT INTO region_progress (id, character_id, region_id, depth_cleared, updated_at)
       VALUES (gen_random_uuid(), $1, 'greenwood', 3, now())`, [row.id]);
  }

  async function deepestGreenwood(sub: string): Promise<{ proof: Proof; body: Outcome }> {
    const run = await http.post('/api/v1/region-runs').set(as(sub)).send({ regionId: 'greenwood', depth: 4 }).expect(201);
    const res = await http.post('/api/v1/battles').set(as(sub)).send({ regionRunId: run.body.data.id }).expect(201);
    return { proof: res.body.data.proof, body: res.body.data };
  }

  it('แผนที่บอกเงื่อนไขและสกิล · หอคอยกับเมืองไม่มี · ผู้ฝึกหัดยังไม่มีสกิลให้ดู', async () => {
    await create('p-map');
    const regions = (await http.get('/api/v1/regions?limit=20').set(as('p-map')).expect(200)).body.data as { id: string; proof: unknown }[];
    const byId = new Map(regions.map((r) => [r.id, r.proof]));
    expect(byId.get('tower')).toBeNull();
    expect(byId.get('haven')).toBeNull();
    expect(byId.get('greenwood')).toMatchObject({ proved: false, skill: null });
    expect((byId.get('greenwood') as { requirementsTh: string[] }).requirementsTh[0]).toBe('ชนะรอบลึกสุดของภูมิภาค');
  });

  it('ชนะรอบลึกสุดตามบทเรียน → ได้สกิลครั้งเดียว · ใช้ในโปรแกรมได้ทันที · รอบฝึกไม่นับ', async () => {
    await readyGuardian('p-prove');
    const before = await http.get('/api/v1/programs/current').set(as('p-prove')).expect(200);
    expect(before.body.data.availableSkills.map((s: { id: string }) => s.id)).not.toContain('g_iron_guard');
    const saveCast = () => http.patch('/api/v1/programs/current').set(as('p-prove'))
      .send({ source: 'def turn():\n    cast("iron_guard", me)\n    attack(weakest(enemies))\n' });
    expect((await saveCast().expect(400)).body.error.details.join(' ')).toContain('ได้จากการพิสูจน์บทเรียนของป่าเริ่มต้น');

    // seed ของรอบคิดจากเวลาเข้า — ผู้พิทักษ์เลเวล 10 อ่านท่า ผ่าน 20/20 ใน proofprobe จึงลองไม่เกิน 4 รอบ
    let first: { proof: Proof; body: Outcome } | null = null;
    for (let i = 0; i < 4 && !first; i++) {
      const r = await deepestGreenwood('p-prove');
      expect(r.proof).toMatchObject({ eligible: true, skill: { id: 'g_iron_guard', nameTh: 'การ์ดเหล็ก' } });
      if (r.proof.passed) first = r;
    }
    expect(first).not.toBeNull();
    expect(first!.proof.newlyProved).toBe(true);
    expect(first!.body.character.skills).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'g_iron_guard', region: 'greenwood' })]));

    const after = await http.get('/api/v1/programs/current').set(as('p-prove')).expect(200);
    expect(after.body.data.availableSkills.map((s: { id: string }) => s.id)).toContain('g_iron_guard');
    await saveCast().expect(200);
    await http.patch('/api/v1/programs/current').set(as('p-prove')).send({ source: MARKED }).expect(200);

    // ผ่านซ้ำไม่ได้ซ้ำ · ในฐานข้อมูลมีครั้งเดียว
    let again: Proof | null = null;
    for (let i = 0; i < 4 && !again; i++) {
      const r = await deepestGreenwood('p-prove');
      if (r.proof.passed) again = r.proof;
    }
    expect(again).toMatchObject({ passed: true, newlyProved: false });
    const rows = await queryRows<{ proved_regions: string[] }>(DB!, 'SELECT proved_regions FROM characters WHERE core_user_id = $1', ['p-prove']);
    expect(rows[0].proved_regions).toEqual(['greenwood']);

    // รอบที่ไม่ใช่รอบลึกสุด: ตรวจให้ดู แต่ไม่นับ
    const run = await http.post('/api/v1/region-runs').set(as('p-prove')).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    const practice = await http.post('/api/v1/battles').set(as('p-prove')).send({ regionRunId: run.body.data.id }).expect(201);
    expect(practice.body.data.proof).toMatchObject({ eligible: false, passed: false, newlyProved: false });

    const map = (await http.get('/api/v1/regions?limit=20').set(as('p-prove')).expect(200)).body.data as { id: string; proof: unknown }[];
    expect(map.find((r) => r.id === 'greenwood')!.proof).toMatchObject({ proved: true, skill: { id: 'g_iron_guard' } });
  });

  it('ตีอย่างเดียวชนะรอบลึกสุดได้แต่ไม่ได้สกิล · หอคอยไม่มีผลพิสูจน์', async () => {
    await readyGuardian('p-naive');
    await queryRows(DB!, "UPDATE characters SET level = 14 WHERE core_user_id = $1", ['p-naive']);
    await http.patch('/api/v1/programs/current').set(as('p-naive')).send({ source: 'def turn():\n    attack(weakest(enemies))\n' }).expect(200);
    for (let i = 0; i < 2; i++) {
      const { proof } = await deepestGreenwood('p-naive');
      expect(proof).toMatchObject({ passed: false, newlyProved: false });
    }
    const tower = await http.post('/api/v1/battles').set(as('p-naive')).send({ towerFloor: 1 }).expect(201);
    expect(tower.body.data.proof).toBeUndefined();
    const rows = await queryRows<{ proved_regions: string[] }>(DB!, 'SELECT proved_regions FROM characters WHERE core_user_id = $1', ['p-naive']);
    expect(rows[0].proved_regions).toEqual([]);
  });

  it('ผู้ฝึกหัดที่พิสูจน์ไว้ก่อน ได้สกิลของอาชีพที่เลือกทีหลังทันที', async () => {
    await create('p-late');
    await queryRows(DB!, "UPDATE characters SET highest_floor = 1, proved_regions = '{greenwood}' WHERE core_user_id = $1", ['p-late']);
    const before = await http.get('/api/v1/characters/current').set(as('p-late')).expect(200);
    expect(before.body.data.skills).toEqual([]);
    const chosen = await http.patch('/api/v1/characters/current').set(as('p-late')).send({ classId: 'mage' }).expect(200);
    expect(chosen.body.data.skills.map((s: { id: string }) => s.id)).toEqual(['m_firebolt', 'm_mana_veil']);
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

describe('SSO 1.1 — /auth/login · /auth/callback · /auth/logout (auth-contract ข้อ 5 · 7)', () => {
  const SESSION = 'csmju_gamification_knowledge_access_token';
  const STATE = 'csmju_gamification_knowledge_sso_state';
  const cookies = (res: request.Response): string[] => {
    const raw = res.headers['set-cookie'] as unknown;
    return Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  };
  const cookieNamed = (res: request.Response, name: string) => cookies(res).find((c) => c.startsWith(`${name}=`));
  const setsSession = (res: request.Response) => {
    const c = cookieNamed(res, SESSION);
    return c !== undefined && !/Max-Age=0\b/i.test(c);
  };

  /** เริ่ม sign-in แบบเบราว์เซอร์: /auth/login → อ่าน state จาก Location และคุกกี้ state */
  async function begin(next?: string) {
    const res = await http.get('/auth/login').query(next === undefined ? {} : { next }).expect(302);
    const location = new URL(res.headers.location as string);
    const stateCookie = cookieNamed(res, STATE)!;
    return { res, location, state: location.searchParams.get('state')!, cookie: stateCookie.split(';')[0] };
  }
  /** ขาเข้า callback แบบที่เว็บ Core Hub ส่งกลับมา */
  const callback = (query: Record<string, string>, cookie?: string) => {
    const req = http.get('/auth/callback').query(query);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('login → 302 ไปเว็บ Core Hub /sso/authorize พร้อม subsystem และ state · ไม่ส่ง callback_url · คุกกี้ state HttpOnly Lax Path=/auth/callback ≤ 600 วินาที', async () => {
    const { res, location, state } = await begin('/items');
    expect(`${location.origin}${location.pathname}`).toBe('http://localhost:3100/sso/authorize');
    expect(location.searchParams.get('subsystem')).toBe('csmju-gamification-knowledge');
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.has('callback_url')).toBe(false);
    expect(res.headers['cache-control']).toBe('no-store');
    const c = cookieNamed(res, STATE)!;
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Path=\/auth\/callback/);
    expect(Number(/Max-Age=(\d+)/.exec(c)![1])).toBeGreaterThan(0);
    expect(Number(/Max-Age=(\d+)/.exec(c)![1])).toBeLessThanOrEqual(600);
    expect(c.split(';')[0]).toMatch(new RegExp(`^${STATE}=${state}\\.`));
    // สองรอบได้ state ไม่ซ้ำกัน
    expect((await begin()).state).not.toBe(state);
  });

  it('callback ครบขั้น → 302 ไปหน้า next · คุกกี้ session HttpOnly Lax Path=/ อายุไม่เกิน exp · no-store + no-referrer · เผาคุกกี้ state · คุกกี้อย่างเดียวเข้า /me ได้พร้อม session.expiresAt', async () => {
    const login = await begin('/items?q=ดาบ');
    const res = await callback({ access_token: token('user-004', 'alumni'), token_type: 'Bearer', expires_in: '900', state: login.state }, login.cookie).expect(302);
    expect(res.headers.location).toBe('/items?q=%E0%B8%94%E0%B8%B2%E0%B8%9A');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    const session = cookieNamed(res, SESSION)!;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).toMatch(/Path=\/(;|$)/);
    expect(Number(/Max-Age=(\d+)/.exec(session)![1])).toBeLessThanOrEqual(900);
    expect(cookieNamed(res, STATE)).toMatch(/Max-Age=0/);
    const me = await http.get('/api/v1/me').set('Cookie', session.split(';')[0]).expect(200);
    expect(me.body.data).toMatchObject({ id: 'user-004', coreRole: 'alumni', subsystemRole: 'PLAYER' });
    const expiresAt = Date.parse(me.body.data.session.expiresAt);
    expect(expiresAt - Date.now()).toBeGreaterThan(800_000);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(900_000);
  });

  it('ไม่มี state (กดจากเมนูของ Core Hub) → ทิ้ง token · 302 /auth/login · ไม่มี Set-Cookie ใด ๆ แม้แต่คุกกี้ state', async () => {
    const login = await begin();
    const res = await callback({ access_token: token('user-002') }, login.cookie).expect(302);
    expect(res.headers.location).toBe('/auth/login');
    expect(cookies(res)).toEqual([]);
  });

  it('มี state แต่ไม่มีคุกกี้ state → 401 ไม่ redirect · state ของรอบหนึ่งกับคุกกี้อีกรอบ → 401 · ทั้งสองไม่มีคุกกี้ session', async () => {
    const orphan = await begin();
    const noCookie = await callback({ access_token: token('user-002'), state: orphan.state }).expect(401);
    expect(noCookie.headers.location).toBeUndefined();
    expect(noCookie.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    expect(setsSession(noCookie)).toBe(false);

    const first = await begin();
    const second = await begin();
    const crossed = await callback({ access_token: token('user-002'), state: first.state }, second.cookie).expect(401);
    expect(setsSession(crossed)).toBe(false);
    expect(cookieNamed(crossed, STATE)).toMatch(/Max-Age=0/);
  });

  it('state ใช้ได้ครั้งเดียว — คุกกี้ถูกเผาแล้ว ส่งซ้ำด้วยคุกกี้เดิมยังตรงแต่เบราว์เซอร์จริงจะไม่มีคุกกี้แล้ว', async () => {
    const login = await begin();
    const ok = await callback({ access_token: token('user-002'), state: login.state }, login.cookie).expect(302);
    expect(cookieNamed(ok, STATE)).toMatch(/Max-Age=0/);
    // เบราว์เซอร์ลบคุกกี้ state ตาม Max-Age=0 แล้ว — รอบสองจึงไม่มีคุกกี้ → 401
    await callback({ access_token: token('user-002'), state: login.state }).expect(401);
  });

  it('token ปลอม (state ถูก) → 401 · role ที่ระบบไม่รับ → 403 · ไม่มี token → 400 · ทุกกรณีไม่มีคุกกี้ session', async () => {
    const forged = await begin();
    const bad = await callback({ access_token: hub.unsigned('user-001', 'admin'), state: forged.state }, forged.cookie).expect(401);
    expect(setsSession(bad)).toBe(false);

    const guest = await begin();
    const denied = await callback({ access_token: token('user-003', 'guest'), state: guest.state }, guest.cookie).expect(403);
    expect(setsSession(denied)).toBe(false);

    const missing = await http.get('/auth/callback').expect(400);
    expect(setsSession(missing)).toBe(false);
  });

  it('สัญญา 1.2: token อายุยาวแบบ refresh token หรือ azp ของระบบอื่น (state ถูก) → 401 ไม่มีคุกกี้ session', async () => {
    const t = Math.floor(Date.now() / 1000);
    for (const payload of [{ iat: t, exp: t + 7 * 24 * 3600 }, { azp: 'csmju-equipment' }]) {
      const login = await begin();
      const res = await callback({ access_token: hub.sign('user-002', 'student', { payload }), state: login.state }, login.cookie).expect(401);
      expect(setsSession(res)).toBe(false);
    }
    const own = await begin('/world');
    await callback({ access_token: hub.sign('user-002', 'student', { payload: { azp: 'csmju-gamification-knowledge' } }), state: own.state }, own.cookie)
      .expect(302)
      .expect('Location', '/world');
  });

  it('เบราว์เซอร์ (Accept text/html): state ไม่ตรง/ไม่มีคุกกี้ → 401 หน้า HTML พร้อมปุ่ม "เข้าสู่ระบบอีกครั้ง" ไป /auth/login · ไม่สะท้อน query · ไม่มีคุกกี้ session', async () => {
    const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    const orphan = await begin();
    const page = await callback({ access_token: token('user-002'), state: orphan.state }).set('Accept', accept).expect(401);
    expect(page.headers['content-type']).toMatch(/^text\/html; charset=utf-8/);
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.text).toContain('เข้าสู่ระบบอีกครั้ง');
    expect(page.text).toContain('href="/auth/login"');
    expect(page.text).not.toContain(orphan.state);
    expect(page.text).not.toContain('eyJ');
    expect(page.text).not.toMatch(/<script/i);
    expect(setsSession(page)).toBe(false);

    const first = await begin();
    const second = await begin();
    const crossed = await callback({ access_token: token('user-002'), state: first.state }, second.cookie).set('Accept', accept).expect(401);
    expect(crossed.text).toContain('href="/auth/login"');
    expect(cookieNamed(crossed, STATE)).toMatch(/Max-Age=0/);

    // role ที่ระบบไม่รับ → 403 หน้าบอกว่าไม่มีสิทธิ์ พร้อมลิงก์กลับหน้าหลักของ Core Hub
    const guest = await begin();
    const denied = await callback({ access_token: token('user-003', 'guest'), state: guest.state }, guest.cookie).set('Accept', accept).expect(403);
    expect(denied.text).toContain('บัญชีของคุณไม่มีสิทธิ์เข้าระบบนี้');
    expect(denied.text).toContain('href="http://localhost:3100/"');
    expect(setsSession(denied)).toBe(false);

    // script และ conformance (Accept: application/json) ยังได้ JSON envelope เหมือนเดิม
    const json = await callback({ access_token: token('user-002'), state: (await begin()).state }).set('Accept', 'application/json').expect(401);
    expect(json.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('core role ใหม่: lecturer → INSTRUCTOR สร้างโจทย์ได้ · guest → 403 FORBIDDEN (conformance L1-28/L1-29)', async () => {
    const me = await http.get('/api/v1/me').set(as('user-lec', 'lecturer')).expect(200);
    expect(me.body.data).toMatchObject({ id: 'user-lec', coreRole: 'lecturer', subsystemRole: 'INSTRUCTOR' });
    const created = await http.post('/api/v1/challenges').set(as('user-lec', 'lecturer')).send({ title: 'โจทย์ของอาจารย์' }).expect(201);
    await http.delete(`/api/v1/challenges/${created.body.data.id}`).set(as('user-lec', 'lecturer')).expect(200);

    const guest = await http.get('/api/v1/me').set(as('user-guest', 'guest')).expect(403);
    expect(guest.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('next=//evil.example.com และ /auth/logout → ลงที่หน้าแรกของระบบเอง (กัน open redirect)', async () => {
    for (const next of ['//evil.example.com', '/auth/logout', 'https://evil.example.com/']) {
      const login = await begin(next);
      const res = await callback({ access_token: token('user-002'), state: login.state }, login.cookie).expect(302);
      expect(res.headers.location).toBe('/');
    }
  });

  it('POST /auth/logout → 303 ไปหน้า /logout ของเว็บ Core Hub · ลบคุกกี้ทั้งสองด้วย Max-Age=0 และ Path เดิม · no-store', async () => {
    const res = await http.post('/auth/logout').expect(303);
    expect(res.headers.location).toBe('http://localhost:3100/logout');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(cookieNamed(res, SESSION)).toMatch(/^[^=]+=;.*Max-Age=0.*Path=\/(;|$)/);
    expect(cookieNamed(res, STATE)).toMatch(/Max-Age=0.*Path=\/auth\/callback/);
  });

  it('401 ของ API เป็น JSON เสมอ ไม่ redirect ไป login (ข้อ 7)', async () => {
    const res = await http.get('/api/v1/me').expect(401);
    expect(res.headers.location).toBeUndefined();
    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });
});

/**
 * ข้อที่การทดสอบแบบพยายามล้ม (ก.ย. 2026) เจอว่าตอบ 500 — ต้องไม่กลับมาอีก
 */
describe('regression: คำขอพร้อมกันและอินพุตผิดปกติ', () => {
  const player = async (sub: string) => {
    await http.post('/api/v1/characters').set(as(sub)).send({ displayName: `ทดสอบ_${sub.replace(/-/g, '_')}` });
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

describe('ค้นหาในตาราง (?q= · ui-design-system ข้อ 8.2)', () => {
  it('กระเป๋า: q ค้นในชื่อไอเทม · ไม่พบ → data [] total 0 · ช่องว่างล้วน = ไม่กรอง · แบ่งหน้าตามผลที่กรองแล้ว', async () => {
    await http.post('/api/v1/characters').set(as('p-find')).send({ displayName: 'นักค้นหา' }).expect(201);
    const me = (await http.get('/api/v1/characters/current').set(as('p-find'))).body.data;
    await insertItems(DB!, me.id, [
      { baseId: 'sword', slot: 'weapon' },
      { baseId: 'staff', slot: 'weapon' },
      { baseId: 'plate', slot: 'armor' },
      { baseId: 'helm', slot: 'helmet' },
      { baseId: 'ring', slot: 'accessory' },
    ]);
    const names = async (q: string, extra = '') =>
      (await http.get(`/api/v1/items?q=${encodeURIComponent(q)}${extra}`).set(as('p-find')).expect(200)).body;

    expect((await names('ดาบ')).data.map((i: { nameTh: string }) => i.nameTh)).toEqual(['ดาบ']);
    expect((await names('เหล็ก')).data.map((i: { nameTh: string }) => i.nameTh)).toEqual(['เกราะเหล็ก', 'หมวกเหล็ก']);
    expect(await names('มังกร')).toEqual({ success: true, data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    expect((await names('   ')).meta.total).toBe(5);
    const paged = await names('เหล็ก', '&limit=1&page=2');
    expect(paged.meta).toEqual({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(paged.data.map((i: { nameTh: string }) => i.nameTh)).toEqual(['หมวกเหล็ก']);
    // ของคนอื่นไม่ปน
    expect((await http.get('/api/v1/items?q=ดาบ'.replace('ดาบ', encodeURIComponent('ดาบ'))).set(as('p-alice')).expect(200)).body.data
      .every((i: { id: string }) => !paged.data.some((x: { id: string }) => x.id === i.id))).toBe(true);
  });

  it('ประวัติการรบ: q ค้นในชื่อสถานที่ (หอคอย · ชื่อภูมิภาค)', async () => {
    await http.post('/api/v1/battles').set(as('p-find')).send({ towerFloor: 1 }).expect(201);
    const run = await http.post('/api/v1/region-runs').set(as('p-find')).send({ regionId: 'greenwood', depth: 1 }).expect(201);
    await http.post('/api/v1/battles').set(as('p-find')).send({ regionRunId: run.body.data.id }).expect(201);
    const places = async (q: string) =>
      (await http.get(`/api/v1/battles?q=${encodeURIComponent(q)}`).set(as('p-find')).expect(200)).body.data.map(
        (b: { regionId: string }) => b.regionId,
      );
    expect(await places('หอ')).toEqual(['tower']);
    expect(await places('เริ่มต้น')).toEqual(['greenwood']);
    expect(await places('ภูเขาไฟ')).toEqual([]);
    expect((await places('')).sort()).toEqual(['greenwood', 'tower']);
  });

  it('โจทย์: q ค้นในชื่อและคำอธิบาย ไม่สนตัวพิมพ์ · % กับ _ เป็นตัวอักษรธรรมดา · q ผิดรูป → 400', async () => {
    const mk = (title: string, description: string) =>
      http.post('/api/v1/challenges').set(as('t-find', 'staff')).send({ title, description }).expect(201);
    const a = (await mk('ตั้งการ์ดเมื่อถูกหมายหัว', 'ใช้ Defend() ตอนหมาป่าง้าง')).body.data.id;
    const b = (await mk('ร่ายไฟใส่ตัวที่เลือดน้อย', 'แรง 150% ของ INT')).body.data.id;
    const titles = async (q: string) =>
      (await http.get(`/api/v1/challenges?q=${encodeURIComponent(q)}`).set(as('p-find')).expect(200)).body.data.map(
        (c: { title: string }) => c.title,
      );
    expect(await titles('การ์ด')).toEqual(['ตั้งการ์ดเมื่อถูกหมายหัว']);
    expect(await titles('DEFEND')).toEqual(['ตั้งการ์ดเมื่อถูกหมายหัว']);
    expect(await titles('int')).toEqual(['ร่ายไฟใส่ตัวที่เลือดน้อย']);
    expect(await titles('%')).toEqual(['ร่ายไฟใส่ตัวที่เลือดน้อย']);
    expect(await titles('_')).toEqual([]);
    expect(await titles('\\')).toEqual([]);

    const bad = await http.get(`/api/v1/challenges?q=${'ก'.repeat(101)}`).set(as('p-find')).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await http.get('/api/v1/challenges?q=a&q=b').set(as('p-find')).expect(400);
    await http.get('/api/v1/items?q=%00').set(as('p-find')).expect(400);

    for (const id of [a, b]) await http.delete(`/api/v1/challenges/${id}`).set(as('t-find', 'staff')).expect(200);
  });
});

describe('มอนของโจทย์ (docs/design-challenge-monsters.md)', () => {
  const lec = () => as('lec-mon', 'lecturer');
  // ตั้งรับอย่างเดียวไม่เคยตี — เลือดหนาพอให้ได้ลงมือก่อนตาย แต่ผู้เล่นเลเวล 1 ชนะเสมอ
  const weak = { name: 'สไลม์ขี้ระแวง', archetypeId: 'slime', level: 1, hpMult: 3, dmgMult: 0.5, programSource: 'def turn():\n    defend()\n' };
  const wall = { name: 'กำแพงหิน', archetypeId: 'golem', level: 50, hpMult: 5, dmgMult: 3, skills: ['mon_bite', 'mon_roar'] };
  const student = async (sub: string) => {
    await http.post('/api/v1/characters').set(as(sub)).send({ displayName: `มอน_${sub.replace(/-/g, '_')}` }).expect(201);
  };
  const fight = (sub: string, challengeId: string) => http.post('/api/v1/battles').set(as(sub)).send({ challengeId });

  it('ผู้สอนตั้งมอนพร้อมโจทย์ · skills ว่าง = ของต้นแบบ · ค่าผิดชี้ช่องด้วย path · โปรแกรมของมอนถูกตรวจ', async () => {
    const created = await http.post('/api/v1/challenges').set(lec()).send({ title: 'สู้สไลม์', monsters: [weak, wall] }).expect(201);
    expect(created.body.data.monsters).toEqual([
      { position: 1, name: 'สไลม์ขี้ระแวง', archetypeId: 'slime', level: 1, hpMult: 3, dmgMult: 0.5, skills: ['mon_bite'], programSource: 'def turn():\n    defend()\n' },
      { position: 2, name: 'กำแพงหิน', archetypeId: 'golem', level: 50, hpMult: 5, dmgMult: 3, skills: ['mon_bite', 'mon_roar'], programSource: null },
    ]);
    await http.delete(`/api/v1/challenges/${created.body.data.id}`).set(lec()).expect(200);

    const bad = async (monsters: unknown, field: string) => {
      const res = await http.post('/api/v1/challenges').set(lec()).send({ title: 'ผิด', monsters }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d: string) => d.startsWith(field))).toBe(true);
    };
    await bad([{ ...weak, level: 99 }], 'monsters.0.level');
    await bad([weak, { ...weak, archetypeId: 'dragon' }], 'monsters.1.archetypeId');
    await bad([{ ...weak, skills: ['m_firebolt'] }], 'monsters.0.skills');
    await bad([{ ...weak, programSource: 'def turn():\n    cast("dark_bolt", weakest(enemies))\n' }], 'monsters.0.programSource');
    await bad([{ ...weak, programSource: 'defend()' }], 'monsters.0.programSource');
    await bad([weak, weak, weak, weak, weak], 'monsters');
    await bad([{ ...weak, hpMult: null }], 'monsters.0.hpMult');
    // นักศึกษาตั้งมอนไม่ได้ (สร้างโจทย์ไม่ได้อยู่แล้ว)
    await http.post('/api/v1/challenges').set(as('p-mon-x')).send({ title: 'x', monsters: [weak] }).expect(403);
  });

  it('ชนะครั้งแรกได้ EXP/ทองตามเลเวลผู้เล่น ครั้งเดียว · ไม่ลงประวัติการรบ · แพ้ไม่ได้อะไร · myResult ของตัวเอง', async () => {
    const easy = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'อุ่นเครื่อง', monsters: [weak] }).expect(201)).body.data.id;
    const hard = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'กำแพง', monsters: [wall] }).expect(201)).body.data.id;
    await student('p-mon-a');
    const before = (await http.get('/api/v1/characters/current').set(as('p-mon-a')).expect(200)).body.data;
    expect((await http.get(`/api/v1/challenges/${easy}`).set(as('p-mon-a')).expect(200)).body.data.myResult)
      .toEqual({ attempts: 0, cleared: false, firstClearedAt: null });

    const first = (await fight('p-mon-a', easy).expect(201)).body.data;
    expect(first.result.victory).toBe(true);
    expect(first.result.drops).toEqual({ gold: 0, materials: 0, items: [] });
    expect(first.result.events.some((e: { actorId: string; action: string }) => e.actorId === 'ch_m1_slime' && e.action === 'defend')).toBe(true);
    expect(first.challenge).toEqual({ challengeId: easy, firstClear: true, reward: { exp: 2, gold: 24 } });
    expect(first.attempt).toEqual({ attemptNo: 1, firstAttempt: true, previous: null });
    expect(first.character.gold).toBe(before.gold + 24);

    const again = (await fight('p-mon-a', easy).expect(201)).body.data;
    expect(again.challenge).toEqual({ challengeId: easy, firstClear: false, reward: { exp: 0, gold: 0 } });
    expect(again.attempt).toMatchObject({ attemptNo: 2, firstAttempt: false, previous: { victory: true, wavesCleared: 1 } });
    expect(again.character.gold).toBe(before.gold + 24);

    const lost = (await fight('p-mon-a', hard).expect(201)).body.data;
    expect(lost.result.victory).toBe(false);
    expect(lost.challenge).toEqual({ challengeId: hard, firstClear: false, reward: { exp: 0, gold: 0 } });

    const mine = (await http.get(`/api/v1/challenges/${easy}`).set(as('p-mon-a')).expect(200)).body.data.myResult;
    expect(mine).toMatchObject({ attempts: 2, cleared: true });
    expect(Date.parse(mine.firstClearedAt)).not.toBeNaN();
    // ไม่ลงประวัติการรบ และไม่แตะความคืบหน้าหอคอย
    expect((await http.get('/api/v1/battles').set(as('p-mon-a')).expect(200)).body.meta.total).toBe(0);
    expect((await http.get('/api/v1/tower-progress').set(as('p-mon-a')).expect(200)).body.data.highestFloorCleared).toBe(0);
    // ผู้สอนที่ไม่มีตัวละคร: myResult = null
    expect((await http.get(`/api/v1/challenges/${easy}`).set(lec()).expect(200)).body.data.myResult).toBeNull();
  });

  it('ชนะพร้อมกันหลายคำขอ → ได้รางวัลครั้งเดียว', async () => {
    const id = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'พร้อมกัน', monsters: [weak] }).expect(201)).body.data.id;
    await student('p-mon-race');
    const results = await Promise.all(Array.from({ length: 5 }, () => fight('p-mon-race', id)));
    for (const r of results) expect(r.status).toBe(201);
    const firsts = results.filter((r) => r.body.data.challenge.firstClear);
    expect(firsts).toHaveLength(1);
    const rows = await queryRows(DB!, `SELECT SUM(gold_gained)::int AS gold, COUNT(*)::int AS n FROM challenge_attempts a
      JOIN characters c ON c.id = a.character_id WHERE c.core_user_id = 'p-mon-race'`);
    expect(rows[0]).toEqual({ gold: 24, n: 5 });
  });

  it('ผลรายคน: เจ้าของโจทย์และผู้ดูแลดูได้ · คนอื่น 403 · ชนะแล้วอยู่บน', async () => {
    const id = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'ดูผล', monsters: [weak] }).expect(201)).body.data.id;
    await student('p-mon-b');
    await student('p-mon-c');
    await fight('p-mon-b', id).expect(201);
    await fight('p-mon-b', id).expect(201);
    // แก้มอนให้ชนะไม่ได้แล้ว p-mon-c สู้หนึ่งครั้ง (แพ้)
    await http.patch(`/api/v1/challenges/${id}`).set(lec()).send({ monsters: [wall] }).expect(200);
    await fight('p-mon-c', id).expect(201);

    const res = await http.get(`/api/v1/challenges/${id}/attempts?limit=10`).set(lec()).expect(200);
    expect(res.body.meta).toMatchObject({ total: 2, page: 1, limit: 10 });
    expect(res.body.data.map((r: { displayName: string; attempts: number; cleared: boolean }) => [r.displayName, r.attempts, r.cleared]))
      .toEqual([['มอน_p_mon_b', 2, true], ['มอน_p_mon_c', 1, false]]);
    await http.get(`/api/v1/challenges/${id}/attempts`).set(as('a-one', 'admin')).expect(200);
    await http.get(`/api/v1/challenges/${id}/attempts`).set(as('t-other', 'staff')).expect(403);
    await http.get(`/api/v1/challenges/${id}/attempts`).set(as('p-mon-b')).expect(403);
    await http.get('/api/v1/challenges/00000000-0000-4000-8000-000000000000/attempts').set(lec()).expect(404);
  });

  it('โจทย์ไม่มีมอน → 409 · ไม่พบ → 404 · ส่งสองทางพร้อมกัน → 400 · ลบมอนทั้งชุดด้วย [] · ลบโจทย์ลบผลด้วย', async () => {
    await student('p-mon-d');
    const plain = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'ไม่มีมอน' }).expect(201)).body.data;
    expect(plain.monsters).toEqual([]);
    await fight('p-mon-d', plain.id).expect(409);
    await fight('p-mon-d', '00000000-0000-4000-8000-000000000000').expect(404);
    await http.post('/api/v1/battles').set(as('p-mon-d')).send({ towerFloor: 1, challengeId: plain.id }).expect(400);
    await http.post('/api/v1/battles').set(as('p-mon-d')).send({ challengeId: 'not-a-uuid' }).expect(400);

    const id = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'ลบมอน', monsters: [weak] }).expect(201)).body.data.id;
    await fight('p-mon-d', id).expect(201);
    const cleared = await http.patch(`/api/v1/challenges/${id}`).set(lec()).send({ monsters: [] }).expect(200);
    expect(cleared.body.data.monsters).toEqual([]);
    await fight('p-mon-d', id).expect(409);
    // PATCH ที่ไม่ส่ง monsters ไม่แตะมอน
    await http.patch(`/api/v1/challenges/${id}`).set(lec()).send({ monsters: [weak] }).expect(200);
    const kept = await http.patch(`/api/v1/challenges/${id}`).set(lec()).send({ title: 'เปลี่ยนชื่ออย่างเดียว' }).expect(200);
    expect(kept.body.data.monsters).toHaveLength(1);

    await http.delete(`/api/v1/challenges/${id}`).set(lec()).expect(200);
    const left = await queryRows(DB!, `SELECT
      (SELECT COUNT(*)::int FROM challenge_attempts WHERE challenge_id = '${id}') AS attempts,
      (SELECT COUNT(*)::int FROM challenge_monsters WHERE challenge_id = '${id}') AS monsters`);
    expect(left[0]).toEqual({ attempts: 0, monsters: 0 });
  });

  it('แก้มอนพร้อมกันหลายคำขอ (สองแท็บ · กดซ้ำ) → ต่อคิวกัน ได้ 200 ทุกคำขอ · ชุดสุดท้ายเป็นชุดเดียว เรียงตำแหน่ง', async () => {
    // เดิมคำขอที่ชนกันตอนลบแล้วใส่ชุดใหม่ได้ 409 "ข้อมูลซ้ำกับที่มีอยู่แล้ว"
    const id = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'แก้พร้อมกัน', monsters: [weak] }).expect(201)).body.data.id;
    const sets = [1, 2, 3, 4, 2].map((n, k) => Array.from({ length: n }, () => ({ ...weak, name: `ชุด ${k}` })));
    const results = await Promise.all(sets.map((monsters) => http.patch(`/api/v1/challenges/${id}`).set(lec()).send({ monsters })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const final: Array<{ name: string; position: number }> = (await http.get(`/api/v1/challenges/${id}`).set(lec()).expect(200)).body.data.monsters;
    expect(new Set(final.map((m) => m.name)).size).toBe(1);
    expect(final.map((m) => m.position)).toEqual(final.map((_, i) => i + 1));
    // ค่าที่ไม่ใช่ object ได้ข้อความไทยที่ชี้ตำแหน่ง
    const nul = await http.patch(`/api/v1/challenges/${id}`).set(lec()).send({ monsters: [null] }).expect(400);
    expect(nul.body.error.details).toEqual(['monsters.0: monsters แต่ละตัวต้องเป็น object']);
  });

  it('โจทย์ถูกลบระหว่างจำลองการรบ → 404 ไม่ใช่ 500 · ไม่ได้รางวัล ไม่มีผลค้าง', async () => {
    const { BattlePersistenceService } = await import('../../src/battles/battle-persistence.service');
    await student('p-mon-gone');
    const id = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'จะถูกลบ', monsters: [weak] }).expect(201)).body.data.id;
    const other = (await http.post('/api/v1/challenges').set(lec()).send({ title: 'ได้ผลรบมาใช้', monsters: [weak] }).expect(201)).body.data.id;
    const won = (await fight('p-mon-gone', other).expect(201)).body.data;
    // ช่วงเวลาระหว่างจำลองการรบกับบันทึกผล: ผู้สอนลบโจทย์ไปแล้ว
    await http.delete(`/api/v1/challenges/${id}`).set(lec()).expect(200);
    const [{ id: characterId }] = await queryRows(DB!, `SELECT id FROM characters WHERE core_user_id = 'p-mon-gone'`);
    await expect(app.get(BattlePersistenceService).persistChallenge(characterId as string, id, won.result))
      .rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    const after = (await http.get('/api/v1/characters/current').set(as('p-mon-gone')).expect(200)).body.data;
    expect(after.gold).toBe(won.character.gold);
    const rows = await queryRows(DB!, `SELECT COUNT(*)::int AS n FROM challenge_attempts WHERE challenge_id = '${id}'`);
    expect(rows[0]).toEqual({ n: 0 });
  });
});
