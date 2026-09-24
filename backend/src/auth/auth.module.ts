import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { CoreHubJwtGuard } from './guards/core-hub-jwt.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { JwksService } from './jwks.service';
import { MeController } from './me.controller';
import { SsoCallbackController } from './sso-callback.controller';

/**
 * guard ทั้งสองเป็น global และเรียงลำดับตามที่ประกาศ: ตัวตนก่อน (401) → สิทธิ์ (403)
 * route ใหม่จึงถูกล็อกโดยปริยาย ต้องใส่ @Public เองถึงจะเปิด
 */
@Module({
  controllers: [SsoCallbackController, MeController],
  providers: [
    JwksService,
    CoreHubTokenVerifier,
    { provide: APP_GUARD, useClass: CoreHubJwtGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [CoreHubTokenVerifier],
})
export class AuthModule {}
