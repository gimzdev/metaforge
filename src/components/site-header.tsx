'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft, LogIn, LogOut, Search, User, X } from '@/components/icons';
import { Art } from '@/components/art';
import { GameImage } from '@/components/game/game-image';
import { Wordmark } from '@/components/logo';
import { usePlayerSuggestions } from '@/components/player/player-search';
import { useApp } from '@/components/providers';
import { useEdgeFade } from '@/components/ui-client';
import { setPlatform, usePrefs } from '@/lib/prefs';
import { PLATFORMS, platformLabel } from '@/lib/riot/regions';
import { brand, NAV } from '@/lib/site';
import { costColor, currentIndex, traitKindLabel } from '@/lib/static';
import type { StatusPayload } from '@/lib/status';
import { MenuOrder, type MenuGroup, type MenuRow } from '@/lib/command-menu';
import { cn, fmt, parseRiotId, riotIdToSlug } from '@/lib/utils';

interface Row extends MenuRow {
  href: string;
  body: ReactNode;
}
interface RowGroup extends MenuGroup<Row> {
  heading: string;
}

const PAGES: RowGroup = {
  id: 'pages',
  heading: 'Pages',
  rows: NAV.map((n) => ({
    id: `p:${n.href}`,
    value: `page ${n.label}`,
    href: n.href,
    body: (
      <>
        <n.icon className="size-4 shrink-0 text-lichen" aria-hidden />
        {n.label}
      </>
    ),
  })),
};

const playerName = (gameName: string, tagLine: string, lead = '') => (
  <>
    <User className="size-4 shrink-0 text-lichen" aria-hidden />
    <span className="truncate">
      {lead}
      {gameName}
      <span className="text-fog">#{tagLine}</span>
    </span>
  </>
);

