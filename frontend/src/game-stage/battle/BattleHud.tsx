/**
 * แถบสถานะใต้เวที — ชื่อ เลเวล HP MP ของผู้เล่นกับศัตรู (ย้ายจาก client/src/battle/BattleHud.tsx)
 *
 * ของเดิมเป็น DOM ซ้อนบน canvas ตกแต่งด้วยสีเกม · ตอนนี้เป็น UI ธรรมดาใต้เวที ใช้ token กลางทั้งหมด
 * (G0 ข้อ 5.2 — แถบ HP/ตัวเลขที่เป็น DOM ไม่ใช่เวทีเกม) เหตุผลที่ย้ายออกจากตัวฉาก:
 * บนมือถือ 360px กล่องศัตรู 4 กล่อง + กล่องผู้เล่นทับฉากจนมองไม่เห็นตัวละคร
 * ในฉากเหลือแค่แถบเลือดพิกเซลเหนือหัว (renderer) ไว้จับคู่ "ตัวไหนในฉาก" กับรายชื่อตรงนี้
 */
import { StatusBadge } from '@/csmju';
import type { Character } from '@/lib/api/types';
import { CLASS_NAMES, fmt } from '@/lib/game/labels';
import type { CombatantView, PlayState } from './director';
import { ENEMY_LIST_MIN_HEIGHT } from './stage-frame';

interface Props {
  play: PlayState;
  /** ตัวละครก่อนรบ — เลเวลและอาชีพของฝั่งผู้เล่น */
  character: Character;
  /** เลเวลที่แสดงบนกล่องศัตรู — มอนผูกกับชั้น · คู่ดวลใช้เลเวลจริงของเขา */
  enemyLevel: number;
  /** เลเวลรายตัวตาม id ของ combatant (มอนของโจทย์ตั้งเลเวลต่างกันได้) — ไม่มี = ใช้ enemyLevel */
  enemyLevels?: Readonly<Record<string, number>>;
  /** หัวข้อของฝั่งตรงข้าม เช่น "ศัตรู" หรือ "คู่ดวล" */
  enemyHeading: string;
}

function hpFill(pct: number): string {
  return pct <= 25 ? 'bg-error' : pct <= 55 ? 'bg-brand-amber' : 'bg-success';
}

/**
 * แถบแนวนอน — ขยับด้วย transform (scaleX) ไม่ใช่ width ตามกฎ motion ข้อ 3.6
 * ตัวเลขเป็นข้อความจริงข้างแถบเสมอ แถบจึง aria-hidden ได้
 */
function Bar({ label, value, max, fill }: { label: string; value: number; max: number; fill: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-label-md">
        <span className="text-on-surface-variant">{label}</span>
        <span className="text-on-surface tabular-nums">
          {fmt(Math.max(0, value))} / {fmt(max)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
        <div
          className={`h-full w-full origin-left rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none ${fill}`}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

function EnemyItem({ c, active, level }: { c: CombatantView; active: boolean; level: number }) {
  const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0;
  return (
    <li
      className={`min-w-0 rounded-lg border p-2 transition-colors duration-150 ${
        active ? 'border-primary-container bg-primary-container/10' : 'border-outline-variant/40'
      } ${c.alive ? '' : 'opacity-60'}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-label-md text-on-surface">{c.name}</span>
        <span className="shrink-0 text-label-sm text-on-surface-variant tabular-nums">Lv {level}</span>
      </div>
      {(c.isBoss || (c.alive && c.windingUp)) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {c.isBoss && <StatusBadge tone="error">บอส</StatusBadge>}
          {c.alive && c.windingUp && <StatusBadge tone="warning">ตั้งท่า ทุบเทิร์นหน้า</StatusBadge>}
        </div>
      )}
      {c.alive ? (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
            <div
              className={`h-full w-full origin-left rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none ${hpFill(pct)}`}
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
          <p className="mt-1 text-right text-label-sm text-on-surface-variant tabular-nums">
            HP {fmt(Math.max(0, c.hp))} / {fmt(c.maxHp)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-label-md text-on-surface-variant">ล้มแล้ว</p>
      )}
    </li>
  );
}

export default function BattleHud({ play, character, enemyLevel, enemyLevels, enemyHeading }: Props) {
  const enemies = play.enemyOrder.map((id) => play.combatants[id]).filter(Boolean);
  const player = play.partyOrder.map((id) => play.combatants[id]).filter(Boolean)[0] ?? null;
  const alive = enemies.filter((e) => e.alive).length;
  const marked = (player?.markedBy?.length ?? 0) > 0;
  const playerPct = player && player.maxHp > 0 ? (player.hp / player.maxHp) * 100 : 0;

  return (
    <div className="grid items-start gap-4 border-t border-outline-variant/40 p-4 md:grid-cols-5 md:gap-6 md:p-6">
      <div
        className={`min-w-0 space-y-2 rounded-lg border p-3 transition-colors duration-150 md:col-span-2 ${
          player && play.activeActor === player.id ? 'border-primary-container bg-primary-container/10' : 'border-outline-variant/40'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-label-md text-on-surface">{player?.name ?? character.displayName}</h3>
          <span className="shrink-0 text-label-md text-on-surface-variant tabular-nums">
            {CLASS_NAMES[character.classId]} · Lv {character.level}
          </span>
        </div>
        {marked && (
          <p className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="warning">ถูกหมายหัว</StatusBadge>
            <code className="font-mono text-label-sm text-on-surface-variant">has_debuff(&quot;marked&quot;)</code>
          </p>
        )}
        {player && (
          <>
            <Bar label="HP" value={player.hp} max={player.maxHp} fill={hpFill(playerPct)} />
            {player.maxMp > 0 && <Bar label="MP" value={player.mp} max={player.maxMp} fill="bg-primary-container" />}
          </>
        )}
      </div>

      <div className="min-w-0 md:col-span-3">
        <h3 className="text-label-md text-on-surface-variant">
          {enemyHeading}
          {enemies.length > 0 && (
            <span className="tabular-nums">
              {' '}
              · เหลือ {alive}/{enemies.length}
            </span>
          )}
        </h3>
        <div className={`mt-2 ${ENEMY_LIST_MIN_HEIGHT}`}>
          {enemies.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">รอเวฟแรกเริ่ม</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {enemies.map((c) => (
                <EnemyItem key={c.id} c={c} active={play.activeActor === c.id} level={enemyLevels?.[c.id] ?? enemyLevel} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
