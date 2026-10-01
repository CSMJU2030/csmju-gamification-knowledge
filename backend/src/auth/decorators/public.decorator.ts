import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** route ที่เข้าได้โดยไม่มี token — ต้องประกาศใน subsystem.yaml `public_endpoints` ด้วย */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