/** Header search: champions, traits, items, pages and players (known by name, else by Riot ID); / or Ctrl+K. */
function HeaderSearch({ className, shortcut = true }: { className?: string; shortcut?: boolean }) {
  const router = useRouter();
  const { platform, recent } = usePrefs();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Where focus was before / or Ctrl+K: Escape hands it back. */
  const back = useRef<HTMLElement | null>(null);
  const order = useRef<MenuOrder>(null);
  order.current ??= new MenuOrder();
  // Matched without the spaces around it, so a pasted "Name#TAG " still finds the player.
  const needle = query.trim().replace(/\s+/g, ' ');
  const riotId = parseRiotId(query);
  const listId = `search-${shortcut ? 'wide' : 'narrow'}`;
  // Only while the list is open and no #TAG is typed, so typing elsewhere never sends requests.
  const known = usePlayerSuggestions(open && !riotId ? needle : '', platform);
  const index = currentIndex();

  // Built once per game data, so typing only re-scores the rows and their pictures don't render again.
  const catalog = useMemo<RowGroup[]>(
    () => [
      {
        id: 'champions',
        heading: 'Champions',
        rows: index.data.champions.map((c) => ({
          id: `c:${c.key}`,
          value: `champion ${c.name}`,
          href: `/units/${c.slug}`,
          body: (
            <>
              <span aria-hidden className="shrink-0 rounded-md p-px" style={{ background: costColor(c.cost) }}>
                <GameImage src={c.icon} alt={c.name} px={28} className="size-7 rounded-[5px]" />
              </span>
              <span className="truncate">{c.name}</span>
              <span className="ml-auto shrink-0 text-xs text-fog">{c.cost}-cost</span>
            </>
          ),
        })),
      },
      {
        id: 'traits',
        heading: 'Traits',
        rows: index.data.traits.map((t) => ({
          id: `t:${t.key}`,
          value: `trait ${t.name}`,
          href: `/traits/${t.slug}`,
          body: (
            <>
              <span aria-hidden className="shrink-0">
                <GameImage src={t.icon} alt={t.name} contain className="size-7 bg-transparent" />
              </span>
              <span className="truncate">{t.name}</span>
              <span className="ml-auto shrink-0 text-xs capitalize text-fog">{traitKindLabel(t)}</span>
            </>
          ),
        })),
      },
      {
        id: 'items',
        heading: 'Items',
        rows: index.data.items
          .filter((i) => i.category !== 'special' && i.category !== 'consumable')
          .map((i) => ({
            id: `i:${i.key}`,
            value: `item ${i.name}`,
            href: `/items/${i.slug}`,
            body: (
              <>
                <span aria-hidden className="shrink-0">
                  <GameImage src={i.icon} alt={i.name} className="size-7 rounded" />
                </span>
                <span className="truncate">{i.name}</span>
              </>
            ),
          })),
      },
    ],
    [index],
  );

  const spec = useMemo(() => {
    const groups: RowGroup[] = [];
    if (riotId) {
      groups.push({
        id: 'player',
        heading: 'Player',
        rows: [
          {
            id: 'player',
            value: `player ${needle}`,
            href: `/player/${platform}/${riotIdToSlug(riotId.gameName, riotId.tagLine)}`,
            body: (
              <>
                {playerName(riotId.gameName, riotId.tagLine, 'Look up ')}
                <select
                  aria-label="Region"
                  value={platform}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="ml-auto h-7 shrink-0 rounded-md border border-line-strong bg-night px-1.5 text-xs text-lichen"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <CornerDownLeft className="size-3.5 shrink-0 text-fog" aria-hidden />
              </>
            ),
          },
        ],
      });
    }
    if (known.players.length) {
      groups.push({
        id: 'known',
        heading: 'Players',
        rows: known.players.map((k) => ({
          id: `k:${k.platform}:${k.gameName}#${k.tagLine}`,
          value: `${needle} player ${k.gameName} ${k.tagLine} ${k.platform}`,
          href: `/player/${k.platform}/${riotIdToSlug(k.gameName, k.tagLine)}`,
          body: (
            <>
              {playerName(k.gameName, k.tagLine)}
              <span className="ml-auto shrink-0 text-xs text-fog">
                {platformLabel(k.platform)}
                {k.tier ? ` · ${k.tier.charAt(0)}${k.tier.slice(1).toLowerCase()}` : ''}
              </span>
            </>
          ),
        })),
      });
    }
    if (!needle && recent.length) {
      groups.push({
        id: 'recent',
        heading: 'Recent players',
        rows: recent.map((r) => ({
          id: `r:${r.gameName}#${r.tagLine}`,
          value: `recent ${r.gameName} ${r.tagLine}`,
          href: `/player/${r.platform}/${riotIdToSlug(r.gameName, r.tagLine)}`,
          body: (
            <>
              {playerName(r.gameName, r.tagLine)}
              <span className="ml-auto shrink-0 text-xs text-fog">{platformLabel(r.platform)}</span>
            </>
          ),
        })),
      });
    }
    if (needle) groups.push(...catalog);
    groups.push(PAGES);
    return groups;
  }, [needle, riotId?.gameName, riotId?.tagLine, platform, recent, known.players, catalog]);

  const groups = useMemo(() => order.current!.update(open, spec, needle), [open, spec, needle]);
  const flat = groups.flatMap((g) => g.rows);
  const selected = order.current.value;
  const at = flat.findIndex((r) => r.value === selected);
  const setPick = (value: string) => {
    order.current!.value = value;
    redraw();
  };

  // Bring the entry picked with the keys into view (MenuOrder.scrollTo covers searches).
  const keyed = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = keyed.current ?? order.current!.scrollTo;
    keyed.current = null;
    order.current!.scrollTo = null;
    const i = open && target !== null ? flat.findIndex((r) => r.value === target) : -1;
    const el = i >= 0 ? document.getElementById(`${listId}-${i}`) : null;
    if (!el) return;
    if (el.parentElement?.firstElementChild === el) el.parentElement.previousElementSibling?.scrollIntoView({ block: 'nearest' });
    el.scrollIntoView({ block: 'nearest' });
  });

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        // Only the visible search bar takes the shortcut.
        if (!input.current || input.current.offsetParent === null) return;
        e.preventDefault();
        const from = document.activeElement;
        if (from instanceof HTMLElement && from !== document.body && !wrap.current?.contains(from)) back.current = from;
        input.current.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    back.current = null;
    input.current?.blur();
    router.push(href);
  };

  // Arrows (Alt jumps groups, Meta to the ends, wrapping), Ctrl+N/J/P/K, Home, End, Enter; only in the field, so
  // the region picker and clear button keep their own keys.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== input.current || e.defaultPrevented || e.nativeEvent.isComposing || e.keyCode === 229) return;
    // With the list closed (after Escape), the arrows and Enter open it again.
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    const to = (i: number) => {
      if (!flat[i]) return;
      keyed.current = flat[i].value;
      setPick(flat[i].value);
    };
    const step = (dir: 1 | -1) => {
      e.preventDefault();
      if (!flat.length) return;
      if (e.metaKey) return to(dir > 0 ? flat.length - 1 : 0);
      if (e.altKey) {
        const g = groups.findIndex((x) => x.rows.some((r) => r.value === selected));
        for (let k = g + dir; g >= 0 && k >= 0 && k < groups.length; k += dir) {
          if (groups[k].rows.length) return to(flat.indexOf(groups[k].rows[0]));
        }
      }
      // Wraps around; with nothing picked, down starts at the top and up at the bottom.
      to(at < 0 ? (dir > 0 ? 0 : flat.length - 1) : (at + dir + flat.length) % flat.length);
    };
    if (e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'n' || e.key === 'j'))) step(1);
    else if (e.key === 'ArrowUp' || (e.ctrlKey && (e.key === 'p' || e.key === 'k'))) step(-1);
    else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      to(e.key === 'Home' ? 0 : flat.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (at >= 0) go(flat[at].href);
    }
  };

  return (
    <div
      ref={wrap}
      className={cn('relative', className)}
      onBlur={(e) => {
        // Tabbing out closes the list.
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          back.current = null;
        }
      }}
    >
      <div className="relative" tabIndex={-1} onKeyDown={onKeyDown}>
        <label htmlFor={`${listId}-input`} className="sr-only">Search MetaForge</label>
        <div
          className={cn(
            'flex h-11 items-center gap-3 rounded-lg border bg-canopy pl-3.5 pr-2 transition-colors',
            open ? 'border-lichen/45' : 'border-line-strong hover:border-lichen/30 focus-within:border-lichen/45',
          )}
        >
          <Search className="size-[18px] shrink-0 text-fog" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
              // Focus goes back to where / or Ctrl+K took it from, otherwise it stays here.
              setOpen(false);
              const to = back.current;
              back.current = null;
              if (to?.isConnected) to.focus();
            }}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && at >= 0 ? `${listId}-${at}` : undefined}
            id={`${listId}-input`}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search champions, items or players"
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-moon outline-none placeholder:text-fog"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                input.current?.focus();
              }}
              className="grid size-8 shrink-0 place-items-center rounded-md text-lichen hover:bg-white/5 hover:text-moon"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded border border-line-strong px-1.5 py-px font-sans text-[11px] text-fog lg:block">/</kbd>
          )}
        </div>

        {open && (
          <div
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            tabIndex={-1}
            className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[min(70vh,560px)] overflow-y-auto rounded-lg border border-line-strong bg-canopy p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)] scroll-thin"
          >
            {!flat.length && (
              <div className="px-3 py-8 text-center text-sm text-lichen">
                {known.pending ? 'Looking for players…' : 'Nothing found. For a player MetaForge has not seen yet, type the full Riot ID, like Name#TAG.'}
              </div>
            )}
            {groups.map((g) => (
              <div key={g.id} role="presentation" className="text-xs text-fog">
                <div aria-hidden className="px-3 pb-1.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em]">
                  {g.heading}
                </div>
                <div role="group" aria-label={g.heading}>
                  {g.rows.map((r) => {
                    const i = flat.indexOf(r);
                    const on = r.value === selected;
                    return (
                      <div
                        key={r.id}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={on}
                        onPointerMove={() => !on && setPick(r.value)}
                        onClick={() => {
                          setPick(r.value);
                          go(r.href);
                        }}
                        className={cn('flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm', on ? 'bg-white/[0.05] text-moon' : 'text-lichen')}
                      >
                        {r.body}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Data-health line: green when matches are flowing, amber when something needs attention. */
function DataStatus() {
  const [data, setData] = useState<StatusPayload | null>(null);
  useEffect(() => {
    let alive = true;
    // Shown only on lg screens, so phones never poll.
    const wide = window.matchMedia('(min-width: 64rem)');
    const load = () => {
      if (!wide.matches) return;
      fetch('/api/status', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: StatusPayload) => alive && setData(d))
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && load(), 60_000);
    wide.addEventListener('change', load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      wide.removeEventListener('change', load);
    };
  }, []);
  if (!data) return <span className="hidden h-4 w-24 rounded bg-bark/60 lg:block" />;
  const [tone, label] = !data.riotKey
    ? ['bg-firefly', 'No API key']
    : data.keyRejectedAt && Date.now() - data.keyRejectedAt < 30 * 60_000
      ? ['bg-bloom', 'Key rejected']
      : !data.boards
        ? ['bg-firefly', data.collecting ? 'Collecting' : 'No matches yet']
        : ['bg-good', data.lastMatchAt ? `Updated ${fmt.ago(data.lastMatchAt)}` : `${fmt.compact(data.boards)} boards`];
  return (
    <span title={`${fmt.int(data.boards)} boards stored`} className="hidden items-center gap-2 text-[13px] text-lichen lg:inline-flex">
      <span className={cn('size-1.5 rounded-full', tone, data.collecting && 'animate-pulse-soft')} />
      <span className="num">{label}</span>
    </span>
  );
}

function Account() {
  const { session, rsoEnabled } = useApp();
  const box = 'inline-flex h-9 items-center rounded-lg border border-line-strong text-[13px] font-medium hover:border-lichen/40';
  if (session) {
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/profile" className={cn(box, 'gap-2 px-3 text-moon')} title={`${session.gameName}#${session.tagLine}`}>
          <User className="size-3.5 text-wisp" aria-hidden />
          <span className="hidden max-w-[7rem] truncate sm:inline">{session.gameName}</span>
        </Link>
        {/* POST only, so prefetching a link can never end a session. */}
        <form action="/api/auth/logout" method="post">
          <button type="submit" title="Sign out" className={cn(box, 'gap-1.5 px-3 text-lichen hover:border-bloom/50 hover:text-bloom')}>
            <LogOut className="size-3.5" aria-hidden />
            <span className="sr-only sm:not-sr-only">Sign out</span>
          </button>
        </form>
      </div>
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
    <a href="/api/auth/login" className={cn(box, 'gap-1.5 px-3 text-lichen hover:text-moon')}>
      <LogIn className="size-3.5" aria-hidden />
      <span className="sr-only sm:not-sr-only">Sign in with Riot</span>
    </a>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  // Narrow screens scroll the nav sideways: keep the current page in view, fade the edge when there is more.
  const edge = useEdgeFade(scroller, [pathname]);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
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
        <HeaderSearch className="w-full" shortcut={false} />
      </div>
      <nav aria-label="Main">
        <div
          ref={scroller}
          className={cn(
            'relative mx-auto flex h-11 max-w-[1400px] items-stretch gap-7 overflow-x-auto px-4 scroll-thin [scrollbar-width:none] sm:px-6',
            edge.right && '[mask-image:linear-gradient(to_right,black_calc(100%-56px),transparent)]',
          )}
        >
          {NAV.map((n) => {
            const on = active(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={cn('relative inline-flex shrink-0 items-center text-[14px] transition-colors', on ? 'text-moon' : 'text-lichen hover:text-moon')}
              >
                {n.label}
                {on && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-wisp" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

const FRAMED = /^\/(guides|leaderboard|units|items|traits|comps)(\/|$)/;

/** bg.jpg behind every page: full strength on home, elsewhere a quieter horizon (blurred on FRAMED pages), plus grain. */
export function SiteBackdrop() {
  const path = usePathname();
  const art = brand.background;
  return (
    <>
      {art &&
        (path === '/' ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] overflow-hidden sm:h-[820px] short:h-[min(820px,calc(100svh_-_78px))]"
          >
            <Art src={art} lead className="object-cover object-[38%_30%] opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-r from-night/95 via-night/60 to-night/10" />
            <div className="absolute inset-0 bg-gradient-to-b from-night/25 via-night/10 to-night" />
          </div>
        ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_30%,transparent)] sm:h-[680px]"
          >
            {/* Darkened with brightness rather than opacity, so the art keeps its contrast. */}
            <Art
              src={art}
              className={cn('object-cover object-[55%_0%]', FRAMED.test(path) ? 'scale-105 blur-[5px] brightness-55 contrast-110' : 'brightness-62 contrast-112')}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-night/85 via-night/40 to-night/5" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-night/35" />
          </div>
        ))}
      <div aria-hidden className="grain pointer-events-none fixed inset-0 -z-10 opacity-[0.035]" />
    </>
  );
}
