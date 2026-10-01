'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from '@/components/icons';
import { TraitHex } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { useStaticText } from '@/components/providers';
import { Chip, Segmented } from '@/components/ui';
import { costColor, currentIndex, plainText, styleFor, traitKindLabel } from '@/lib/static';
import { ITEM_CATEGORY_LABEL, type ItemCategory } from '@/lib/static/types';
import type { StatMap } from '@/lib/stats/service';
import { cn, fmt, placementTone, toneText } from '@/lib/utils';

type SortKey = 'default' | 'avg' | 'freq' | 'name';

export type CollectionTab = 'champions' | 'traits' | 'items' | 'augments';
type Tab = CollectionTab;

const COLLAPSED: Record<Tab, number> = { champions: 20, traits: 9, items: 20, augments: 18 };

/**
 * The collapsed preview renders COLLAPSED[tab] cards and hides the tail per
 * breakpoint, so it always ends on a full row (champion and item tiles are
 * 4/5/8/10 wide, traits and augments 1/2/3) and stays short on phones.
 */
function peek(tab: Tab, i: number): string | undefined {
  switch (tab) {
    case 'champions':
    case 'items':
      return cn(i >= 12 && 'max-sm:hidden', i >= 15 && 'sm:max-md:hidden', i >= 16 && 'md:max-lg:hidden') || undefined;
    case 'traits':
      return cn(i >= 5 && 'max-sm:hidden', i >= 8 && 'sm:max-lg:hidden') || undefined;
    case 'augments':
      return cn(i >= 8 && 'max-sm:hidden') || undefined;
  }
}
/** Champion and item tiles: the art fills each tile, 10 to a row on desktop. */
const TILE_GRID = 'grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10';

const ITEM_TABS: ItemCategory[] = ['completed', 'component', 'emblem', 'artifact', 'radiant', 'support'];
const AUG_TIERS = ['silver', 'gold', 'prismatic'] as const;

function AvgTag({ value, small = false }: { value: number | undefined; small?: boolean }) {
  if (value === undefined) return null;
  return (
    <span
      className={cn(
        'num rounded-md bg-night/85 font-semibold',
        small ? 'px-1 py-px text-[10px]' : 'px-1.5 py-0.5 text-[11px]',
        toneText[placementTone(value)],
      )}
    >
      {fmt.place(value)}
    </span>
  );
}

