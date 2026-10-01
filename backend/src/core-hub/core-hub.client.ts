/**
 * เรียก API ข้อมูลกลางของ Core Hub จาก backend ด้วย token ของผู้ใช้ (reference-data.md 1.3 · auth-contract.md 1.2 ข้อ 6.1)
 *
 * ใช้แค่ `GET /api/v1/people/me` อ่าน `personCode` ตอนสร้างตัวละคร — อยู่ในรายการ endpoint ที่อนุญาต (ข้อ 2.2)
 * - token คือบัตรผ่านของผู้ใช้: ส่งไป Core Hub ที่เดียว ไม่เก็บ ไม่ log ไม่ส่งต่อ
 * - ข้อมูลบุคคลห้าม cache ทุกแบบ — เรียกทุกครั้งที่ต้องใช้ · เก็บลงฐานได้แค่ personCode
 * - Core Hub ตอบไม่ปกติ (ข้อ 7.4): 401 → ผู้ใช้ต้อง SSO ใหม่ · 403 → ไม่มีสิทธิ์ · 429 / 5xx / timeout → 503 + Retry-After
 * - log แค่ event · path · status — ไม่มี token ไม่มี personCode (log-events.json 1.1: ห้าม log ข้อมูลบุคคล)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ApiError, forbidden, serviceUnavailable, unauthorized } from '../common/api-error';
import type { AppConfig } from '../config/configuration';

export const PEOPLE_ME_PATH = '/api/v1/people/me';
/** Retry-After เมื่อ Core Hub ล่มหรือ timeout และไม่ได้บอกเวลามาเอง */
export const DEFAULT_RETRY_AFTER_SEC = 30;
const MAX_RETRY_AFTER_SEC = 300;
/** personCode ของจริง: รหัสนักศึกษา หรือส่วนหน้าอีเมลมหาวิทยาลัยของบุคลากร — กันค่าแปลกปลอมก่อนเอาไปเป็นชื่อ */
const PERSON_CODE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export interface PersonMe {
  /** null = บัญชีนี้ไม่ได้ผูกกับบุคคลในทะเบียนของ Core Hub (เช่น บัญชีทดสอบ) */
  personCode: string | null;
}

function retryAfterOf(header: string | null): number {
  const n = Number(header);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RETRY_AFTER_SEC;
  return Math.min(Math.ceil(n), MAX_RETRY_AFTER_SEC);
}

@Injectable()
export class CoreHubClient {
  private readonly logger = new Logger('CoreHub');

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async peopleMe(accessToken: string): Promise<PersonMe> {
    const { url, requestTimeoutMs } = this.config.get('coreHub', { infer: true });
    let response: Response;
    try {
      response = await fetch(`${url}${PEOPLE_ME_PATH}`, {
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(requestTimeoutMs),
        redirect: 'error',
      });
    } catch {
      throw this.unavailable('unreachable', null, DEFAULT_RETRY_AFTER_SEC);
    }

    if (response.status === 401) {
      this.log('session_ended', response.status);
      throw unauthorized('Core Hub บอกว่า session ของคุณจบแล้ว — เข้าสู่ระบบผ่าน Core Hub ใหม่');
    }
    if (response.status === 403) {
      this.log('forbidden', response.status);
      throw forbidden('บัญชีของคุณอ่านข้อมูลบุคคลจาก Core Hub ไม่ได้');
    }
    if (response.status === 429 || response.status >= 500) {
      throw this.unavailable('busy', response.status, retryAfterOf(response.headers.get('retry-after')));
    }
    if (!response.ok) throw this.unavailable('unexpected_status', response.status, DEFAULT_RETRY_AFTER_SEC);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw this.unavailable('malformed_body', response.status, DEFAULT_RETRY_AFTER_SEC);
    }
    const data = (body as { data?: unknown } | null)?.data;
    if (data === null) return { personCode: null };
    const code = (data as { personCode?: unknown } | undefined)?.personCode;
    if (typeof code !== 'string' || !PERSON_CODE_PATTERN.test(code)) {
      throw this.unavailable('malformed_body', response.status, DEFAULT_RETRY_AFTER_SEC);
    }
    return { personCode: code };
  }

  private log(reason: string, status: number | null): void {
    this.logger.warn(JSON.stringify({ event: 'core_hub.request.failure', path: PEOPLE_ME_PATH, reason, status }));
  }

  private unavailable(reason: string, status: number | null, retryAfterSec: number): ApiError {
    this.log(reason, status);
    return serviceUnavailable('ติดต่อ Core Hub ไม่ได้ชั่วคราว — รอสักครู่แล้วลองใหม่', retryAfterSec);
  }
}
