'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft, Search, User, X } from 'lucide-react';
import { useStatic } from '@/components/providers';
import { GameImage } from '@/components/game/game-image';
import { usePrefs } from '@/lib/prefs';
import { PLATFORMS, platformLabel } from '@/lib/riot/regions';
import { costColor } from '@/lib/static-index';
import { cn, parseRiotId, riotIdToSlug } from '@/lib/utils';
import { NAV } from './nav';

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="text-xs text-fog [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em]"
    >
      {children}
    </Command.Group>
  );
}

function Item({ value, onSelect, children }: { value: string; onSelect: () => void; children: ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-lichen data-[selected=true]:bg-white/[0.05] data-[selected=true]:text-moon"
    >
      {children}
    </Command.Item>
  );
}

/**
 * The big search bar in the header: champions, traits, items, pages and
 * players by Riot ID, with results right under the field. Press / or Ctrl+K.
 */
export function HeaderSearch({ className, autoFocusShortcut = true }: { className?: string; autoFocusShortcut?: boolean }) {
  const router = useRouter();
  const index = useStatic();
  const { platform, setPlatform, recent } = usePrefs();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const riotId = useMemo(() => parseRiotId(query), [query]);
  const needle = query.trim();

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);

  useEffect(() => {
    if (!autoFocusShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        // Only the visible search bar takes the shortcut.
        if (!input.current || input.current.offsetParent === null) return;
        e.preventDefault();
        input.current.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autoFocusShortcut]);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    input.current?.blur();
    router.push(href);
  };

  const items = useMemo(
    () => index.data.items.filter((i) => i.category !== 'special' && i.category !== 'consumable'),
    [index],
  );

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <Command label="Search MetaForge" loop className="relative">
        <div
          className={cn(
            'flex h-11 items-center gap-3 rounded-lg border bg-canopy pl-3.5 pr-2 transition-colors',
            open ? 'border-lichen/45' : 'border-line-strong hover:border-lichen/30',
          )}
        >
          <Search className="size-[18px] shrink-0 text-fog" aria-hidden />
          <Command.Input
            ref={input}
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                input.current?.blur();
              }
            }}
            placeholder="Search champions, items, traits or Name#TAG"
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
          <Command.List className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[min(70vh,560px)] overflow-y-auto rounded-lg border border-line-strong bg-canopy p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)] scroll-thin">
            <Command.Empty className="px-3 py-8 text-center text-sm text-lichen">
              Nothing found. Players are found by their full Riot ID, like Name#TAG.
            </Command.Empty>

            {riotId && (
              <Group heading="Player">
                <Item
                  value={`player ${query}`}
                  onSelect={() => go(`/player/${platform}/${riotIdToSlug(riotId.gameName, riotId.tagLine)}`)}
                >
                  <User className="size-4 text-lichen" aria-hidden />
                  <span className="truncate">
                    Look up {riotId.gameName}
                    <span className="text-fog">#{riotId.tagLine}</span>
                  </span>
                  <select
                    aria-label="Region"
                    value={platform}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="ml-auto h-7 rounded-md border border-line-strong bg-night px-1.5 text-xs text-lichen outline-none"
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <CornerDownLeft className="size-3.5 text-fog" aria-hidden />
                </Item>
              </Group>
            )}

            {!needle && recent.length > 0 && (
              <Group heading="Recent players">
                {recent.map((r) => (
                  <Item
                    key={`${r.gameName}#${r.tagLine}`}
                    value={`recent ${r.gameName} ${r.tagLine}`}
                    onSelect={() => go(`/player/${r.platform}/${riotIdToSlug(r.gameName, r.tagLine)}`)}
                  >
                    <User className="size-4 text-lichen" aria-hidden />
                    <span className="truncate">
                      {r.gameName}
                      <span className="text-fog">#{r.tagLine}</span>
                    </span>
                    <span className="ml-auto text-xs text-fog">{platformLabel(r.platform)}</span>
                  </Item>
                ))}
              </Group>
            )}

            {needle && (
              <>
                <Group heading="Champions">
                  {index.data.champions.map((c) => (
                    <Item key={c.id} value={`champion ${c.name}`} onSelect={() => go(`/units/${c.slug}`)}>
                      <span className="rounded-md p-px" style={{ background: costColor(c.cost) }}>
                        <GameImage src={c.icon} alt={c.name} className="size-7 rounded-[5px]" />
                      </span>
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto text-xs text-fog">{c.cost}-cost</span>
                    </Item>
                  ))}
                </Group>
                <Group heading="Traits">
                  {index.data.traits.map((t) => (
                    <Item key={t.id} value={`trait ${t.name}`} onSelect={() => go(`/traits/${t.slug}`)}>
                      <GameImage src={t.icon} alt={t.name} className="size-7 bg-transparent" imgClassName="object-contain" />
                      <span className="truncate">{t.name}</span>
                      <span className="ml-auto text-xs capitalize text-fog">{t.kind === 'trait' ? 'synergy' : t.kind}</span>
                    </Item>
                  ))}
                </Group>
                <Group heading="Items">
                  {items.map((i) => (
                    <Item key={i.id} value={`item ${i.name}`} onSelect={() => go(`/items/${i.slug}`)}>
                      <GameImage src={i.icon} alt={i.name} className="size-7 rounded" />
                      <span className="truncate">{i.name}</span>
                    </Item>
                  ))}
                </Group>
              </>
            )}

            <Group heading="Pages">
              {NAV.map((n) => (
                <Item key={n.href} value={`page ${n.label}`} onSelect={() => go(n.href)}>
                  <n.icon className="size-4 text-lichen" aria-hidden />
                  {n.label}
                </Item>
              ))}
            </Group>
          </Command.List>
        )}
      </Command>
    </div>
  );
}
