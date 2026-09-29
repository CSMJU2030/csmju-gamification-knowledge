/**
 * จุดเริ่มของ backend
 *
 * เส้นทางตาม api-conventions.md ข้อ 1:
 *   /api/v1/<resource>   endpoint ธุรกิจ — prefix 'api' ตั้งที่นี่ ส่วน 'v1/' อยู่ใน @Controller ของแต่ละตัว
 *   /api/health          นอก v1 (ไม่ผูกกับเวอร์ชัน)
 *   /auth/login · /auth/callback · /auth/logout   นอก /api (สัญญา auth 1.1 ข้อ 5 · callback ต้องตรงกับที่ลงทะเบียน)
 */
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { createValidationPipe } from './common/validation';
import type { AppConfig } from './config/configuration';

/** ตั้งค่าที่ต้องเหมือนกันทุกที่ที่สร้างแอป (รันจริง · e2e test · generate:openapi) */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'auth/login', method: RequestMethod.GET },
      { path: 'auth/callback', method: RequestMethod.GET },
      { path: 'auth/logout', method: RequestMethod.POST },
    ],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  const express = app as NestExpressApplication;
  if (typeof express.disable === 'function') express.disable('x-powered-by');
}

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = app.get(ConfigService<AppConfig, true>).get('port', { infer: true });
  await app.listen(port);
}

if (require.main === module) {
  void bootstrap();
}
