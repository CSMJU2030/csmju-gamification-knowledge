'use client';

/**
 * ชุดจำลองของ `<CsmjuAppShell>` — เขียนตาม ui-design-system ข้อ 5.1 (แบบ BackOffice)
 * เพราะยังไม่มีสิทธิ์อ่าน template จริง · ของจริงแทนที่ทั้งโฟลเดอร์ `csmju/` เมื่อได้ template
 *
 * หน้าที่ที่ shell ถือไว้ (ระบบย่อยห้ามทำเอง): sidebar · top bar · เมนูผู้ใช้ · ออกจากระบบ
 * กลับ Dashboard · 401 → SSO · skip link · footer
 */
import Link from '@/components/AppLink';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CsmjuLogo } from './CsmjuLogo';
import { BellIcon, CloseIcon, LogoutIcon, MenuIcon, NAV_ICONS, SearchIcon, type NavIconName } from './icons';
import { coreDashboardUrl, redirectToSsoLogin, signOut, takeReturnPath } from './sso';

/**
 * ออกจากระบบ — พากลับหน้าแรกของ Core Hub อย่างเดียว (sso.ts signOut · auth-contract ข้อ 9)
 * เป็นปุ่มไม่ใช่ลิงก์ เพราะต้องกันไม่ให้ 401 ที่ค้างอยู่พาไป SSO ระหว่างเปลี่ยนหน้า
 */
function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        signOut();
      }}
      title="กลับไปหน้าแรกของ Core Hub — ออกจากระบบทั้งหมดทำที่ Core Hub"
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 py-2.5 text-label-md text-white backdrop-blur-sm transition-colors duration-200 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-70"
    >
      <LogoutIcon className="h-4 w-4" />
      {pending ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}
    </button>
  );
}

export interface CsmjuNavItem {
  label: string;
  labelEn: string;
  href: string;
  icon: NavIconName;
}

export interface CsmjuUser {
  id: string;
  email: string;
  coreRole: 'student' | 'alumni' | 'staff' | 'admin';
  subsystemRole: string;
  permissions: string[];
}

type UserState =
  | { status: 'loading' }
  | { status: 'ready'; user: CsmjuUser }
  | { status: 'forbidden'; message: string }
  | { status: 'error' };

const UserContext = createContext<UserState>({ status: 'loading' });

/** ตัวตนจาก `GET /api/v1/me` ที่ shell โหลดไว้ให้ — หน้าลูกใช้ตัดสินว่าจะแสดงปุ่มไหน */
export function useCsmjuUser(): UserState {
  return useContext(UserContext);
}

const CORE_ROLE_TH: Record<CsmjuUser['coreRole'], string> = {
  student: 'นักศึกษา',
  alumni: 'ศิษย์เก่า',
  staff: 'บุคลากร/อาจารย์',
  admin: 'ผู้ดูแลระบบ',
};

function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const letters = local.replace(/[^a-zA-Z]/g, '');
  return (letters.slice(0, 2) || local.slice(0, 2) || '?').toUpperCase();
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface CsmjuAppShellProps {
  subsystemName: string;
  displayName: string;
  nav: CsmjuNavItem[];
  primaryAction?: { label: string; href: string; icon?: NavIconName };
  children: ReactNode;
}