export function Collection({
  stats,
  initialTab = 'champions',
  title,
}: {
  stats: { units: StatMap; items: StatMap } | null;
  initialTab?: CollectionTab;
  /** Heading text; null hides the heading (when a banner above already names the section). */
  title?: string | null;
}) {
  const index = currentIndex();
  const text = useStaticText();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState('');
  const [cost, setCost] = useState<number | null>(null);
  const [itemCat, setItemCat] = useState<ItemCategory | null>(null);
  const [augTier, setAugTier] = useState<(typeof AUG_TIERS)[number] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState<SortKey>('default');
  const needle = query.trim().toLowerCase();

  /** Best average first; play rate most played first; entries without enough games go last. */
  const bySort = <T extends { key: string; name: string }>(
    list: T[],
    map: StatMap | undefined,
    fallback: (a: T, b: T) => number,
  ) => {
    if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
    if ((sort === 'avg' || sort === 'freq') && map) {
      const col = sort === 'avg' ? 0 : 1;
      const dir = sort === 'avg' ? 1 : -1;
      return list.sort((a, b) => {
        const va = map[a.key]?.[col];
        const vb = map[b.key]?.[col];
        if (va === undefined || vb === undefined) return va === undefined ? (vb === undefined ? fallback(a, b) : 1) : -1;
        return (va - vb) * dir || fallback(a, b);
      });
    }
    return list.sort(fallback);
  };

  const champions = useMemo(
    () =>
      bySort(
        index.data.champions.filter(
          (c) => (cost === null || Math.min(c.cost, 6) === cost) && (!needle || c.name.toLowerCase().includes(needle)),
        ),
        stats?.units,
        (a, b) => a.cost - b.cost || a.name.localeCompare(b.name),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, cost, needle, sort, stats],
  );
  const traits = useMemo(
    () =>
      [...index.data.traits]
        .filter((t) => !needle || t.name.toLowerCase().includes(needle))
        .sort((a, b) => (a.kind === 'unique' ? 1 : 0) - (b.kind === 'unique' ? 1 : 0) || a.name.localeCompare(b.name)),
    [index, needle],
  );
  const items = useMemo(
    () =>
      bySort(
        index.data.items
          .filter((i) => (itemCat && !needle ? i.category === itemCat : ITEM_TABS.includes(i.category)))
          .filter((i) => !needle || i.name.toLowerCase().includes(needle)),
        stats?.items,
        (a, b) => ITEM_TABS.indexOf(a.category) - ITEM_TABS.indexOf(b.category) || a.name.localeCompare(b.name),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, itemCat, needle, sort, stats],
  );
  const augments = useMemo(
    () =>
      index.data.augments
        .filter((a) => (!augTier || a.tier === augTier) && (!needle || a.name.toLowerCase().includes(needle)))
        .sort((a, b) => AUG_TIERS.indexOf(a.tier as never) - AUG_TIERS.indexOf(b.tier as never) || a.name.localeCompare(b.name)),
    [index, augTier, needle],
  );

  // Everything the Items tab can show: all its categories, not only the one picked below it.
  const itemTotal = useMemo(() => index.data.items.filter((i) => ITEM_TABS.includes(i.category)).length, [index]);

  const counts: Record<Tab, number> = {
    champions: champions.length,
    traits: traits.length,
    items: items.length,
    augments: augments.length,
  };
  const total = counts[tab];
  const limit = expanded || needle ? total : COLLAPSED[tab];
  const hidden = Math.max(0, total - limit);
  const trim = (i: number) => (hidden > 0 ? peek(tab, i) : undefined);

  const switchTab = (t: Tab) => {
    setTab(t);
    setExpanded(false);
  };

  return (
    <section
      aria-labelledby={title === null ? undefined : 'collection-title'}
      aria-label={title === null ? 'Collection' : undefined}
      className="space-y-4"
    >
      {title !== null && (
        <div>
          <h2 id="collection-title" className="text-[1.75rem] leading-tight">
            {title ?? `The ${index.data.set.name} collection`}
          </h2>
          <p className="mt-1.5 text-sm text-lichen">
            Every champion, trait, item and augment in the set, from the live game data.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          value={tab}
          onChange={switchTab}
          options={[
            { value: 'champions', label: 'Champions', count: index.data.champions.length },
            { value: 'traits', label: 'Traits', count: index.data.traits.length },
            { value: 'items', label: 'Items', count: itemTotal },
            ...(index.data.augments.length
              ? [{ value: 'augments' as const, label: 'Augments', count: index.data.augments.length }]
              : []),
          ]}
        />
        <label className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-canopy px-3 focus-within:border-lichen/45 md:w-72">
          <Search className="size-4 text-fog" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab}`}
            aria-label={`Search ${tab}`}
            className="min-w-0 flex-1 bg-transparent text-sm text-moon outline-none placeholder:text-fog"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tab === 'champions' &&
            [1, 2, 3, 4, 5].map((c) => (
              <Chip key={c} active={cost === c} onClick={() => setCost(cost === c ? null : c)}>
                <span className="size-2 rounded-full" style={{ background: costColor(c) }} />
                {c}-cost
              </Chip>
            ))}
          {tab === 'items' &&
            !needle &&
            ITEM_TABS.map((c) => (
              <Chip
                key={c}
                active={itemCat === c}
                onClick={() => {
                  setItemCat(itemCat === c ? null : c);
                  setExpanded(false);
                }}
              >
                {ITEM_CATEGORY_LABEL[c]}
              </Chip>
            ))}
          {tab === 'augments' &&
            AUG_TIERS.map((t) => (
              <Chip key={t} active={augTier === t} onClick={() => setAugTier(augTier === t ? null : t)} className="capitalize">
                {t}
              </Chip>
            ))}
        </div>
        {(tab === 'champions' || tab === 'items') && (
          <div className="flex items-center gap-2">
            <span className="eyebrow text-[10px] text-fog">Sort</span>
            <Segmented
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'default' as const, label: tab === 'champions' ? 'Cost' : 'Type' },
                ...(stats
                  ? [
                      { value: 'avg' as const, label: 'Avg place' },
                      { value: 'freq' as const, label: 'Play rate' },
                    ]
                  : []),
                { value: 'name' as const, label: 'A–Z' },
              ]}
            />
          </div>
        )}
      </div>

      {total === 0 && (
        <div className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-lichen">
          Nothing matches “{query}”.
        </div>
      )}

      {tab === 'champions' && total > 0 && (
        <div className={TILE_GRID}>
          {champions.slice(0, limit).map((c, n) => (
            <Link
              key={c.key}
              href={`/units/${c.slug}`}
              className={cn(
                'group relative overflow-hidden rounded-xl border hairline bg-canopy transition hover:-translate-y-0.5 hover:border-lichen/40',
                trim(n),
              )}
            >
              <GameImage
                src={c.tile ?? c.icon}
                alt={c.name}
                className="aspect-square w-full"
                imgClassName="transition-transform duration-300 group-hover:scale-[1.06]"
              />
              <span className="absolute right-1 top-1">
                <AvgTag value={stats?.units[c.key]?.[0]} small />
              </span>
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night via-night/80 to-transparent px-1.5 pb-1.5 pt-5 lg:px-2 lg:pb-2">
                <span className="block truncate text-center text-[12px] font-semibold leading-tight text-moon lg:text-[13px]">{c.name}</span>
                <span className="mt-0.5 flex items-center justify-center gap-0.5">
                  {c.traits.slice(0, 3).map((t) => {
                    const trait = index.trait(t);
                    return trait ? <TraitHex key={t} trait={trait} style="inactive" px={22} /> : null;
                  })}
                </span>
              </span>
              <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: costColor(c.cost) }} />
            </Link>
          ))}
        </div>
      )}

      {tab === 'traits' && total > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {traits.slice(0, limit).map((t, n) => (
            <Link
              key={t.key}
              href={`/traits/${t.slug}`}
              className={cn('surface group flex gap-3 rounded-xl p-3.5 transition-colors hover:border-lichen/40', trim(n))}
            >
              <TraitHex trait={t} style={styleFor(t, t.effects.length)} px={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-moon group-hover:text-wisp">{t.name}</span>
                  <span className="shrink-0 text-[11px] capitalize text-fog">{traitKindLabel(t)}</span>
                </span>
                {t.effects.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {t.effects.map((e) => (
                      <span
                        key={e.minUnits}
                        className="num rounded-md bg-night/70 px-1.5 text-[11px] font-semibold"
                        style={{ color: `var(--color-style-${e.style})` }}
                      >
                        {e.minUnits}
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-2 flex flex-wrap gap-1">
                  {t.champions.slice(0, 9).map((k) => {
                    const c = index.champion(k);
                    return c ? (
                      <span key={k} className="rounded-md p-px" style={{ background: costColor(c.cost) }} title={c.name}>
                        <GameImage src={c.icon} alt={c.name} px={24} className="size-6 rounded-[5px]" />
                      </span>
                    ) : null;
                  })}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'items' && total > 0 && (
        <div className={TILE_GRID}>
          {items.slice(0, limit).map((i, n) => (
            <Link
              key={i.key}
              href={`/items/${i.slug}`}
              className={cn(
                'group relative overflow-hidden rounded-xl border hairline bg-canopy transition hover:-translate-y-0.5 hover:border-lichen/40',
                trim(n),
              )}
            >
              {/* Same square tile as the champions, but the icon sits inside it at a calmer size. */}
              <span className="flex aspect-square w-full items-start justify-center pt-[11%]">
                <GameImage
                  src={i.icon}
                  alt={i.name}
                  className="aspect-square w-[52%] rounded-lg sm:w-[56%]"
                  imgClassName="transition-transform duration-300 group-hover:scale-[1.06]"
                />
              </span>
              <span className="absolute right-1 top-1">
                <AvgTag value={stats?.items[i.key]?.[0]} small />
              </span>
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night via-night/80 to-transparent px-1 pb-1.5 pt-6 sm:px-1.5 lg:px-2 lg:pb-2">
                <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-moon sm:text-[12px] lg:text-[13px]">{i.name}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'augments' && total > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {augments.slice(0, limit).map((a, n) => (
            <div
              key={a.key}
              tabIndex={0}
              data-hover={`a:${a.key}`}
              className={cn('surface flex gap-3 rounded-xl p-3 outline-none focus-visible:border-lichen/45', trim(n))}
            >
              <GameImage src={a.icon} alt={a.name} className="size-10 shrink-0 rounded-lg" />
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-moon">{a.name}</span>
                  <span className="shrink-0 text-[11px] capitalize text-fog">{a.tier === 'unknown' ? '' : a.tier}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-lichen">{plainText(text?.augments[a.key])}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {(hidden > 0 || (expanded && total > COLLAPSED[tab] && !needle)) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="group flex w-full items-center justify-center gap-2 rounded-xl border hairline py-3 text-sm font-medium text-lichen transition hover:border-lichen/40 hover:text-moon"
        >
          {expanded ? 'Show less' : `Show all ${total} ${tab}`}
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
      )}
    </section>
  );
}

/**
 * Endless CSS marquee that eases down to a crawl while hovered or focused
 * (instead of stopping dead), so you can still read and click an entry.
 */
export function MarqueeTrack({ children, duration, slow = 0.22 }: { children: ReactNode; duration: number; slow?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const easeTo = (target: number) => {
    const el = ref.current;
    if (!el || typeof el.getAnimations !== 'function') return;
    const animations = el.getAnimations();
    if (!animations.length) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const from = animations[0].playbackRate;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const rate = from + (target - from) * (1 - (1 - t) ** 3);
      for (const a of animations) {
        if (typeof a.updatePlaybackRate === 'function') a.updatePlaybackRate(rate);
        else a.playbackRate = rate;
      }
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  };

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <div
      ref={ref}
      onPointerEnter={() => easeTo(slow)}
      onPointerLeave={() => easeTo(1)}
      onFocusCapture={() => easeTo(slow)}
      onBlurCapture={() => easeTo(1)}
      className="marquee-track flex w-max animate-marquee"
      style={{ animationDuration: `${duration}s` }}
    >
      {children}
    </div>
  );
}
