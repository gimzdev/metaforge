'use client';

import { Popover } from 'radix-ui';
import { useMemo, useState, type ReactNode } from 'react';
import { Ban, Check, Plus, Search, X } from 'lucide-react';
import { useStatic } from '@/components/providers';
import { AugmentIcon, ChampionIcon, ItemIcon, TraitBadge, TraitHex } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { filterKey } from '@/lib/stats/filters';
import type { Filter } from '@/lib/stats/types';
import { costColor, type StaticIndex } from '@/lib/static-index';
import { styleFor } from '@/lib/trait-style';
import { cn } from '@/lib/utils';
import { ITEM_CATEGORY_LABEL, type Item, type ItemCategory } from '@/types/static';

const EQUIPMENT: ItemCategory[] = ['completed', 'emblem', 'artifact', 'radiant', 'support', 'component'];

function PopoverBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Popover.Portal>
      <Popover.Content
        sideOffset={8}
        align="start"
        collisionPadding={12}
        className={cn(
          'z-50 w-[min(420px,calc(100vw-24px))] rounded-xl border border-line-strong bg-canopy p-4 text-sm shadow-[0_30px_80px_-24px_rgb(0_0_0/0.9)] data-[state=open]:animate-rise',
          className,
        )}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}

/* ── Describing a filter ────────────────────────────────── */
export function describeFilter(f: Filter, index: StaticIndex): { icon: ReactNode; name: string; detail: string } {
  switch (f.k) {
    case 'unit': {
      const c = index.champion(f.id);
      const parts: string[] = [];
      if (f.stars?.length) parts.push(`${f.stars.join('/')}★`);
      if (f.items?.length) parts.push(f.items.map((i) => index.item(i)?.name ?? i).join(' + '));
      else if (f.minItems) parts.push(`${f.minItems}+ items`);
      return {
        icon: <ChampionIcon id={f.id} size="xs" link={false} hover={false} />,
        name: c?.name ?? f.id,
        detail: parts.join(', '),
      };
    }
    case 'item': {
      const i = index.item(f.id);
      return {
        icon: <ItemIcon id={f.id} px={20} link={false} hover={false} />,
        name: i?.name ?? f.id,
        detail: f.min && f.min > 1 ? `${f.min}+ copies` : '',
      };
    }
    case 'trait': {
      const t = index.trait(f.id);
      const at = (tier?: number) => (tier ? (t?.effects[tier - 1]?.minUnits ?? tier) : undefined);
      const min = at(f.min);
      const max = at(f.max);
      const detail = min && max && f.min === f.max ? `exactly ${min}` : min ? `${min}+` : 'active';
      return {
        icon: t ? <TraitHex trait={t} style={styleFor(t, f.min ?? t.effects.length)} px={22} /> : null,
        name: t?.name ?? f.id,
        detail,
      };
    }
    case 'aug':
      return { icon: <AugmentIcon id={f.id} px={20} />, name: index.augment(f.id)?.name ?? f.id, detail: '' };
    case 'level': {
      const detail = f.min && f.max ? (f.min === f.max ? `${f.min}` : `${f.min}–${f.max}`) : f.min ? `${f.min}+` : `≤ ${f.max}`;
      return {
        icon: <span className="grid size-5 place-items-center rounded-md bg-bark text-[10px] font-bold text-lichen">Lv</span>,
        name: 'Level',
        detail,
      };
    }
  }
}

