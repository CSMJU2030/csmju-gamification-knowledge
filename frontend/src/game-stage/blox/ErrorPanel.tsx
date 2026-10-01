/**
 * แผงข้อผิดพลาด — UI กลาง (G0 ข้อ 5.2: "แผงข้อผิดพลาดของโปรแกรม" ไม่ใช่เวทีเกม)
 * จึงใช้ token + Alert กลางทั้งหมด แม้ไฟล์จะอยู่ใต้ game-stage/
 *
 * ชื่อ error เป็นอังกฤษเหมือน Python จริง คำอธิบายเป็นไทย
 * (docs/bloxcode-language.md §5 — ผู้เล่นจะได้ไม่ตกใจตอนไปเขียน Python จริง)
 *
 * รายการถูกยุบด้วย groupErrors() ของ PM มาแล้วก่อนถึงที่นี่ — ห้ามยุบเองซ้ำ
 */
import { Alert } from '@/components/feedback';
import { CheckIcon, StatusBadge, cardClass } from '@/csmju';
import type { GroupedError } from './schema';
import type { ServerRejection } from './program-api';

interface Props {
  id?: string;
  /** ผลตรวจฝั่งไคลเอนต์ (ทันใจ) */
  errors: GroupedError[];
  /** ผลตรวจจากเซิร์ฟเวอร์ตอนกดบันทึก — ถ้ามี ต้องเชื่ออันนี้ (กฎข้อ 3) */
  server: ServerRejection | null;
  checking: boolean;
  onJump: (line: number) => void;
}

export default function ErrorPanel({ id, errors, server, checking, onJump }: Props) {
  const serverCount = server ? server.errors.length + server.notes.length : 0;
  /**
   * ทันทีหลังเซิร์ฟเวอร์ปฏิเสธ ผลตรวจของเรามักเป็นชุดเดียวกันเป๊ะ (ล่ามตัวเดียวกัน — กฎข้อ 2)
   * แสดงซ้ำสองรายการทำให้ดูเหมือนผิด 2 เท่า จึงซ่อนรายการของเราเมื่อไม่มีอะไรที่เซิร์ฟเวอร์ไม่ได้บอก
   */
  const serverKeys = new Set(server?.errors.map((e) => `${e.name}@${e.line}`) ?? []);
  const extra = serverCount > 0 ? errors.filter((e) => !serverKeys.has(`${e.name}@${e.line}`)) : errors;
  return (
    <section id={id} aria-labelledby="blox-errors-title" className={`${cardClass} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="blox-errors-title" className="text-label-md text-on-surface">
          ข้อผิดพลาด
        </h2>
        {errors.length > 0 && <StatusBadge tone="error">{errors.length} จุด</StatusBadge>}
      </div>

      {server && serverCount > 0 && (
        <div className="mt-3 space-y-2">
          <Alert tone="error">
            <span className="block font-semibold">บันทึกไม่ได้ — โปรแกรมมีข้อผิดพลาด {serverCount} จุด</span>
            <span className="block">แก้ตามรายการนี้แล้วกดบันทึกอีกครั้ง</span>
          </Alert>
          <ErrorList errors={server.errors} onJump={onJump} />
          {server.notes.length > 0 && (
            <ul className="space-y-1 text-body-md text-on-error-container">
              {server.notes.map((n) => (
                <li key={n} className="rounded-lg bg-error-container/60 px-3 py-2">
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3" aria-live="polite">
        {serverCount > 0 && extra.length === 0 ? null : errors.length === 0 ? (
          <p className="flex items-start gap-2 text-body-md text-on-surface-variant">
            {checking ? (
              'กำลังตรวจ...'
            ) : (
              <>
                <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-sso" />
                <span>ไม่พบข้อผิดพลาดในโปรแกรม</span>
              </>
            )}
          </p>
        ) : (
          <>
            {serverCount > 0 && (
              <h3 className="mb-2 text-label-md text-on-surface-variant">ที่ตรวจพบเพิ่มขณะแก้</h3>
            )}
            <ErrorList errors={extra} onJump={onJump} />
          </>
        )}
      </div>
    </section>
  );
}

function ErrorList({ errors, onJump }: { errors: GroupedError[]; onJump: (line: number) => void }) {
  if (errors.length === 0) return null;
  return (
    <ul className="divide-y divide-outline-variant/40 overflow-hidden rounded-lg border border-outline-variant/40">
      {errors.map((e) => (
        <li key={`${e.name}@${e.line}`}>
          <button
            type="button"
            onClick={() => onJump(e.line)}
            className="flex min-h-11 w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-error-container/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-container"
          >
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span lang="en" className="font-mono text-label-md text-error">
                {e.name}
              </span>
              <span className="text-label-sm text-on-surface-variant tabular-nums">บรรทัด {e.line}</span>
              {e.count > 1 && (
                <span className="text-label-sm text-on-surface-variant tabular-nums">พบ {e.count} ครั้ง</span>
              )}
            </span>
            <span className="text-body-md text-on-surface">{e.messageTh}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
