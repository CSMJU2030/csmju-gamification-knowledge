/**
 * "ตัวละครโตขึ้นเท่าไร" ในหน้าผลการรบ (playtest รอบ A ข้อ 6 · 26 ก.ย. 2026)
 *
 * แทนป้าย "+16 STR" เดิม: บอกเป็น ก่อน → หลัง ทั้งสเตตัสและค่าที่ใช้รบ และเทียบกับครั้งก่อนที่จุดเดียวกัน
 * วางในการ์ดผล (ไม่ใช่บนเวที) เพราะตอนฉากจบ หน้าเพจพาโฟกัสและจอไปที่การ์ดผลเสมอ — ของที่วางบนเวทีจะอยู่นอกจอ
 */
import type { ReactNode } from 'react';
import { StatusBadge } from '@/csmju';
import { MAX_WAVE } from '@/game-stage/battle/battle-log';
import { growthNumber, type GrowthLine, type GrowthSummary } from '@/lib/game/growth';

function Delta({ line }: { line: GrowthLine }) {
  const diff = Math.round((line.after - line.before) * 10) / 10;
  return (
    <li className="flex items-baseline justify-between gap-3 tabular-nums">
      <span className="min-w-0 text-on-surface-variant">{line.label}</span>
      <span className="shrink-0 text-on-surface">
        {growthNumber(line.before)} → <strong className="font-semibold">{growthNumber(line.after)}</strong>{' '}
        <span className={diff >= 0 ? 'text-emerald-700' : 'text-error'}>
          ({diff >= 0 ? '+' : ''}
          {growthNumber(diff)})
        </span>
      </span>
    </li>
  );
}

const resultText = (victory: boolean, waves: number) => `${victory ? 'ชนะ' : 'แพ้'} ${waves}/${MAX_WAVE} เวฟ`;

function comparisonLine(g: GrowthSummary): ReactNode {
  const c = g.comparison;
  if (c.kind === 'first') return 'ครั้งแรกที่จุดนี้';
  const prev = resultText(c.prevVictory, c.prevWaves);
  if (c.kind === 'better') return `ดีกว่าครั้งก่อนที่จุดนี้ (ครั้งก่อน${prev})`;
  if (c.kind === 'worse') return `แย่กว่าครั้งก่อนที่จุดนี้ (ครั้งก่อน${prev}) — ดูบันทึกการรบว่าเทิร์นไหนพลาด`;
  return `เท่ากับครั้งก่อนที่จุดนี้ (${prev})`;
}

export default function GrowthPanel({ growth }: { growth: GrowthSummary }) {
  const leveled = growth.levelTo > growth.levelFrom;
  return (
    <div className={`mt-4 rounded-lg p-4 ${leveled ? 'bg-success/10' : 'bg-surface-container-low'}`}>
      <h3 className="sr-only">การเติบโตของตัวละคร</h3>
      {leveled ? (
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display text-headline-md text-on-surface tabular-nums">
            เลเวล {growth.levelFrom} → {growth.levelTo}
          </span>
          <StatusBadge tone="success">เลเวลอัพ!</StatusBadge>
        </p>
      ) : (
        <p className="text-body-md text-on-surface tabular-nums">
          ยังไม่เลเวลอัพ — อีก {growthNumber(growth.expToLevel)} EXP ถึงเลเวล {growth.levelTo + 1}
        </p>
      )}

      {leveled && (growth.stats.length > 0 || growth.derived.length > 0) && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {growth.stats.length > 0 && (
            <div>
              <p className="text-label-md text-on-surface">สเตตัส</p>
              <ul className="mt-1 space-y-1 text-body-md">
                {growth.stats.map((l) => (
                  <Delta key={l.key} line={l} />
                ))}
              </ul>
            </div>
          )}
          {growth.derived.length > 0 && (
            <div>
              <p className="text-label-md text-on-surface">ค่าที่ใช้รบ</p>
              <ul className="mt-1 space-y-1 text-body-md">
                {growth.derived.map((l) => (
                  <Delta key={l.key} line={l} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-body-md text-on-surface-variant">{comparisonLine(growth)}</p>
    </div>
  );
}
