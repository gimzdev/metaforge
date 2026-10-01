'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Ban, Check, Link2, Plus, Search, SearchX, TriangleAlert } from '@/components/icons';
import { ChampionIcon, ItemIcon } from '@/components/game/entities';
import { AvgPlace, CompLine, CompLineHeader, Delta, EntityCell, PlacementBars, type EntityKind } from '@/components/stats/bits';
import { gamesColumn, rowHref, rowName, ScopeBar, statColumns, StatsTable, type Column } from '@/components/stats/table';
import { Chip, Segmented, Select } from '@/components/ui';
import { costColor, currentIndex } from '@/lib/static';
import type { ItemCategory, TraitLite } from '@/lib/static/types';
import { encodeFilters, filterKey, filterSignature, type ExplorerTab } from '@/lib/stats/filters';
import type { CompRow, ExplorerResult, Filter, Scope, StatRow } from '@/lib/stats/types';
import { cn, fmt, sleep, traitOf } from '@/lib/utils';
import { describeFilter, FilterBar } from './filter-bar';

const ITEM_GROUPS: Array<{ id: string; label: string; cats: ItemCategory[] }> = [
  { id: 'completed', label: 'Completed', cats: ['completed'] },
  { id: 'emblem', label: 'Emblems', cats: ['emblem'] },
  { id: 'artifact', label: 'Artifacts', cats: ['artifact'] },
  { id: 'radiant', label: 'Radiant', cats: ['radiant'] },
  { id: 'support', label: 'Support', cats: ['support'] },
  { id: 'component', label: 'Components', cats: ['component'] },
];

const TRAIT_KINDS: Array<{ id: TraitLite['kind']; label: string }> = [
  { id: 'origin', label: 'Origins' },
  { id: 'class', label: 'Classes' },
  { id: 'unique', label: 'Unique' },
];

const MIN_GAMES = [1, 5, 10, 25, 50, 100, 250, 500];

function autoMinGames(boards: number) {
  if (boards < 60) return 1;
  return Math.min(100, Math.max(3, Math.round(boards * 0.002)));
}