/* ── Shared bits ────────────────────────────────────────── */
function Toggle({
  on,
  onClick,
  children,
  tone = 'wisp',
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: 'wisp' | 'bloom';
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors',
        on
          ? tone === 'bloom'
            ? 'border-bloom/50 bg-bloom/12 text-bloom'
            : 'border-wisp/50 bg-wisp/12 text-wisp'
          : 'border-line-strong text-lichen hover:border-lichen/35 hover:text-moon',
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-lichen">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ExcludeToggle({ filter, onChange }: { filter: Filter; onChange: (f: Filter) => void }) {
  return (
    <div className="flex items-center justify-between border-t hairline pt-3">
      <span className="text-xs text-lichen">{filter.not ? 'Boards without this' : 'Boards with this'}</span>
      <Toggle
        on={Boolean(filter.not)}
        tone="bloom"
        onClick={() => onChange({ ...filter, not: filter.not ? undefined : true } as Filter)}
      >
        <Ban className="size-3.5" aria-hidden />
        Exclude
      </Toggle>
    </div>
  );
}

function ItemGrid({ onPick, selected = [] }: { onPick: (id: string) => void; selected?: string[] }) {
  const index = useStatic();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const list = index.data.items.filter(
      (i) => EQUIPMENT.includes(i.category) && (!q || i.name.toLowerCase().includes(q.toLowerCase())),
    );
    return EQUIPMENT.map((cat) => ({ cat, items: list.filter((i) => i.category === cat) })).filter((g) => g.items.length);
  }, [index, q]);
  return (
    <div className="space-y-3">
      <SearchInput value={q} onChange={setQ} placeholder="Search items" />
      <div className="max-h-56 space-y-3 overflow-y-auto pr-1 scroll-thin">
        {groups.map((g) => (
          <div key={g.cat}>
            <div className="mb-1.5 text-[11px] text-fog">{ITEM_CATEGORY_LABEL[g.cat]}</div>
            <div className="flex flex-wrap gap-1">
              {g.items.map((i: Item) => (
                <button
                  key={i.id}
                  type="button"
                  title={i.name}
                  onClick={() => onPick(i.key)}
                  className={cn(
                    'rounded-md p-0.5 transition hover:bg-wisp/15',
                    selected.includes(i.key) && 'bg-wisp/20 ring-1 ring-wisp/60',
                  )}
                >
                  <GameImage src={i.icon} alt={i.name} className="size-8 rounded" />
                </button>
              ))}
            </div>
          </div>
        ))}
        {!groups.length && <div className="py-6 text-center text-xs text-fog">No items match.</div>}
      </div>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  onKeyDown,
  autoFocus,
  large,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  large?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 rounded-lg border border-line-strong bg-night/60 px-3 focus-within:border-lichen/45',
        large ? 'h-11' : 'h-9',
      )}
    >
      <Search className="size-4 text-fog" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-moon outline-none placeholder:text-fog',
          large ? 'text-[15px]' : 'text-sm',
        )}
      />
    </label>
  );
}

/* ── One search over every kind of filter ───────────────── */
type HitKind = 'unit' | 'item' | 'trait' | 'aug';
interface Hit {
  kind: HitKind;
  key: string;
  name: string;
  detail: string;
  score: number;
}

const KIND_LABEL: Record<HitKind, string> = { unit: 'Champions', item: 'Items', trait: 'Traits', aug: 'Augments' };

/** 0 = name starts with the query, 1 = a word or the initials do ("ie" finds Infinity Edge), 2 = contains it. */
function matchScore(name: string, needle: string): number | null {
  const n = name.toLowerCase();
  if (n.startsWith(needle)) return 0;
  const words = n.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(needle))) return 1;
  if (
    needle.length >= 2 &&
    words
      .map((w) => w[0])
      .join('')
      .startsWith(needle)
  )
    return 1;
  const flat = n.replace(/[^a-z0-9]/g, '');
  if (flat.includes(needle.replace(/[^a-z0-9]/g, '')) && needle.length >= 2) return 2;
  return null;
}

function searchAll(index: StaticIndex, needle: string, hasAugments: boolean): Hit[] {
  const hits: Hit[] = [];
  const push = (kind: HitKind, key: string, name: string, detail: string) => {
    const score = matchScore(name, needle);
    if (score !== null) hits.push({ kind, key, name, detail, score });
  };
  for (const c of index.data.champions) push('unit', c.key, c.name, `${c.cost}-cost`);
  for (const i of index.data.items)
    if (EQUIPMENT.includes(i.category)) push('item', i.key, i.name, ITEM_CATEGORY_LABEL[i.category].replace(/s$/, ''));
  for (const t of index.data.traits) push('trait', t.key, t.name, t.effects.map((e) => e.minUnits).join(' / '));
  if (hasAugments)
    for (const a of index.data.augments) push('aug', a.key, a.name, a.tier === 'unknown' ? 'Augment' : `${a.tier[0].toUpperCase()}${a.tier.slice(1)}`);
  const limit: Record<HitKind, number> = { unit: 8, item: 8, trait: 6, aug: 6 };
  const byKind = new Map<HitKind, Hit[]>();
  for (const h of hits.sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name))) {
    const list = byKind.get(h.kind) ?? [];
    if (list.length < limit[h.kind]) list.push(h);
    byKind.set(h.kind, list);
  }
  // Groups in order of their best match, champions first on ties.
  const order: HitKind[] = ['unit', 'item', 'trait', 'aug'];
  return [...byKind.entries()]
    .sort((a, b) => a[1][0].score - b[1][0].score || order.indexOf(a[0]) - order.indexOf(b[0]))
    .flatMap(([, list]) => list);
}

