'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogIn, User } from 'lucide-react';
import { useApp } from '@/components/providers';
import type { StatusPayload } from '@/lib/status-types';
import { cn, fmt } from '@/lib/utils';
import { usePrefs } from '@/lib/prefs';
import { HeaderSearch } from './header-search';
import { Wordmark } from './logo';
import { NAV } from './nav';

function useStatus() {
  return useQuery<StatusPayload>({
    queryKey: ['status'],
    queryFn: () => fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Small data-health line: green when matches are flowing, amber when something needs attention. */
function DataStatus() {
  const { data } = useStatus();
  if (!data) return <span className="hidden h-4 w-24 rounded bg-bark/60 lg:block" />;
  let tone = 'bg-good';
  let label = data.lastMatchAt ? `Updated ${fmt.ago(data.lastMatchAt)}` : `${fmt.compact(data.boards)} boards`;
  if (!data.riotKey) {
    tone = 'bg-firefly';
    label = 'No API key';
  } else if (data.keyRejectedAt && Date.now() - data.keyRejectedAt < 30 * 60_000) {
    tone = 'bg-bloom';
    label = 'Key rejected';
  } else if (!data.boards) {
    tone = 'bg-firefly';
    label = data.collecting ? 'Collecting' : 'No matches yet';
  }
  return (
    <span title={`${fmt.int(data.boards)} boards stored`} className="hidden items-center gap-2 text-[13px] text-lichen lg:inline-flex">
      <span className={cn('size-1.5 rounded-full', tone, data.collecting && 'animate-pulse-soft')} />
      <span className="num">{label}</span>
    </span>
  );
}

function Account() {
  const { session, rsoEnabled } = useApp();
  if (session) {
    return (
      <Link
        href="/profile"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-moon hover:border-lichen/40"
        title={`${session.gameName}#${session.tagLine}`}
      >
        <User className="size-3.5 text-wisp" aria-hidden />
        <span className="hidden max-w-[7rem] truncate sm:inline">{session.gameName}</span>
      </Link>
    );
  }
  if (!rsoEnabled) {
    return (
      <Link
        href="/profile"
        aria-label="Your profile"
        className="inline-flex size-9 items-center justify-center rounded-lg border border-line-strong text-lichen hover:border-lichen/40 hover:text-moon"
      >
        <User className="size-4" aria-hidden />
      </Link>
    );
  }
  return (
    <a
      href="/api/auth/login"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-lichen hover:border-lichen/40 hover:text-moon"
    >
      <LogIn className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Sign in with Riot</span>
    </a>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { currentPatch } = useApp();
  usePrefs(); // hydrate saved region and recent players early
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  // On narrow screens the nav scrolls sideways: keep the current page in view
  // and fade the right edge while there is more to scroll to.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const tab = box.querySelector<HTMLElement>('[aria-current="page"]');
    if (tab && box.scrollWidth > box.clientWidth) box.scrollLeft = tab.offsetLeft - (box.clientWidth - tab.offsetWidth) / 2;
    const update = () => setMore(box.scrollLeft + box.clientWidth < box.scrollWidth - 4);
    update();
    box.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => {
      box.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [pathname]);

  return (
    <header className="z-40 border-b border-line bg-night/[0.97] md:sticky md:top-0">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md" aria-label="MetaForge home">
          <Wordmark />
        </Link>
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <HeaderSearch className="w-full max-w-2xl" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-5 md:ml-0">
          <DataStatus />
          <Account />
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden">
        <HeaderSearch className="w-full" autoFocusShortcut={false} />
      </div>
      <nav aria-label="Main">
        <div
          ref={scroller}
          className={cn(
            'relative mx-auto flex h-11 max-w-[1400px] items-stretch gap-7 overflow-x-auto px-4 scroll-thin [scrollbar-width:none] sm:px-6',
            more && '[mask-image:linear-gradient(to_right,black_calc(100%-56px),transparent)]',
          )}
        >
          {NAV.map((n) => {
            const on = active(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'relative inline-flex shrink-0 items-center text-[14px] transition-colors',
                  on ? 'text-moon' : 'text-lichen hover:text-moon',
                )}
              >
                {n.href === '/news' && currentPatch ? `Patch ${currentPatch}` : n.label}
                {on && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-wisp" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
