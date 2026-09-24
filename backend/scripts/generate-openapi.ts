/**
 * pnpm run generate:openapi → backend/openapi.json
 *
 * สร้างแอปขึ้นมาเพื่ออ่าน decorator อย่างเดียว ไม่ listen และไม่ต่อฐานข้อมูล
 * (PrismaPg ต่อเมื่อมี query แรก) — CI job "API Contract Sync" ไม่มี .env จึงเติมค่าที่
 * การตรวจ env ต้องการไว้ให้ก่อน ค่าพวกนี้ไม่ถูกใช้ทำอะไรเลยนอกจากผ่านการตรวจตอนบูต
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const defaults: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://127.0.0.1:1/openapi_generation_never_connects',
  SUBSYSTEM_ID: 'csmju-code-tower',
  CORE_HUB_URL: 'http://localhost:3000',
  CORE_HUB_JWKS_URL: 'http://localhost:3000/api/v1/.well-known/jwks.json',
  CORE_HUB_ISSUER: 'core-hub',
  CORE_HUB_AUDIENCE: 'csmju2030',
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/main');
  const { buildOpenApiDocument } = await import('../src/common/openapi');

  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  const document = buildOpenApiDocument(app);
  const target = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`openapi.json → ${target} (${Object.keys(document.paths).length} paths)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