function HitIcon({ hit }: { hit: Hit }) {
  if (hit.kind === 'unit') return <ChampionIcon id={hit.key} size="sm" link={false} hover={false} />;
  if (hit.kind === 'item') return <ItemIcon id={hit.key} px={30} link={false} hover={false} />;
  if (hit.kind === 'trait') return <TraitBadge id={hit.key} size={28} link={false} hover={false} showCount={false} />;
  return <AugmentIcon id={hit.key} px={30} />;
}

/* ── Editors ────────────────────────────────────────────── */
function UnitEditor({ filter, onChange }: { filter: Extract<Filter, { k: 'unit' }>; onChange: (f: Filter) => void }) {
  const index = useStatic();
  const [picking, setPicking] = useState(false);
  const stars = filter.stars ?? [];
  const items = filter.items ?? [];
  const toggleStar = (s: number) => {
    const next = stars.includes(s) ? stars.filter((x) => x !== s) : [...stars, s].sort();
    onChange({ ...filter, stars: next.length && next.length < 3 ? next : undefined });
  };
  return (
    <div className="space-y-4">
      <Row label="Star level">
        {[1, 2, 3].map((s) => (
          <Toggle key={s} on={stars.includes(s)} onClick={() => toggleStar(s)}>
            {'★'.repeat(s)}
          </Toggle>
        ))}
      </Row>
      <Row label="Holding these items">
        {items.map((it, i) => (
          <button
            key={`${it}-${i}`}
            type="button"
            onClick={() => {
              const next = items.filter((_, j) => j !== i);
              onChange({ ...filter, items: next.length ? next : undefined });
            }}
            className="group relative rounded-md"
            title={`Remove ${index.item(it)?.name ?? it}`}
          >
            <ItemIcon id={it} px={32} link={false} hover={false} />
            <span className="absolute -right-1 -top-1 hidden size-4 place-items-center rounded-full bg-bloom text-night group-hover:grid">
              <X className="size-3" />
            </span>
          </button>
        ))}
        {items.length < 3 && (
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            className={cn(
              'grid size-9 place-items-center rounded-md border border-dashed text-lichen hover:border-wisp/50 hover:text-wisp',
              picking ? 'border-wisp/50 text-wisp' : 'border-line-strong',
            )}
            aria-label="Add item"
          >
            <Plus className="size-4" />
          </button>
        )}
      </Row>
      {picking && (
        <ItemGrid
          selected={items}
          onPick={(id) => {
            const next = [...items, id].slice(0, 3);
            onChange({ ...filter, items: next });
            if (next.length >= 3) setPicking(false);
          }}
        />
      )}
      {!items.length && (
        <Row label="Item count">
          {[undefined, 1, 2, 3].map((n) => (
            <Toggle key={n ?? 0} on={filter.minItems === n} onClick={() => onChange({ ...filter, minItems: n })}>
              {n ? `${n}+` : 'Any'}
            </Toggle>
          ))}
        </Row>
      )}
      <ExcludeToggle filter={filter} onChange={onChange} />
    </div>
  );
}

