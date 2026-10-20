/**
 * ทางได้สกิลเพิ่มบนหน้าตัวละคร (20 ต.ค. 2569 · docs/design-skill-acquisition.md ข้อ 8)
 *   สกิลจากความชำนาญ (ระยะ S3) — แต้มที่ความชำนาญแจกให้แต่ละสายเทียบกับเกณฑ์
 *   ตำราสกิล (ระยะ S4) — ทุกเล่ม ต้นทาง และเพดานดวงของตัวละครนี้
 * ตัวเลขทั้งหมดมาจาก backend (engine) ตรง ๆ ไม่พิมพ์ซ้ำที่นี่
 */
import { LockIcon, StatusBadge, cardClass } from '@/csmju';
import { ProgressBar } from '@/components/ProgressBar';
import type { Character } from '@/lib/api/types';
import { LINE_LABELS, SKILL_KIND_LABELS, castExample } from '@/lib/game/labels';

function SkillLine({ skill }: { skill: { id: string; nameTh: string; kind: string; mpCost: number; aoe: boolean } }) {
  return (
    <p className="text-label-sm font-normal text-on-surface-variant">
      <span className="text-on-surface">{skill.nameTh}</span> · {SKILL_KIND_LABELS[skill.kind] ?? skill.kind}
      {skill.aoe && ' · โดนทุกตัว'} · MP {skill.mpCost} · <code className="font-mono">{castExample(skill)}</code>
    </p>
  );
}

export function LineSkillsCard({ character: c }: { character: Character }) {
  return (
    <section className={cardClass} aria-labelledby="lines-title">
      <div className="border-b border-outline-variant/40 px-6 py-5">
        <h2 id="lines-title" className="font-display text-headline-md text-on-surface">
          สกิลจากความชำนาญ
        </h2>
        <p className="text-label-md font-normal text-on-surface-variant">
          โปรแกรมเล่นสายไหนบ่อย แต้มสายนั้นโต ครบเกณฑ์ได้สกิลของสายนั้น
        </p>
      </div>
      <ul className="space-y-4 px-6 py-5">
        {c.lines.map((l) => {
          const label = LINE_LABELS[l.line] ?? { key: l.line.toUpperCase(), th: '' };
          return (
            <li key={l.line} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-label-md text-on-surface">
                  {label.key} <span className="font-normal text-on-surface-variant">{label.th}</span>
                </span>
                {l.unlocked ? (
                  <StatusBadge tone="success">ได้แล้ว</StatusBadge>
                ) : (
                  <span className="text-label-md text-on-surface-variant tabular-nums">
                    {Math.min(l.earned, l.threshold)} / {l.threshold} แต้ม
                  </span>
                )}
              </div>
              <ProgressBar
                value={Math.min(l.earned, l.threshold)}
                max={l.threshold}
                label={`แต้มสาย ${label.key}`}
                valueText={`${Math.min(l.earned, l.threshold)} จาก ${l.threshold} แต้ม`}
                size="sm"
              />
              {l.skill ? (
                <SkillLine skill={l.skill} />
              ) : (
                <p className="text-label-sm font-normal text-on-surface-variant">ผู้ฝึกหัดสะสมแต้มไว้ก่อนได้ — ได้สกิลเมื่อเลือกอาชีพ</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SkillBooksCard({ character: c }: { character: Character }) {
  return (
    <section className={cardClass} aria-labelledby="books-title">
      <div className="border-b border-outline-variant/40 px-6 py-5">
        <h2 id="books-title" className="font-display text-headline-md text-on-surface">
          ตำราสกิล
        </h2>
        <p className="text-label-md font-normal text-on-surface-variant">
          ดรอปจากบอสและมอน EX ที่ระบุ · ล้มครบจำนวนแล้วได้แน่นอน ดวงตัดสินแค่ได้เร็วหรือช้า
        </p>
      </div>
      <ul className="divide-y divide-outline-variant/40">
        {c.books.map((b) => (
          <li key={b.id} className="space-y-1.5 px-6 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-md text-on-surface">
                {b.nameTh} <span className="text-label-md font-normal text-on-surface-variant">· {b.mechanicTh}</span>
              </span>
              {b.owned ? (
                <StatusBadge tone="success">เก็บแล้ว</StatusBadge>
              ) : (
                <StatusBadge tone="neutral">
                  <LockIcon className="h-3 w-3" /> ล้มต้นทาง {b.pity}/{b.pityMax}
                </StatusBadge>
              )}
            </div>
            {b.skill ? (
              <SkillLine skill={b.skill} />
            ) : (
              <p className="text-label-sm font-normal text-on-surface-variant">ผู้ฝึกหัดเก็บตำราไว้ก่อนได้ — ได้สกิลเมื่อเลือกอาชีพ</p>
            )}
            {!b.owned && (
              <p className="text-label-sm font-normal text-on-surface-variant">ดรอปจาก {b.sourcesTh.join(' · ')}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