export function CsmjuAppShell({ subsystemName, displayName, nav, primaryAction, children }: CsmjuAppShellProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userState, setUserState] = useState<UserState>({ status: 'loading' });
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (res.status === 401) {
          redirectToSsoLogin();
          return;
        }
        const body = (await res.json().catch(() => null)) as
          | { success: true; data: CsmjuUser }
          | { success: false; error: { message: string } }
          | null;
        if (cancelled) return;
        if (res.status === 403 && body && !body.success) {
          setUserState({ status: 'forbidden', message: body.error.message });
        } else if (res.ok && body && body.success) {
          setUserState({ status: 'ready', user: body.data });
          // กลับจาก SSO แล้ว backend พามาที่ `/` เสมอ — พากลับไปหน้าที่ผู้ใช้อยู่ก่อนหมดเซสชัน
          const back = takeReturnPath();
          if (back && back !== window.location.pathname + window.location.search) router.replace(back);
        } else {
          setUserState({ status: 'error' });
        }
      } catch {
        if (!cancelled) setUserState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // เปลี่ยนหน้าแล้วปิด drawer
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const first = drawerRef.current?.querySelector<HTMLElement>('a, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, closeDrawer]);

  const user = userState.status === 'ready' ? userState.user : null;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-5">
      <Link
        href="/"
        className="block rounded-xl bg-white p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <CsmjuLogo />
        <span className="mt-3 block text-label-md text-on-surface-variant">{displayName}</span>
      </Link>

      {primaryAction && (
        <Link
          href={primaryAction.href}
          className="btn-gradient flex min-h-11 w-full items-center justify-center gap-2 rounded-lg py-3 text-label-md text-on-primary shadow-md hover:scale-[1.02] active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {primaryAction.icon && (() => {
            const Icon = NAV_ICONS[primaryAction.icon];
            return <Icon className="h-4 w-4" />;
          })()}
          {primaryAction.label}
        </Link>
      )}

      <nav aria-label="เมนูหลัก" className="-mx-2 flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = NAV_ICONS[item.icon];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                    active
                      ? 'border-l-4 border-accent bg-white/10 text-white'
                      : 'border-l-4 border-transparent text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-label-md">{item.label}</span>
                    <span lang="en" className="text-caption text-white/50">
                      {item.labelEn}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2">
        <a
          href={coreDashboardUrl()}
          className="flex min-h-11 items-center justify-center rounded-lg px-3 py-2.5 text-label-md text-white/70 transition-colors duration-200 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          กลับหน้าหลัก CSMJU
        </a>
        <SignOutButton />
      </div>
    </div>
  );

  return (
    <UserContext.Provider value={userState}>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-surface-container-lowest px-4 py-2 text-label-md text-primary-container shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>

      <div className="flex min-h-dvh" data-subsystem={subsystemName}>
        {/* sidebar ถาวร (md ขึ้นไป) */}
        <aside className="brand-gradient sticky top-0 z-30 hidden h-dvh w-64 shrink-0 shadow-xl md:block">
          {sidebar}
        </aside>

        {/* drawer มือถือ */}
        <div
          className={`fixed inset-0 z-20 bg-black/40 transition-opacity duration-300 ease-out md:hidden ${
            drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden="true"
          onClick={closeDrawer}
        />
        <aside
          ref={drawerRef}
          id="csmju-drawer"
          aria-label="เมนู"
          aria-hidden={!drawerOpen}
          inert={!drawerOpen}
          className={`brand-gradient fixed inset-y-0 left-0 z-30 flex w-64 flex-col shadow-xl transition-transform duration-300 ease-out md:hidden ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex justify-end px-3 pt-3">
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="ปิดเมนู"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{sidebar}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-surface-variant bg-surface-container-lowest px-4 shadow-sm md:px-12">
            <button
              ref={menuButtonRef}
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-variant/50 focus-visible:outline-2 focus-visible:outline-primary-container md:hidden"
              aria-label="เปิดเมนู"
              aria-expanded={drawerOpen}
              aria-controls="csmju-drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon className="h-6 w-6" />
            </button>
            <span className="truncate font-display text-label-md font-bold text-gradient md:hidden">{displayName}</span>

            <div className="mx-auto hidden w-full max-w-md md:block">
              <label className="relative block">
                <span className="sr-only">ค้นหา</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-outline" />
                <input
                  type="search"
                  disabled
                  placeholder="ค้นหาทั่วระบบ (ยังไม่เปิดในชุดจำลอง)"
                  className="w-full rounded-full border border-transparent bg-surface py-2 pr-4 pl-10 text-body-md text-on-surface placeholder:text-outline/70 disabled:cursor-not-allowed"
                />
              </label>
            </div>

            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <button
                type="button"
                disabled
                aria-label="การแจ้งเตือน (ยังไม่มีรายการ)"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant disabled:cursor-not-allowed"
              >
                <BellIcon className="h-6 w-6" />
              </button>
              <div className="flex items-center gap-3">
                {user ? (
                  <>
                    <span className="hidden text-right md:block">
                      <span className="block max-w-48 truncate text-label-md text-on-surface">{user.email}</span>
                      <span className="block text-caption text-on-surface-variant">{CORE_ROLE_TH[user.coreRole]}</span>
                    </span>
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant/50 bg-primary-container text-label-md text-on-primary"
                      aria-label={`ผู้ใช้ ${user.email}`}
                      role="img"
                    >
                      {initials(user.email)}
                    </span>
                  </>
                ) : (
                  <span className="skeleton h-9 w-9 rounded-full" aria-hidden="true" />
                )}
              </div>
            </div>
          </header>

          <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
            <div className="mx-auto w-full max-w-[1280px] space-y-8 px-4 py-8 md:px-12 md:py-12">
              {userState.status === 'forbidden' ? (
                <ShellMessage
                  title="ไม่มีสิทธิ์ใช้งานระบบนี้"
                  body={`บทบาทของคุณยังเข้าใช้ ${displayName} ไม่ได้ หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ`}
                />
              ) : userState.status === 'error' ? (
                <ShellMessage
                  title="เชื่อมต่อระบบไม่สำเร็จ"
                  body="ระบบขัดข้องชั่วคราว กรุณาโหลดหน้าใหม่อีกครั้ง"
                />
              ) : (
                children
              )}
            </div>
          </main>

          <footer className="border-t border-outline-variant/30 bg-surface-container-low">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 py-6 text-caption text-on-surface-variant md:flex-row md:items-center md:justify-between md:px-12">
              <span>© 2026 สาขาวิชาวิทยาการคอมพิวเตอร์ มหาวิทยาลัยแม่โจ้</span>
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                <span>ติดต่อเรา</span>
                <span>นโยบายความเป็นส่วนตัว</span>
                <span>ทำเนียบบุคลากร</span>
                <span>ปฏิทินการศึกษา</span>
              </span>
            </div>
          </footer>
        </div>
      </div>
    </UserContext.Provider>
  );
}

function ShellMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-sm md:p-12" role="alert">
      <h1 className="font-display text-headline-md text-on-surface">{title}</h1>
      <p className="mt-2 max-w-prose text-body-md text-on-surface-variant">{body}</p>
    </div>
  );
}