function TraitEditor({ filter, onChange }: { filter: Extract<Filter, { k: 'trait' }>; onChange: (f: Filter) => void }) {
  const index = useStatic();
  const trait = index.trait(filter.id);
  const exact = Boolean(filter.min && filter.max && filter.min === filter.max);
  return (
    <div className="space-y-4">
      <Row label="Breakpoint">
        <Toggle on={!filter.min} onClick={() => onChange({ ...filter, min: undefined, max: undefined })}>
          Any active
        </Toggle>
        {trait?.effects.map((e, i) => (
          <Toggle
            key={e.minUnits}
            on={filter.min === i + 1}
            onClick={() => onChange({ ...filter, min: i + 1, max: exact ? i + 1 : undefined })}
          >
            <span className="size-2 rounded-full" style={{ background: `var(--color-style-${e.style})` }} />
            {e.minUnits}
            {exact ? '' : '+'}
          </Toggle>
        ))}
      </Row>
      {filter.min && (
        <Row label="Match">
          <Toggle on={!exact} onClick={() => onChange({ ...filter, max: undefined })}>
            This breakpoint or higher
          </Toggle>
          <Toggle on={exact} onClick={() => onChange({ ...filter, max: filter.min })}>
            Exactly this breakpoint
          </Toggle>
        </Row>
      )}
      <ExcludeToggle filter={filter} onChange={onChange} />
    </div>
  );
}

function ItemEditor({ filter, onChange }: { filter: Extract<Filter, { k: 'item' }>; onChange: (f: Filter) => void }) {
  return (
    <div className="space-y-4">
      <Row label="Copies on the board">
        {[1, 2, 3].map((n) => (
          <Toggle key={n} on={(filter.min ?? 1) === n} onClick={() => onChange({ ...filter, min: n > 1 ? n : undefined })}>
            {n}+
          </Toggle>
        ))}
      </Row>
      <ExcludeToggle filter={filter} onChange={onChange} />
    </div>
  );
}

function LevelEditor({ filter, onChange }: { filter: Extract<Filter, { k: 'level' }>; onChange: (f: Filter) => void }) {
  const levels = [5, 6, 7, 8, 9, 10];
  return (
    <div className="space-y-4">
      <Row label="At least">
        {levels.map((l) => (
          <Toggle key={l} on={filter.min === l} onClick={() => onChange({ ...filter, min: filter.min === l ? undefined : l })}>
            {l}
          </Toggle>
        ))}
      </Row>
      <Row label="At most">
        {levels.map((l) => (
          <Toggle key={l} on={filter.max === l} onClick={() => onChange({ ...filter, max: filter.max === l ? undefined : l })}>
            {l}
          </Toggle>
        ))}
      </Row>
      <ExcludeToggle filter={filter} onChange={onChange} />
    </div>
  );
}

function Editor({ filter, onChange }: { filter: Filter; onChange: (f: Filter) => void }) {
  switch (filter.k) {
    case 'unit':
      return <UnitEditor filter={filter} onChange={onChange} />;
    case 'trait':
      return <TraitEditor filter={filter} onChange={onChange} />;
    case 'item':
      return <ItemEditor filter={filter} onChange={onChange} />;
    case 'level':
      return <LevelEditor filter={filter} onChange={onChange} />;
    case 'aug':
      return <ExcludeToggle filter={filter} onChange={onChange} />;
  }
}

