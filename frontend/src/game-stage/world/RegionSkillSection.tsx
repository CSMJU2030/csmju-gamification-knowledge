/**
 * สกิลประจำภูมิภาคบนการ์ดโซน (8 ต.ค. 2569 · docs/design-skill-acquisition.md ระยะ S1)
 * บอกก่อนเข้าว่าได้สกิลอะไร และต้องทำอะไรให้ครบในการรบครั้งเดียว — เงื่อนไขมาจาก backend (engine) ตรง ๆ ไม่พิมพ์ซ้ำที่นี่
 */
import { StatusBadge } from '@/csmju';
import type { RegionProofInfo } from '@/lib/api/types';
import { SKILL_KIND_LABELS, castExample } from '@/lib/game/labels';

export default function RegionSkillSection({ proof }: { proof: RegionProofInfo }) {
  const { skill, proved, requirementsTh } = proof;
  return (
    <section aria-label="สกิลของโซนนี้" className="space-y-3 rounded-lg border border-outline-variant/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-label-md text-on-surface">สกิลของโซนนี้</h3>
        <StatusBadge tone={proved ? 'success' : 'neutral'}>{proved ? 'พิสูจน์แล้ว' : 'ยังไม่ได้'}</StatusBadge>
      </div>
      {skill ? (
        <div className="space-y-1">
          <p className="text-body-md text-on-surface">
            <span className="font-semibold">{skill.nameTh}</span>
            <span className="text-on-surface-variant">
              {' '}
              · {SKILL_KIND_LABELS[skill.kind] ?? skill.kind} · MP {skill.mpCost}
            </span>
          </p>
          <p className="text-label-sm font-normal text-on-surface-variant">
            เขียนในโปรแกรม: <code className="font-mono text-on-surface">{castExample(skill)}</code>
          </p>
        </div>
      ) : (
        <p className="text-body-md text-on-surface-variant">
          ผู้ฝึกหัดพิสูจน์เก็บไว้ก่อนได้ — เลือกอาชีพเมื่อไรได้สกิลของอาชีพนั้นทันที
        </p>
      )}
      {!proved && (
        <div className="space-y-1">
          <p className="text-label-md font-normal text-on-surface-variant">ทำให้ครบในการรบครั้งเดียว</p>
          <ol className="list-decimal space-y-1 pl-5 text-body-md text-on-surface-variant">
            {requirementsTh.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
