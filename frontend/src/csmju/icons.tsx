/**
 * ไอคอนชุดกลาง (ชุดจำลอง) — เส้น 2px ตาม currentColor ขนาดตั้งด้วย className (ค่าเริ่มต้น h-5 w-5)
 * ชื่อ export ตั้งให้ตรงแบบ `EditIcon` ตามตัวอย่าง `import { EditIcon, … } from "@/csmju"`
 */
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(paths: ReactNode, props: IconProps) {
  const { className = 'h-5 w-5', ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {paths}
    </svg>
  );
}

export const PersonIcon = (p: IconProps) =>
  base(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>, p);
export const CodeIcon = (p: IconProps) =>
  base(<><path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" /><path d="m14 4-4 16" /></>, p);
export const MapIcon = (p: IconProps) =>
  base(<><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15" /><path d="M15 6v15" /></>, p);
export const TowerIcon = (p: IconProps) =>
  base(<><path d="M6 21V8l2-2V3h2v2h4V3h2v3l2 2v13" /><path d="M4 21h16" /><path d="M10 21v-4a2 2 0 0 1 4 0v4" /><path d="M10 11h4" /></>, p);
export const InventoryIcon = (p: IconProps) =>
  base(<><path d="M6 8h12l-1 12H7z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>, p);
export const HistoryIcon = (p: IconProps) =>
  base(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>, p);
export const AssignmentIcon = (p: IconProps) =>
  base(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9 10h6" /><path d="M9 14h6" /><path d="M9 18h3" /></>, p);
export const SwordsIcon = (p: IconProps) =>
  base(<><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /></>, p);
export const SearchIcon = (p: IconProps) =>
  base(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, p);
export const BellIcon = (p: IconProps) =>
  base(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>, p);
export const MenuIcon = (p: IconProps) =>
  base(<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>, p);
export const CloseIcon = (p: IconProps) =>
  base(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, p);
export const LogoutIcon = (p: IconProps) =>
  base(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>, p);
export const EditIcon = (p: IconProps) =>
  base(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>, p);
export const TrashIcon = (p: IconProps) =>
  base(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></>, p);
export const PlusIcon = (p: IconProps) =>
  base(<><path d="M12 5v14" /><path d="M5 12h14" /></>, p);
export const ArrowLeftIcon = (p: IconProps) =>
  base(<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>, p);
export const ChevronRightIcon = (p: IconProps) => base(<path d="m9 18 6-6-6-6" />, p);
export const CheckIcon = (p: IconProps) => base(<path d="M20 6 9 17l-5-5" />, p);
export const AlertIcon = (p: IconProps) =>
  base(<><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></>, p);
export const InfoIcon = (p: IconProps) =>
  base(<><circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>, p);
export const LockIcon = (p: IconProps) =>
  base(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>, p);
export const PlayIcon = (p: IconProps) => base(<path d="M7 4v16l13-8z" />, p);
export const PauseIcon = (p: IconProps) =>
  base(<><path d="M8 5v14" /><path d="M16 5v14" /></>, p);
export const SkipIcon = (p: IconProps) =>
  base(<><path d="m5 4 10 8-10 8z" /><path d="M19 5v14" /></>, p);
export const RefreshIcon = (p: IconProps) =>
  base(<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>, p);
export const SparkIcon = (p: IconProps) =>
  base(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />, p);

export const NAV_ICONS = {
  person: PersonIcon,
  code: CodeIcon,
  map: MapIcon,
  tower: TowerIcon,
  inventory: InventoryIcon,
  history: HistoryIcon,
  assignment: AssignmentIcon,
  swords: SwordsIcon,
} as const;

export type NavIconName = keyof typeof NAV_ICONS;
