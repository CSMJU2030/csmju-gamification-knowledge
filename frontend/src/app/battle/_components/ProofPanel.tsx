/**
 * ผลตรวจบทเรียนของภูมิภาคในการรบครั้งนี้ (8 ต.ค. 2569 · docs/design-skill-acquisition.md ระยะ S1)
 *
 * ได้สกิลครั้งแรก = ประกาศชัดพร้อมโค้ดที่ใช้ได้ทันที · ยังไม่ผ่าน = บอกทีละข้อว่าข้อไหนขาด (ตัวเลขจากการรบจริง)
 * รอบที่ไม่ใช่รอบลึกสุด = ตรวจให้ดูเป็นการฝึก แต่บอกตรง ๆ ว่ายังไม่นับ
 */
import Link from '@/components/AppLink';
import { CheckIcon, CloseIcon, StatusBadge, secondaryButtonClass } from '@/csmju';
import { Alert } from '@/components/feedback';
import type { RegionProof } from '@/lib/api/types';
import { castExample } from '@/lib/game/labels';

export default function ProofPanel({ proof, regionName }: { proof: RegionProof; regionName: string }) {
  const badge = proof.newlyProved
    ? { tone: 'success' as const, text: 'ได้สกิลใหม่' }
    : proof.passed
      ? { tone: 'success' as const, text: 'ผ่าน · ได้สกิลไปแล้ว' }
      : proof.eligible
        ? { tone: 'warning' as const, text: 'ยังไม่ผ่าน' }
        : { tone: 'neutral' as const, text: 'รอบฝึก · ไม่นับ' };

  return (
    <section aria-label={`บทเรียนของ${regionName}`} className="mt-4 space-y-3 rounded-lg border border-outline-variant/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-label-md text-on-surface">บทเรียนของ{regionName}</h3>
        <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>
      </div>

      {proof.newlyProved &&
        (proof.skill ? (
          <Alert tone="success">
            <span className="font-semibold">ได้สกิล {proof.skill.nameTh}</span> — ใช้ในโปรแกรมได้เลย:{' '}
            <code className="font-mono">{castExample(proof.skill)}</code>
          </Alert>
        ) : (
          <Alert tone="success">
            <span className="font-semibold">พิสูจน์บทเรียนของ{regionName}แล้ว</span> — เลือกอาชีพเมื่อไรได้สกิลของอาชีพนั้นทันที
          </Alert>
        ))}

      <ul className="space-y-1.5">
        {proof.checks.map((c) => (
          <li key={c.code} className="flex items-start gap-2 text-body-md">
            {c.ok ? (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            ) : (
              <CloseIcon className="mt-0.5 h-4 w-4 shrink-0 text-error" />
            )}
            <span className={c.ok ? 'text-on-surface' : 'text-on-surface-variant'}>
              <span className="sr-only">{c.ok ? 'ผ่าน: ' : 'ยังไม่ผ่าน: '}</span>
              {c.textTh}
            </span>
          </li>
        ))}
      </ul>

      {proof.newlyProved && proof.skill && (
        <Link href="/program" className={secondaryButtonClass}>
          เปิดโปรแกรมเพื่อใส่สกิลใหม่
        </Link>
      )}
    </section>
  );
}
