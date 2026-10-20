/**
 * สิ่งที่การรบนี้ให้กับสกิล (20 ต.ค. 2569 · docs/design-skill-acquisition.md ข้อ 8) — หอคอยและภูมิภาคเท่านั้น
 *
 *   ขั้น 2 (ระยะ S2)  — ร่ายสกิลไหนกี่ครั้ง ถูกจังหวะกี่ครั้ง นับเข้าความเชี่ยวชาญเท่าไร · ไม่นับเพราะอะไร
 *   สกิลใหม่          — เลเวลอัพ · แต้มสายถึงเกณฑ์ (ระยะ S3) · ตำราใหม่ (ระยะ S4) พร้อมโค้ดที่ใช้ได้ทันที
 *   ตำรา (ระยะ S4)    — ได้เล่มไหน หรือเข้าใกล้เพดานดวงแค่ไหน
 * ไม่มีอะไรเกิดขึ้นเลย = ไม่แสดงอะไร (ไม่เพิ่มกล่องว่างให้หน้าผลการรบยาวขึ้น)
 */
import { StatusBadge } from '@/csmju';
import { Alert } from '@/components/feedback';
import type { BattleOutcome } from '@/lib/api/types';
import { SKILL_KIND_LABELS, castExample } from '@/lib/game/labels';

type Gains = NonNullable<BattleOutcome['skills']>;

const SOURCE_TH: Record<string, string> = {
  level: 'ปลดตามเลเวล',
  line: 'ได้จากความชำนาญ',
  book: 'ได้จากตำรา',
  region: 'ได้จากการพิสูจน์ภูมิภาค',
};

export default function SkillGainsPanel({ gains }: { gains: Gains }) {
  const bookSkillIds = new Set(gains.books.dropped.map((b) => b.skill?.id).filter(Boolean));
  const newSkills = gains.newSkills.filter((s) => !bookSkillIds.has(s.id));
  const rankedUp = gains.mastery.filter((m) => m.rankedUp);
  // สกิลที่ยังไม่ถึงขั้น 2 และร่ายในการรบนี้ — สกิลที่ถึงขั้น 2 ไปแล้วไม่ต้องรายงานซ้ำทุกการรบ
  const progress = gains.mastery.filter((m) => !m.rankedUp && m.total < m.need);
  const nothing = gains.books.dropped.length === 0 && newSkills.length === 0 && rankedUp.length === 0
    && progress.length === 0 && gains.books.progress.length === 0;
  if (nothing) return null;

  return (
    <section aria-label="สกิลจากการรบนี้" className="mt-4 space-y-3 rounded-lg border border-outline-variant/60 p-4">
      <h3 className="font-display text-label-md text-on-surface">สกิลจากการรบนี้</h3>

      {gains.books.dropped.map((b) => (
        <Alert key={b.id} tone="success">
          <span className="font-semibold">ได้{b.nameTh}</span> ({b.mechanicTh})
          {b.skill ? (
            <>
              {' '}— ได้สกิล {b.skill.nameTh} ใช้ในโปรแกรมได้เลย: <code className="font-mono">{castExample(b.skill)}</code>
            </>
          ) : (
            ' — เลือกอาชีพเมื่อไรได้สกิลของอาชีพนั้นทันที'
          )}
        </Alert>
      ))}

      {rankedUp.map((m) => (
        <Alert key={m.skillId} tone="success">
          <span className="font-semibold">{m.nameTh} ขึ้นขั้น 2</span> — ใช้ถูกจังหวะครบ {m.need} ครั้ง ตอนนี้แรงขึ้นแล้ว
        </Alert>
      ))}

      {newSkills.map((s) => (
        <Alert key={s.id} tone="success">
          <span className="font-semibold">ได้สกิลใหม่ {s.nameTh}</span> ({SOURCE_TH[s.source] ?? s.source} ·{' '}
          {SKILL_KIND_LABELS[s.kind] ?? s.kind} · MP {s.mpCost}) — <code className="font-mono">{castExample(s)}</code>
        </Alert>
      ))}

      {progress.length > 0 && (
        <ul className="space-y-2">
          {progress.map((m) => (
            <li key={m.skillId} className="space-y-0.5">
              <p className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
                {m.nameTh}
                <StatusBadge tone={m.credited > 0 ? 'success' : 'neutral'}>
                  {m.credited > 0 ? `+${m.credited} สู่ขั้น 2` : 'รอบนี้ไม่นับ'}
                </StatusBadge>
              </p>
              <p className="text-label-sm font-normal text-on-surface-variant tabular-nums">
                ร่าย {m.casts} ครั้ง ถูกจังหวะ {m.correct} ครั้ง · สะสม {m.total}/{m.need}
                {m.credited === 0 && m.casts > 0 && ' — ใช้ผิดจังหวะบ่อยเกินไป รอบที่นับต้องถูกเกือบทุกครั้ง (ดูเงื่อนไขที่หน้าตัวละคร)'}
              </p>
            </li>
          ))}
        </ul>
      )}

      {gains.books.progress.length > 0 && (
        <ul className="space-y-1 text-label-sm font-normal text-on-surface-variant">
          {gains.books.progress.map((b) => (
            <li key={b.id} className="tabular-nums">
              {b.nameTh}: ล้มต้นทางได้ {b.kills} ตัวในรอบนี้ · สะสม {b.pity}/{b.pityMax} ครั้ง (ครบได้แน่นอน)
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
