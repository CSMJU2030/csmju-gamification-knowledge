/**
 * การ์ด "สกิลที่เรียกด้วย cast() ได้" — UI กลาง (การ์ด token) ไม่ใช่เวทีเกม
 *
 * ทำไมต้องมี: ในมุมมองโค้ด ผู้เล่นพิมพ์ cast("...") เอง แต่ไม่มีที่ไหนบอกว่าชื่อที่ถูกคืออะไร
 * ของเดิมรู้ได้ทางเดียวคือเปิดเมนูช่องสกิลในมุมมองบล็อก ซึ่งถาดซ่อนอยู่ในมุมมองโค้ด
 * การ์ดนี้จึงอยู่คอลัมน์ข้างและแสดงทั้งสองมุมมอง
 */
import { FEATURE_LABEL_TH, FEATURE_UNLOCK } from '@tower/engine/lang';
import { StatusBadge, cardClass } from '@/csmju';
import type { SkillOption } from './holes';

interface Props {
  skills: SkillOption[];
  /** ไวยากรณ์ string (ข้อความในเครื่องหมายคำพูด) ปลดล็อกแล้วหรือยัง — cast() ต้องใช้ */
  canCast: boolean;
}

export default function SkillsCard({ skills, canCast }: Props) {
  return (
    <section aria-labelledby="blox-skills-title" className={`${cardClass} p-4`}>
      <h2 id="blox-skills-title" className="text-label-md text-on-surface">
        สกิลที่เรียกด้วย <code lang="en" className="font-mono">cast()</code> ได้
      </h2>

      {skills.length === 0 ? (
        <p className="mt-2 text-body-md text-on-surface-variant">
          ยังไม่มีสกิลที่ใช้ได้ — เลือกอาชีพหลังผ่านชั้น 1 แล้วอัพเลเวลเพื่อปลดสกิล
        </p>
      ) : (
        <>
          {!canCast && (
            <p className="mt-2 text-body-md text-on-surface-variant">
              ต้องผ่านชั้น {FEATURE_UNLOCK.string} ก่อน ({FEATURE_LABEL_TH.string}) ถึงจะเขียน cast() ได้
            </p>
          )}
          <p className="mt-2 text-body-md text-on-surface-variant">
            ใส่ชื่อในเครื่องหมายคำพูดเป็นค่าแรก เช่น{' '}
            <code lang="en" className="font-mono text-on-surface">
              cast(&quot;{skills[0].codeName}&quot;, {skills[0].aoe ? 'enemies' : 'weakest(enemies)'})
            </code>
          </p>
          <ul className="mt-3 divide-y divide-outline-variant/40">
            {skills.map((s) => (
              <li key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                <code lang="en" className="block font-mono text-label-md wrap-anywhere text-primary-container">
                  &quot;{s.codeName}&quot;
                </code>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-body-md text-on-surface">{s.nameTh}</span>
                  <span className="text-label-sm text-on-surface-variant tabular-nums">MP {s.mpCost}</span>
                  {s.aoe && <StatusBadge tone="info">วงกว้าง</StatusBadge>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
