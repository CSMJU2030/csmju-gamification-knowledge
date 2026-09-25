/**
 * ถาดบล็อก — สร้างจาก BLOCK_CATALOG ทั้งหมด (schema.ts §3)
 *
 * กรอบของถาด (หัวข้อ ปุ่มยุบ หัวหมวด) เป็น UI กลาง ใช้ token · ตัวบล็อกในถาดเป็นบล็อกสีแบบเวทีเกม
 * เพราะมันคือของชิ้นเดียวกับที่จะไปโผล่ในโปรแกรม — ถ้าถาดเป็นตัวหนังสือเทาแล้วลากลงไปกลายเป็น
 * บล็อกสี ผู้เล่นจะเสียการเชื่อมโยงนั้นทันที
 *
 * บล็อกที่ยังไม่ปลดล็อกต้อง "เห็นแต่ใช้ไม่ได้" ไม่ใช่ซ่อน
 * เพราะหลักสูตรของเกมซ่อนอยู่ในรายการนี้ — ผู้เล่นควรเห็นว่ามีอะไรรออยู่ที่ชั้นไหน
 */
import { FEATURE_LABEL_TH, FEATURE_UNLOCK, type Feature } from '@tower/engine/lang';
import { ChevronRightIcon, LockIcon } from '@/csmju';
import { BLOCK_CATALOG, CATEGORY_LABEL_TH, type BlockCategory, type BlockDef } from './schema';
import type { DropKind, StartDrag } from './useBlockDrag';

const ORDER: BlockCategory[] = ['action', 'magic', 'control', 'basic'];

interface Props {
  unlocked: ReadonlySet<Feature>;
  /** id ของบล็อกที่ถูกแตะเลือกไว้เพื่อรอวาง */
  armedId: string | null;
  open: boolean;
  onToggle: () => void;
  onStartDrag: StartDrag;
  /** แตะ/คลิก/Enter บนบล็อกในถาด = เลือกไว้รอวาง (ทางเลือกแทนการลาก — schema.ts §5) */
  onArm: (blockId: string) => void;
}

export const paletteMode = (blockId: string): DropKind => (blockId === 'else' ? 'else' : 'slot');

export function lockNoteOf(def: BlockDef): string {
  if (!def.needs) return '';
  const needFloor = FEATURE_UNLOCK[def.needs];
  return needFloor >= 999
    ? `${FEATURE_LABEL_TH[def.needs]} — ยังไม่เปิดในเฟสนี้`
    : `ต้องผ่านชั้น ${needFloor} ก่อน (${FEATURE_LABEL_TH[def.needs]})`;
}

export default function Palette({ unlocked, armedId, open, onToggle, onStartDrag, onArm }: Props) {
  return (
    // ไม่ทำ sticky: ถาดสูงกว่าจอ ถ้าติดหน้าจอต้องเลื่อนในกล่องซ้อน ซึ่งบล็อกท้ายถาดดูเหมือนถูกตัดหาย
    // โปรแกรมยาวไม่เกิน 60 บรรทัด และมีทางแตะเลือกแล้วแตะวาง (ไม่ต้องลากข้ามจอ) อยู่แล้ว
    <aside aria-label="ถาดบล็อก" className="min-w-0">
      <h2 className="hidden text-label-md text-on-surface lg:block">ถาดบล็อก</h2>
      {/* จอแคบ: ถาดยุบได้ (PM สั่งเมื่อ 19 ก.ย. 2026 — ถาดกินทั้งจอแรกจนมองไม่เห็นโปรแกรมตัวเอง) */}
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-outline-variant/60 px-3 text-label-md text-on-surface transition-colors duration-150 hover:bg-surface-variant/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container lg:hidden"
        aria-expanded={open}
        aria-controls="blox-palette-body"
        onClick={onToggle}
      >
        <span>ถาดบล็อก</span>
        <ChevronRightIcon
          className={`h-5 w-5 text-outline transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
      </button>

      <div id="blox-palette-body" className={`${open ? 'block' : 'hidden'} lg:block`}>
        {ORDER.map((cat) => {
          const items = BLOCK_CATALOG.filter((b) => b.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat} className="mt-3">
              <h3 className="mb-2 text-label-md text-on-surface-variant">{CATEGORY_LABEL_TH[cat]}</h3>
              {/* จอแคบ: เลื่อนแนวนอนในแถวของหมวด — กินความสูงน้อยที่สุด และไม่ดันหน้าให้เลื่อนข้าง */}
              <div className="-mx-1 flex gap-2 overflow-x-auto p-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:p-0">
                {items.map((def) => (
                  <PaletteBlock
                    key={def.id}
                    def={def}
                    locked={def.needs !== undefined && !unlocked.has(def.needs)}
                    armed={armedId === def.id}
                    onStartDrag={onStartDrag}
                    onArm={onArm}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function PaletteBlock({
  def,
  locked,
  armed,
  onStartDrag,
  onArm,
}: {
  def: BlockDef;
  locked: boolean;
  armed: boolean;
  onStartDrag: StartDrag;
  onArm: (blockId: string) => void;
}) {
  const note = locked ? lockNoteOf(def) : def.hintTh;
  return (
    <button
      type="button"
      className={`blk-pal blk-pal--${def.category} w-40 shrink-0 lg:w-full ${locked ? 'is-locked' : 'draggable'}${armed ? ' is-armed' : ''}`}
      // disabled ธรรมดาจะทำให้ Tab ข้ามไปเลย ผู้ใช้โปรแกรมอ่านหน้าจอจะไม่รู้ว่ามีบล็อกนี้รออยู่
      aria-disabled={locked || undefined}
      aria-pressed={locked ? undefined : armed}
      onPointerDown={locked ? undefined : (e) => onStartDrag(e, { from: 'palette', blockId: def.id }, def.label, paletteMode(def.id))}
      onClick={locked ? undefined : () => onArm(def.id)}
    >
      <span lang="en" className="blk-pal__label">
        {locked && <LockIcon className="mr-1 inline h-4 w-4 align-[-2px]" />}
        {def.label}
      </span>
      <span className="blk-pal__hint">{note}</span>
    </button>
  );
}