/* ── Chip ───────────────────────────────────────────────── */
function FilterChip({
  filter,
  open,
  onOpenChange,
  onChange,
  onRemove,
}: {
  filter: Filter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (f: Filter) => void;
  onRemove: () => void;
}) {
  const index = useStatic();
  const d = describeFilter(filter, index);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <span
        className={cn(
          'inline-flex h-10 items-center rounded-xl border pl-1.5 pr-1 transition-colors',
          filter.not ? 'border-bloom/40 bg-bloom/[0.07]' : 'border-line-strong bg-wisp/[0.06]',
          open && 'ring-2 ring-wisp/30',
        )}
      >
        <Popover.Trigger asChild>
          <button type="button" className="flex h-full items-center gap-2 pl-1 pr-2 text-[13px]">
            {filter.not && <span className="rounded bg-bloom/20 px-1.5 py-0.5 text-[10px] font-bold text-bloom">NOT</span>}
            {d.icon}
            <span className="font-medium text-moon">{d.name}</span>
            {d.detail && <span className="text-lichen">{d.detail}</span>}
          </button>
        </Popover.Trigger>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${d.name} filter`}
          className="grid size-7 place-items-center rounded-lg text-lichen hover:bg-white/5 hover:text-moon"
        >
          <X className="size-3.5" />
        </button>
      </span>
      <PopoverBody>
        <div className="mb-4 flex items-center gap-3">
          {d.icon}
          <div className="text-[15px] font-semibold">{d.name}</div>
        </div>
        <Editor filter={filter} onChange={onChange} />
      </PopoverBody>
    </Popover.Root>
  );
}

/* ── Adding filters ─────────────────────────────────────── */
type PickTab = 'units' | 'traits' | 'items' | 'augments' | 'level';

function AddFilter({ onAdd, hasAugments, active }: { onAdd: (f: Filter) => void; hasAugments: boolean; active: Set<string> }) {
  const index = useStatic();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickTab>('units');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const add = (f: Filter) => {
    onAdd(f);
    setOpen(false);
    setQ('');
  };
  const tabs: Array<{ id: PickTab; label: string }> = [
    { id: 'units', label: 'Champions' },
    { id: 'traits', label: 'Traits' },
    { id: 'items', label: 'Items' },
    ...(hasAugments ? [{ id: 'augments' as const, label: 'Augments' }] : []),
    { id: 'level', label: 'Level' },
  ];
  const champs = index.data.champions.filter((c) => !needle || c.name.toLowerCase().includes(needle));
  const traits = index.data.traits.filter((t) => !needle || t.name.toLowerCase().includes(needle));
  const items = index.data.items.filter(
    (i) => EQUIPMENT.includes(i.category) && (!needle || i.name.toLowerCase().includes(needle)),
  );
  const augments = index.data.augments.filter((a) => !needle || a.name.toLowerCase().includes(needle));

  const mark = (key: string) => (active.has(key) ? <Check className="absolute right-1 top-1 size-3 text-wisp" /> : null);
  const hits = useMemo(() => (needle ? searchAll(index, needle, hasAugments) : []), [index, needle, hasAugments]);
  const [cursor, setCursor] = useState(0);
  const pick = (hit: Hit) => add({ k: hit.kind, id: hit.key } as Filter);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(hits.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(hits[Math.min(cursor, hits.length - 1)]);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-dashed border-lichen/30 px-3.5 text-[13px] font-medium text-lichen transition hover:border-wisp/60 hover:text-wisp"
        >
          <Plus className="size-4" aria-hidden />
          Add filter
        </button>
      </Popover.Trigger>
      <PopoverBody className="w-[min(520px,calc(100vw-24px))]">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setCursor(0);
          }}
          onKeyDown={onKey}
          placeholder="Search champions, items, traits, augments"
          autoFocus
          large
        />
        {needle ? (
          <div className="mt-3 max-h-[360px] overflow-y-auto pr-1 scroll-thin" role="listbox" aria-label="Matches">
            {hits.length === 0 && <div className="py-8 text-center text-xs text-fog">Nothing matches “{q}”.</div>}
            {hits.map((hit, i) => (
              <div key={`${hit.kind}:${hit.key}`}>
                {(i === 0 || hits[i - 1].kind !== hit.kind) && (
                  <div className="eyebrow px-2 pb-1 pt-2.5 text-[10px] text-fog">{KIND_LABEL[hit.kind]}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(hit)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left',
                    i === cursor ? 'bg-white/[0.06] text-moon' : 'text-lichen',
                  )}
                >
                  <HitIcon hit={hit} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{hit.name}</span>
                  <span className="shrink-0 text-xs text-fog">{hit.detail}</span>
                  {active.has(`${hit.kind}:${hit.key}`) && (
                    <Check className="size-3.5 shrink-0 text-wisp" aria-label="Already filtered" />
                  )}
                </button>
              </div>
            ))}
            {hits.length > 0 && (
              <div className="px-2 pt-2 text-[11px] text-fog">Enter adds the highlighted match. Arrows move.</div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-3 mt-3 flex gap-1 overflow-x-auto scroll-thin">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'h-8 shrink-0 rounded-lg px-3 text-[13px] font-medium',
                    tab === t.id ? 'bg-bark text-moon' : 'text-lichen hover:text-moon',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="max-h-[320px] overflow-y-auto pr-1 scroll-thin">
              {tab === 'units' &&
                [1, 2, 3, 4, 5, 6].map((cost) => {
                  const list = champs.filter((c) => (cost === 6 ? c.cost >= 6 : c.cost === cost));
                  if (!list.length) return null;
                  return (
                    <div key={cost} className="mb-3">
                      <div className="mb-1.5 text-[11px]" style={{ color: costColor(cost) }}>
                        {cost === 6 ? 'Special' : `${cost}-cost`}
                      </div>
                      <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                        {list.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            title={c.name}
                            onClick={() => add({ k: 'unit', id: c.key })}
                            className="relative flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-white/5"
                          >
                            <ChampionIcon id={c.key} size="md" link={false} hover={false} />
                            <span className="w-full truncate text-center text-[10px] text-lichen">{c.name}</span>
                            {mark(`unit:${c.key}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              {tab === 'traits' && (
                <div className="grid grid-cols-2 gap-1">
                  {traits.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => add({ k: 'trait', id: t.key })}
                      className="relative flex items-center gap-2 rounded-lg p-2 text-left text-[13px] hover:bg-white/5"
                    >
                      <TraitBadge id={t.key} tier={t.effects.length} size={26} link={false} hover={false} showCount={false} />
                      <span className="truncate">{t.name}</span>
                      {mark(`trait:${t.key}`)}
                    </button>
                  ))}
                </div>
              )}
              {tab === 'items' &&
                EQUIPMENT.map((cat) => {
                  const list = items.filter((i) => i.category === cat);
                  if (!list.length) return null;
                  return (
                    <div key={cat} className="mb-3">
                      <div className="mb-1.5 text-[11px] text-fog">{ITEM_CATEGORY_LABEL[cat]}</div>
                      <div className="flex flex-wrap gap-1">
                        {list.map((i) => (
                          <button
                            key={i.id}
                            type="button"
                            title={i.name}
                            onClick={() => add({ k: 'item', id: i.key })}
                            className="relative rounded-md p-0.5 hover:bg-wisp/15"
                          >
                            <GameImage src={i.icon} alt={i.name} className="size-9 rounded" />
                            {mark(`item:${i.key}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              {tab === 'augments' && (
                <div className="grid grid-cols-2 gap-1">
                  {augments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => add({ k: 'aug', id: a.key })}
                      className="flex items-center gap-2 rounded-lg p-2 text-left text-[13px] hover:bg-white/5"
                    >
                      <GameImage src={a.icon} alt={a.name} className="size-7 rounded-md" />
                      <span className="truncate">{a.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {tab === 'level' && (
                <div className="space-y-2">
                  <p className="text-xs text-lichen">Player level at the end of the game.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[7, 8, 9, 10].map((l) => (
                      <Toggle key={l} on={false} onClick={() => add({ k: 'level', min: l, max: l })}>
                        Level {l}
                      </Toggle>
                    ))}
                    <Toggle on={false} onClick={() => add({ k: 'level', min: 9 })}>
                      9 or higher
                    </Toggle>
                  </div>
                </div>
              )}
              {tab !== 'level' &&
                ((tab === 'units' && !champs.length) ||
                  (tab === 'traits' && !traits.length) ||
                  (tab === 'items' && !items.length) ||
                  (tab === 'augments' && !augments.length)) && (
                  <div className="py-8 text-center text-xs text-fog">Nothing matches “{q}”.</div>
                )}
            </div>
          </>
        )}
      </PopoverBody>
    </Popover.Root>
  );
}

export function FilterBar({
  filters,
  editing,
  setEditing,
  onAdd,
  onUpdate,
  onRemove,
  onClear,
  hasAugments,
}: {
  filters: Filter[];
  editing: string | null;
  setEditing: (key: string | null) => void;
  onAdd: (f: Filter) => void;
  onUpdate: (key: string, f: Filter) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  hasAugments: boolean;
}) {
  const active = new Set(filters.map(filterKey));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        const key = filterKey(f);
        return (
          <FilterChip
            key={key}
            filter={f}
            open={editing === key}
            onOpenChange={(o) => setEditing(o ? key : null)}
            onChange={(nf) => onUpdate(key, nf)}
            onRemove={() => onRemove(key)}
          />
        );
      })}
      <AddFilter
        hasAugments={hasAugments}
        active={active}
        onAdd={(f) => {
          onAdd(f);
          // Open the editor right away when there is something to refine.
          if (f.k === 'unit' || f.k === 'trait') setTimeout(() => setEditing(filterKey(f)), 60);
        }}
      />
      {filters.length > 0 && (
        <button type="button" onClick={onClear} className="ml-1 text-[13px] font-medium text-lichen hover:text-bloom">
          Clear all
        </button>
      )}
    </div>
  );
}