async function fetchExplorer(scope: Scope, filters: Filter[], signal: AbortSignal): Promise<ExplorerResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('/api/explorer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ region: scope.region, patch: scope.patch, filters }),
        signal,
      });
      const json = (await res.json().catch(() => ({}))) as ExplorerResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Explorer request failed (${res.status})`);
      return json;
    } catch (error) {
      if (signal.aborted || attempt > 0) throw error;
      await sleep(1000); // one retry
    }
  }
}

/** Answers are fresh for two minutes, and forgotten five minutes after the filters leave them. */
const FRESH_MS = 2 * 60_000;
const KEEP_MS = 5 * 60_000;

/**
 * Results for the current scope and filters. Switching back to a filter set shows its answer
 * at once (asking again in the background once it is two minutes old); a new one shows the
 * previous answer while it loads.
 */
function useExplorer(initial: ExplorerResult, initialFilters: Filter[], scope: Scope, filters: Filter[]) {
  const signature = `${scope.region}|${scope.patch}|${filterSignature(filters)}`;
  const first = useRef(`${initial.scope.region}|${initial.scope.patch}|${filterSignature(initialFilters)}`).current;
  const cache = useRef<Map<string, { data: ExplorerResult; at: number; left: number | null }> | null>(null);
  cache.current ??= new Map([[first, { data: initial, at: Date.now(), left: null }]]);
  const [state, setState] = useState({ data: initial, key: signature, fetching: false, error: null as Error | null });
  const [attempt, setAttempt] = useState(0);
  const forced = useRef(false);
  useEffect(() => {
    const map = cache.current!;
    let hit = map.get(signature);
    if (hit?.left && Date.now() - hit.left > KEEP_MS) {
      map.delete(signature);
      hit = undefined;
    }
    // The page's own answer comes back as new when it was forgotten.
    if (!hit && signature === first) map.set(signature, (hit = { data: initial, at: Date.now(), left: null }));
    if (hit) {
      hit.left = null;
      setState({ data: hit.data, key: signature, fetching: false, error: null });
    }
    const leave = () => {
      const h = map.get(signature);
      if (h) h.left = Date.now();
    };
    const force = forced.current;
    forced.current = false;
    if (hit && Date.now() - hit.at < FRESH_MS && !force) return leave;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, fetching: true, error: null }));
    fetchExplorer(scope, filters, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return; // superseded: whatever it read is dropped
        map.set(signature, { data, at: Date.now(), left: null });
        setState({ data, key: signature, fetching: false, error: null });
      })
      .catch((error: Error) => {
        if (!ctrl.signal.aborted) setState((s) => ({ ...s, fetching: false, error }));
      });
    return () => {
      ctrl.abort();
      leave();
    };
  }, [signature, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    data: state.data,
    fetching: state.fetching,
    /** Still showing the previous answer while this one loads. */
    stale: state.key !== signature,
    error: state.error,
    retry: () => {
      forced.current = true;
      setAttempt((a) => a + 1);
    },
  };
}

/* ── Summary strip ──────────────────────────────────────── */
function SummaryStrip({ data, filtered }: { data: ExplorerResult; filtered: boolean }) {
  const s = data.summary;
  const b = data.baseline;
  const share = b.boards ? s.boards / b.boards : 0;
  const pp = (x: number, y: number) => {
    const d = (x - y) * 100;
    if (!Number.isFinite(d) || Math.abs(d) < 0.05) return null;
    return (
      <span className={cn('num text-xs', d > 0 ? 'text-good' : 'text-bloom')}>
        {d > 0 ? '+' : ''}
        {d.toFixed(1)} pts
      </span>
    );
  };
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border hairline bg-lichen/10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="bg-canopy px-4 py-3.5">
        <div className="text-xs text-lichen">{filtered ? 'Matching boards' : 'Boards'}</div>
        <div className="num mt-1 font-display text-[1.6rem] leading-none">{fmt.int(s.boards)}</div>
        <div className="num text-xs text-fog">
          {filtered ? `${fmt.pct(share, share < 0.01 ? 2 : 1)} of ${fmt.int(b.boards)}` : 'final boards in scope'}
        </div>
      </div>
      <div className="bg-canopy px-4 py-3.5">
        <div className="text-xs text-lichen">Average place</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <AvgPlace value={s.avg} className="font-display text-[1.6rem] leading-none" />
          {filtered && s.boards > 0 && <Delta value={s.avg - b.avg} />}
        </div>
        <div className="text-xs text-fog">{filtered ? `all boards ${fmt.place(b.avg)}` : 'lobby average is 4.50'}</div>
      </div>
      <div className="bg-canopy px-4 py-3.5">
        <div className="text-xs text-lichen">Top 4 rate</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="num font-display text-[1.6rem] leading-none">{fmt.pct(s.top4)}</span>
          {filtered && s.boards > 0 && pp(s.top4, b.top4)}
        </div>
        <div className="text-xs text-fog">{filtered ? `all boards ${fmt.pct(b.top4)}` : 'half of every lobby'}</div>
      </div>
      <div className="bg-canopy px-4 py-3.5">
        <div className="text-xs text-lichen">Win rate</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="num font-display text-[1.6rem] leading-none">{fmt.pct(s.win)}</span>
          {filtered && s.boards > 0 && pp(s.win, b.win)}
        </div>
        <div className="text-xs text-fog">{filtered ? `all boards ${fmt.pct(b.win)}` : 'one in eight on average'}</div>
      </div>
      <div className="col-span-2 bg-canopy px-4 py-3 lg:col-span-1">
        <div className="text-xs text-lichen">Placements</div>
        <PlacementBars placements={s.placements} height={34} labels className="mt-1.5" />
      </div>
    </div>
  );
}

/* ── Row actions ────────────────────────────────────────── */
function RowActions({
  onWith,
  onWithout,
  href,
  active,
  disabled = false,
  withTitle = 'Only boards with this',
}: {
  onWith: () => void;
  /** Left out where "without" has no meaning (items held by one champion). */
  onWithout?: () => void;
  href?: string;
  active: boolean;
  disabled?: boolean;
  withTitle?: string;
}) {
  const btn = 'size-7 place-items-center rounded-lg text-lichen transition hover:bg-white/[0.07] disabled:opacity-40';
  return (
    <span className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={cn('grid', btn, 'hover:text-wisp')} onClick={onWith} title={withTitle} disabled={active || disabled}>
        {active ? <Check className="size-4 text-wisp" /> : <Plus className="size-4" />}
      </button>
      {onWithout ? (
        <button type="button" className={cn('grid', btn, 'hover:text-bloom')} onClick={onWithout} title="Only boards without this">
          <Ban className="size-3.5" />
        </button>
      ) : (
        <span className="size-7" aria-hidden />
      )}
      {href && (
        <Link href={href} className={cn(btn, 'hidden hover:text-moon sm:grid')} title="Open details" prefetch={false}>
          <ArrowUpRight className="size-4" />
        </Link>
      )}
    </span>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-line-strong bg-canopy px-3 focus-within:border-lichen/45 sm:w-56">
      <Search className="size-4 shrink-0 text-fog" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-moon outline-none placeholder:text-fog"
      />
    </label>
  );
}

/* ── Main app ───────────────────────────────────────────── */
export function ExplorerApp({
  initial,
  initialFilters,
  initialTab,
  initialHeld = null,
  initialHolds = null,
}: {
  initial: ExplorerResult;
  initialFilters: Filter[];
  initialTab: ExplorerTab;
  /** Items tab: a champion key to see what that champion holds, 'any' for the whole board, null to decide. */
  initialHeld?: string | null;
  /** Champions tab: an item key to see who holds that item, 'any' for the whole board, null to decide. */
  initialHolds?: string | null;
}) {
  const index = currentIndex();
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [tab, setTab] = useState<ExplorerTab>(initialTab);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [costs, setCosts] = useState<number[]>([]);
  const [itemGroup, setItemGroup] = useState<string | null>(null);
  const [traitKind, setTraitKind] = useState<TraitLite['kind'] | null>(null);
  const [minGames, setMinGames] = useState<'auto' | number>('auto');
  const [held, setHeld] = useState<string | null>(initialHeld);
  const [holds, setHolds] = useState<string | null>(initialHolds);
  const [copied, setCopied] = useState(false);

  const query = useExplorer(initial, initialFilters, scope, filters);
  const data = query.data;
  const filtered = filters.length > 0;
  const hasAugments = data.meta.hasAugments;

  // Keep the URL shareable without re-rendering the server page.
  useEffect(() => {
    const params = new URLSearchParams();
    if (scope.region !== 'all') params.set('region', scope.region);
    params.set('patch', scope.patch);
    if (tab !== 'units') params.set('tab', tab);
    const f = encodeFilters(filters);
    if (f) params.set('f', f);
    if (held) params.set('held', held);
    if (holds) params.set('holds', holds);
    const url = `${window.location.pathname}?${params.toString()}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [scope, filters, tab, held, holds]);

  useEffect(() => {
    if (tab === 'augments' && !hasAugments) setTab('units');
  }, [tab, hasAugments]);

  /* Filter operations */
  const upsert = (f: Filter) =>
    setFilters((list) => {
      const key = filterKey(f);
      const i = list.findIndex((x) => filterKey(x) === key);
      if (i < 0) return [...list, f];
      const next = [...list];
      next[i] = f;
      return next;
    });
  const removeFilter = (key: string) => {
    setFilters((list) => list.filter((x) => filterKey(x) !== key));
    setEditing((e) => (e === key ? null : e));
  };

  const minN = minGames === 'auto' ? autoMinGames(data.summary.boards) : minGames;
  const needle = q.trim().toLowerCase();

  // Items tab: with a champion in the filters, show what that champion holds (the question behind
  // "Aphelios + artifacts"), or switch to items anywhere on those boards. Defaults to the champion.
  const unitFilters = filters.filter((f): f is Extract<Filter, { k: 'unit' }> => f.k === 'unit' && !f.not);
  const holderFilter = held === 'any' ? undefined : (unitFilters.find((f) => f.id === held) ?? unitFilters[0]);
  const holderKey = holderFilter?.id ?? null;
  const holderName = holderKey ? (index.champion(holderKey)?.name ?? holderKey) : null;
  const itemSource = holderKey ? (data.held?.[holderKey] ?? []) : data.items;

  // Champions tab, the other way round: with an item in the filters, show the champions holding it
  // (who should hold Infinity Edge), or every champion on those boards. Defaults to the item.
  const itemFilters = filters.filter((f): f is Extract<Filter, { k: 'item' }> => f.k === 'item' && !f.not);
  const holdsFilter = holds === 'any' ? undefined : (itemFilters.find((f) => f.id === holds) ?? itemFilters[0]);
  const holdsKey = holdsFilter?.id ?? null;
  const holdsName = holdsKey ? (index.item(holdsKey)?.name ?? holdsKey) : null;
  const unitSource = holdsKey ? (data.holders?.[holdsKey] ?? []) : data.units;
  /** The champion's own condition in the filters, when it asks for the champion (not its absence). */
  const ownUnit = (id: string) => filters.find((f): f is Extract<Filter, { k: 'unit' }> => f.k === 'unit' && f.id === id && !f.not);
  const holdsIt = (id: string) => Boolean(holdsKey && ownUnit(id)?.items?.includes(holdsKey));

  /* Rows per tab */
  const unitRows = useMemo(
    () =>
      unitSource.filter((r) => {
        const c = index.champion(r.id);
        if (!c || r.n < minN) return false;
        if (costs.length && !costs.includes(Math.min(c.cost, 6))) return false;
        return !needle || c.name.toLowerCase().includes(needle);
      }),
    [unitSource, index, minN, costs, needle],
  );
  const itemRows = useMemo(() => {
    const group = ITEM_GROUPS.find((g) => g.id === itemGroup);
    return itemSource.filter((r) => {
      const it = index.item(r.id);
      if (!it || r.n < minN) return false;
      if (group ? !group.cats.includes(it.category) : it.category === 'consumable') return false;
      return !needle || it.name.toLowerCase().includes(needle);
    });
  }, [itemSource, index, minN, itemGroup, needle]);
  const traitRows = useMemo(
    () =>
      data.traits.filter((r) => {
        const t = index.trait(traitOf(r.id));
        if (!t || r.n < minN) return false;
        if (traitKind && t.kind !== traitKind) return false;
        return !needle || t.name.toLowerCase().includes(needle);
      }),
    [data.traits, index, minN, traitKind, needle],
  );
  const augRows = useMemo(
    () =>
      data.augments.filter((r) => {
        if (r.n < minN) return false;
        const a = index.augment(r.id);
        return !needle || (a?.name ?? r.id).toLowerCase().includes(needle);
      }),
    [data.augments, index, minN, needle],
  );
  const levelRows = useMemo(() => data.levels.filter((r) => Number(r.id) > 0), [data.levels]);

  const [compSort, setCompSort] = useState<'freq' | 'avg' | 'top4' | 'win'>('freq');
  const compRows = useMemo(() => {
    const list = data.comps.filter((c) => {
      if (!needle) return true;
      const carry = index.champion(c.carry)?.name.toLowerCase() ?? '';
      return c.name.toLowerCase().includes(needle) || carry.includes(needle);
    });
    const by: Record<typeof compSort, (c: CompRow) => number> = {
      freq: (c) => -c.freq,
      avg: (c) => c.avg,
      top4: (c) => -c.top4,
      win: (c) => -c.win,
    };
    return [...list].sort((a, b) => by[compSort](a) - by[compSort](b));
  }, [data.comps, index, needle, compSort]);

  /* Columns */
  const columns = (
    kind: EntityKind,
    rows: StatRow[],
    toFilter: (r: StatRow) => Filter,
    opts: { freqLabel?: string; freqTitle?: string; copiesTitle?: string; actions?: (r: StatRow) => ReactNode } = {},
  ): Column<StatRow>[] => [
    {
      key: 'name',
      label: kind === 'unit' ? 'Champion' : kind === 'item' ? 'Item' : kind === 'trait' ? 'Trait' : kind === 'aug' ? 'Augment' : 'Level',
      sort: (r) => rowName(kind, r),
      render: (r) => <EntityCell kind={kind} id={kind === 'trait' ? traitOf(r.id) : r.id} tier={r.tier} />,
      className: 'min-w-[140px] max-w-[260px] @lg:min-w-[190px]',
    },
    ...statColumns(rows, {
      freqLabel: opts.freqLabel,
      freqTitle: opts.freqTitle ?? 'Share of the selected boards that include it',
      avgTitle: 'Average final placement (lower is better)',
      deltaTitle: 'Change in average placement versus all selected boards (negative is better)',
      fadeBelow: 30,
    }),
    ...(kind === 'item'
      ? [
          {
            key: 'copies',
            label: 'Copies',
            title: opts.copiesTitle ?? 'Average copies on boards that have it',
            align: 'right' as const,
            sort: (r: StatRow) => r.copies ?? 0,
            desc: true,
            hideBelow: 'lg' as const,
            render: (r: StatRow) => <span className="num text-lichen">{(r.copies ?? 1).toFixed(2)}</span>,
          },
        ]
      : []),
    gamesColumn,
    {
      key: 'actions',
      label: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) => {
        if (opts.actions) return opts.actions(r);
        const f = toFilter(r);
        const existing = filters.find((x) => filterKey(x) === filterKey(f));
        const isActive = Boolean(existing && !existing.not && JSON.stringify(existing) === JSON.stringify(f));
        return (
          <RowActions
            active={isActive}
            onWith={() => upsert(f)}
            onWithout={() => upsert({ ...f, not: true } as Filter)}
            href={kind === 'aug' || kind === 'level' ? undefined : rowHref(kind, r.id)}
          />
        );
      },
    },
  ];

  const traitFilter = (r: StatRow): Filter => ({ k: 'trait', id: traitOf(r.id), min: r.tier, max: r.tier });
  /** Holder mode: narrow the champion's own condition to "holding this item" (up to three items). */
  const holderWith = (r: StatRow): Filter => {
    if (!holderFilter) return { k: 'item', id: r.id };
    const items = holderFilter.items ?? [];
    if (items.includes(r.id) || items.length >= 3) return holderFilter;
    return { ...holderFilter, items: [...items, r.id] };
  };
  const unitFilter = (r: StatRow): Filter => ({ k: 'unit', id: r.id });
  /** Holding mode: the champion holding the item, added to the champion's own condition (up to three items). */
  const holdsWith = (r: StatRow): Filter => {
    if (!holdsKey) return unitFilter(r);
    const own = ownUnit(r.id);
    if (!own) return { k: 'unit', id: r.id, items: [holdsKey] };
    const items = own.items ?? [];
    if (items.includes(holdsKey) || items.length >= 3) return own;
    return { ...own, items: [...items, holdsKey] };
  };
  const itemFilter = (r: StatRow): Filter => ({ k: 'item', id: r.id });
  const augFilter = (r: StatRow): Filter => ({ k: 'aug', id: r.id });
  const levelFilter = (r: StatRow): Filter => ({ k: 'level', min: Number(r.id), max: Number(r.id) });
  const tables: Record<Exclude<ExplorerTab, 'comps'>, { rows: StatRow[]; cols: Column<StatRow>[]; toFilter: (r: StatRow) => Filter }> = {
    units: holdsFilter
      ? {
          rows: unitRows,
          toFilter: holdsWith,
          cols: columns('unit', unitRows, holdsWith, {
            freqLabel: 'Holds it',
            freqTitle: `Share of these boards where it holds ${holdsName}`,
            actions: (r) => {
              const name = index.champion(r.id)?.name ?? r.id;
              const on = holdsIt(r.id);
              const full = !on && (ownUnit(r.id)?.items?.length ?? 0) >= 3;
              return (
                <RowActions
                  active={on}
                  disabled={full}
                  withTitle={full ? `${name} already has three items in this filter` : `Only boards where ${name} holds ${holdsName}`}
                  onWith={() => upsert(holdsWith(r))}
                  href={rowHref('unit', r.id)}
                />
              );
            },
          }),
        }
      : { rows: unitRows, toFilter: unitFilter, cols: columns('unit', unitRows, unitFilter) },
    items: holderFilter
      ? {
          rows: itemRows,
          toFilter: holderWith,
          cols: columns('item', itemRows, holderWith, {
            freqLabel: 'Held',
            freqTitle: `Share of these boards where ${holderName} holds it`,
            copiesTitle: `Average copies ${holderName} holds`,
            actions: (r) => {
              const on = holderFilter.items?.includes(r.id) ?? false;
              const full = (holderFilter.items?.length ?? 0) >= 3;
              return (
                <RowActions
                  active={on}
                  disabled={!on && full}
                  withTitle={full && !on ? `${holderName} already has three items in this filter` : `Only boards where ${holderName} holds this`}
                  onWith={() => upsert(holderWith(r))}
                  href={rowHref('item', r.id)}
                />
              );
            },
          }),
        }
      : { rows: itemRows, toFilter: itemFilter, cols: columns('item', itemRows, itemFilter) },
    traits: { rows: traitRows, toFilter: traitFilter, cols: columns('trait', traitRows, traitFilter) },
    augments: { rows: augRows, toFilter: augFilter, cols: columns('aug', augRows, augFilter) },
    levels: { rows: levelRows, toFilter: levelFilter, cols: columns('level', levelRows, levelFilter) },
  };

  /* Suggestions when nothing is selected yet */
  const suggestions = useMemo(() => {
    const out: Array<{ label: string; filter: Filter }> = [];
    const topComp = [...initial.comps].sort((a, b) => b.n - a.n)[0];
    const carry = topComp?.carry ? index.champion(topComp.carry) : undefined;
    if (carry) out.push({ label: `${carry.name} with 3 items`, filter: { k: 'unit', id: carry.key, minItems: 3 } });
    const topTrait = [...initial.traits]
      .filter((r) => (r.tier ?? 0) >= 2 && r.n >= 20)
      .sort((a, b) => b.freq - a.freq)[0];
    if (topTrait) {
      const f = traitFilter(topTrait);
      const t = index.trait((f as { id: string }).id);
      const units = t?.effects[(topTrait.tier ?? 1) - 1]?.minUnits;
      if (t) out.push({ label: `${units ?? ''} ${t.name}`.trim(), filter: { ...f, max: undefined } as Filter });
    }
    out.push({ label: 'Level 9 or higher', filter: { k: 'level', min: 9 } });
    const topItem = [...initial.items]
      .filter((r) => index.item(r.id)?.category === 'completed')
      .sort((a, b) => b.freq - a.freq)[0];
    const item = topItem ? index.item(topItem.id) : undefined;
    if (item) out.push({ label: `Without ${item.name}`, filter: { k: 'item', id: item.key, not: true } });
    return out;
  }, [initial, index]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the address bar already has the link */
    }
  };

  const tabOptions = [
    { value: 'units' as const, label: 'Champions' },
    { value: 'items' as const, label: 'Items' },
    { value: 'traits' as const, label: 'Traits' },
    { value: 'comps' as const, label: 'Comps' },
    { value: 'levels' as const, label: 'Levels' },
    ...(hasAugments ? [{ value: 'augments' as const, label: 'Augments' }] : []),
  ];

  const empty = data.summary.boards === 0;
  const lastFilter = filters[filters.length - 1];

  let body: ReactNode;
  if (empty) {
    body = (
      <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
        <SearchX className="mx-auto size-8 text-fog" aria-hidden />
        <div className="mt-3 font-display text-xl">No boards match every filter</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-lichen">
          Loosen a condition or widen the patch and region scope. Every filter has to hold at the same time.
        </p>
        {lastFilter && (
          <button
            type="button"
            onClick={() => removeFilter(filterKey(lastFilter))}
            className="mt-5 inline-flex h-9 items-center rounded-xl bg-bark px-4 text-sm font-medium text-moon hover:bg-moss"
          >
            Remove {describeFilter(lastFilter, index).name}
          </button>
        )}
      </div>
    );
  } else if (tab === 'comps') {
    body = compRows.length ? (
      <div className="overflow-hidden rounded-xl border hairline">
        <CompLineHeader />
        {compRows.map((c) => (
          <CompLine
            key={c.id}
            comp={c}
            actions={
              <button
                type="button"
                title="Explore boards of this comp"
                onClick={() => {
                  const next: Filter[] = [];
                  if (c.trait) {
                    const t = c.traits.find((x) => x.id === c.trait);
                    next.push({ k: 'trait', id: c.trait, ...(t ? { min: t.tier } : {}) });
                  }
                  if (c.carry) next.push({ k: 'unit', id: c.carry });
                  next.forEach(upsert);
                  setTab('units');
                }}
                className="grid size-8 place-items-center rounded-lg text-lichen hover:bg-white/[0.07] hover:text-wisp"
              >
                <Plus className="size-4" />
              </button>
            }
          />
        ))}
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-lichen">
        Not enough boards to form comps with these filters yet.
      </div>
    );
  } else {
    const t = tables[tab];
    body = (
      <StatsTable
        key={tab}
        rows={t.rows}
        columns={t.cols}
        defaultSort={tab === 'levels' ? 'name' : 'avg'}
        onRowClick={(r) => upsert(t.toFilter(r))}
        rowClassName={(r) => {
          if (tab === 'items' && holderFilter) return holderFilter.items?.includes(r.id) ? 'bg-wisp/[0.06]' : undefined;
          if (tab === 'units' && holdsFilter) return holdsIt(r.id) ? 'bg-wisp/[0.06]' : undefined;
          const f = t.toFilter(r);
          const existing = filters.find((x) => filterKey(x) === filterKey(f));
          if (!existing) return undefined;
          if (existing.k === 'trait' && existing.min && r.tier && (r.tier < existing.min || r.tier > (existing.max ?? 99))) {
            return undefined;
          }
          return existing.not ? 'bg-bloom/[0.06]' : 'bg-wisp/[0.06]';
        }}
        limit={tab === 'items' ? 80 : 60}
        caption={`${tab} statistics`}
        empty={
          needle
            ? `Nothing matches “${q}”.`
            : minN > 1
              ? `Nothing reaches ${minN} games yet. Lower the minimum games.`
              : 'Nothing to show for this selection.'
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="surface relative rounded-xl p-4 sm:p-5" aria-label="Filters">
        {query.fetching && (
          <div className="absolute inset-x-6 top-0 h-[2px] overflow-hidden rounded-full">
            <div className="h-full w-1/3 animate-slide rounded-full bg-wisp/80" />
          </div>
        )}
        <h1 className="sr-only">Stats explorer</h1>
        <FilterBar
          filters={filters}
          editing={editing}
          setEditing={setEditing}
          onAdd={upsert}
          onUpdate={(key, f) =>
            setFilters((list) => list.map((x) => (filterKey(x) === key ? f : x)))
          }
          onRemove={removeFilter}
          onClear={() => {
            setFilters([]);
            setEditing(null);
          }}
          hasAugments={hasAugments}
          trailing={
            <>
              <ScopeBar scope={scope} meta={data.meta} onChange={setScope} />
              <button
                type="button"
                onClick={share}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-canopy px-3 text-[13px] font-medium text-moon transition-colors hover:border-lichen/45"
              >
                {copied ? <Check className="size-4 text-wisp" /> : <Link2 className="size-4" />}
                {copied ? 'Copied' : 'Share'}
              </button>
            </>
          }
        />
        {!filtered && suggestions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t hairline pt-4">
            <span className="eyebrow mr-1 text-fog">Try</span>
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => upsert(s.filter)}
                className="h-8 rounded-full border border-line-strong px-3 text-xs font-medium text-lichen transition hover:border-lichen/40 hover:text-moon"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {query.error && (
        <div className="flex items-center gap-3 rounded-xl border border-bloom/30 bg-bloom/10 px-4 py-3 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-bloom" aria-hidden />
          <span className="text-moon">{query.error.message}</span>
          <button type="button" onClick={query.retry} className="ml-auto font-medium text-wisp hover:underline">
            Retry
          </button>
        </div>
      )}

      <div className={cn('transition-opacity', query.fetching && query.stale && 'opacity-70')}>
        <SummaryStrip data={data} filtered={filtered} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented options={tabOptions} value={tab} onChange={setTab} />
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder={`Search ${tabOptions.find((o) => o.value === tab)?.label.toLowerCase()}`} />
          {tab === 'comps' ? (
            <Select label="Sort comps" value={compSort} onChange={(e) => setCompSort(e.target.value as typeof compSort)}>
              <option value="freq">Most played</option>
              <option value="avg">Best average</option>
              <option value="top4">Top 4 rate</option>
              <option value="win">Win rate</option>
            </Select>
          ) : (
            tab !== 'levels' && (
              <Select
                label="Minimum games"
                value={String(minGames)}
                onChange={(e) => setMinGames(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
              >
                <option value="auto">Min games: auto ({autoMinGames(data.summary.boards)})</option>
                {MIN_GAMES.map((n) => (
                  <option key={n} value={n}>
                    Min games: {n}
                  </option>
                ))}
              </Select>
            )
          )}
        </div>
      </div>

      {tab === 'units' && itemFilters.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border hairline bg-canopy px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
          <span className="eyebrow shrink-0 text-fog">Holding</span>
          <Segmented
            size="sm"
            value={holdsKey ?? 'any'}
            onChange={(v) => setHolds(v)}
            options={[
              ...itemFilters.map((f) => ({
                value: f.id,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <ItemIcon id={f.id} size="xs" link={false} hover={false} />
                    {index.item(f.id)?.name ?? f.id}
                  </span>
                ),
              })),
              { value: 'any', label: 'Whole board' },
            ]}
          />
          <span className="text-xs leading-relaxed text-fog">
            {holdsKey ? `Champions holding ${holdsName}.` : 'All champions on these boards.'}
          </span>
        </div>
      )}
      {tab === 'units' && (
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((c) => (
            <Chip
              key={c}
              active={costs.includes(c)}
              onClick={() => setCosts((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]))}
            >
              <span className="size-2 rounded-full" style={{ background: costColor(c) }} />
              {c}-cost
            </Chip>
          ))}
          {costs.length > 0 && (
            <button type="button" onClick={() => setCosts([])} className="px-2 text-xs text-lichen hover:text-moon">
              Reset
            </button>
          )}
        </div>
      )}
      {tab === 'items' && unitFilters.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border hairline bg-canopy px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
          <span className="eyebrow shrink-0 text-fog">Held by</span>
          <Segmented
            size="sm"
            value={holderKey ?? 'any'}
            onChange={(v) => setHeld(v)}
            options={[
              ...unitFilters.map((f) => ({
                value: f.id,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <ChampionIcon id={f.id} size="xs" link={false} hover={false} />
                    {index.champion(f.id)?.name ?? f.id}
                  </span>
                ),
              })),
              { value: 'any', label: 'Any unit' },
            ]}
          />
          <span className="text-xs leading-relaxed text-fog">
            {holderKey ? `Items ${holderName} holds.` : 'All items on these boards.'}
          </span>
        </div>
      )}
      {tab === 'items' && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!itemGroup} onClick={() => setItemGroup(null)}>
            All items
          </Chip>
          {ITEM_GROUPS.map((g) => (
            <Chip key={g.id} active={itemGroup === g.id} onClick={() => setItemGroup(itemGroup === g.id ? null : g.id)}>
              {g.label}
            </Chip>
          ))}
        </div>
      )}
      {tab === 'traits' && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!traitKind} onClick={() => setTraitKind(null)}>
            All traits
          </Chip>
          {TRAIT_KINDS.map((k) => (
            <Chip key={k.id} active={traitKind === k.id} onClick={() => setTraitKind(traitKind === k.id ? null : k.id)}>
              {k.label}
            </Chip>
          ))}
        </div>
      )}

      {body}

      {/* Relative times can differ between the server's render and the browser's clock. */}
      <p suppressHydrationWarning className="text-xs leading-relaxed text-fog">
        {fmt.int(data.meta.total)} ranked boards collected for this set from {data.meta.regions.length} region
        {data.meta.regions.length === 1 ? '' : 's'}
        {data.meta.newest ? `, newest ${fmt.ago(data.meta.newest)}` : ''}. Faded averages come from fewer than 30 games.
      </p>
    </div>
  );
}
