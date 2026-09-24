/**
 * สร้างเอกสาร OpenAPI จาก decorator ของ controller (tech-stack.md ข้อ 3)
 * ไฟล์ที่ได้ (backend/openapi.json) คือสัญญาที่ frontend ใช้ generate type — CI ตรวจว่าตรงกับโค้ดทุก PR
 */
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Code Tower — csmju-code-tower')
    .setDescription(
      'ระบบย่อย Code Tower ของ CSMJU2030 · ตัวตนมาจาก Core Hub (RS256 + JWKS) · ' +
        'response ทุกตัวห่อด้วย envelope { success, data[, meta] } / { success: false, error }',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'coreHubBearer')
    .addCookieAuth('core_hub_access_token', { type: 'apiKey', in: 'cookie' }, 'ssoCookie')
    .addSecurityRequirements('coreHubBearer')
    .addSecurityRequirements('ssoCookie')
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}
