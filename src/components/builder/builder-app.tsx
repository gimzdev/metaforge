'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Eraser, FlaskConical, Info, Link2, Save, Search, Trash2, X } from 'lucide-react';
import { useStatic } from '@/components/providers';
import { Stars, TraitHex } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { RichText } from '@/components/game/rich-text';
import { Select } from '@/components/ui/primitives';
import {
  COLS,
  MAX_ITEMS,
  ROWS,
  computeTraits,
  decodeBoard,
  encodeBoard,
  exclusiveConflict,
  firstFreeHex,
  slotsUsed,
  type ActiveTrait,
  type BuilderBoard,
} from '@/lib/builder';
import { encodeFilters } from '@/lib/stats/filters';
import type { Filter } from '@/lib/stats/types';
import { costColor, preferredRow } from '@/lib/static-index';
import { cn } from '@/lib/utils';
import type { Champion, ItemCategory } from '@/types/static';

const STORAGE_KEY = 'metaforge-builder-v2';
/** Solid so the buttons stay readable over the page artwork; disabled ones stay solid but go quiet. */
const TOOL_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-canopy px-3 text-[13px] font-medium text-moon transition-colors hover:text-moon disabled:pointer-events-none disabled:border-line disabled:text-fog';

/** Item palette tabs. Components and support items share "Other", components first. */
const ITEM_TABS: Array<{ id: string; label: string; cats: ItemCategory[] }> = [
  { id: 'completed', label: 'Completed', cats: ['completed'] },
  { id: 'emblem', label: 'Emblems', cats: ['emblem'] },
  { id: 'artifact', label: 'Artifacts', cats: ['artifact'] },
  { id: 'radiant', label: 'Radiant', cats: ['radiant'] },
  { id: 'other', label: 'Other', cats: ['component', 'support'] },
];

interface SavedBoard {
  id: string;
  name: string;
  code: string;
  savedAt: number;
}

interface Persisted {
  current?: string;
  level?: number | null;
  saved?: SavedBoard[];
}

function readStorage(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

function writeStorage(value: Persisted) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode): the URL still holds the board */
  }
}

type DragData = { type: 'pool'; key: string } | { type: 'unit'; hex: number } | { type: 'item'; key: string };
type DropData = { type: 'hex'; hex: number } | { type: 'pool' };

/* ── Hex cells ──────────────────────────────────────────── */
const HEX_H = 1.1547;

function UnitFace({
  champion,
  star,
  items,
  lifted,
  selected,
}: {
  champion: Champion;
  star: number;
  items: string[];
  lifted?: boolean;
  selected?: boolean;
}) {
  const index = useStatic();
  return (
    <span className={cn('absolute inset-0 block', lifted && 'scale-110')}>
      {selected && <span className="hex-tall absolute -inset-[4px] bg-wisp" aria-hidden />}
      <span className="hex-tall absolute inset-0" style={{ background: costColor(champion.cost) }} />
      <span className="hex-tall absolute inset-[3px] overflow-hidden bg-bark">
        <GameImage
          src={champion.tile ?? champion.icon}
          alt={champion.name}
          className="h-full w-full"
          imgClassName="scale-[1.12]"
        />
      </span>
      {star >= 2 && (
        <Stars
          star={star}
          outline
          className="absolute inset-x-0 -top-[0.5em] z-10 text-[length:calc(var(--hex)*0.3)]"
        />
      )}
      {/* Items sit inside the hex, just above where its lower sides slant in, so even three stay off the neighbours. */}
      {items.length > 0 && (
        <span className="absolute bottom-[21%] left-1/2 z-20 flex -translate-x-1/2 gap-px rounded-[4px] bg-night/90 p-px shadow-[0_2px_6px_rgb(0_0_0/0.6)]">
          {items.map((it, i) => {
            const item = index.item(it);
            return (
              <GameImage
                key={`${it}-${i}`}
                src={item?.icon}
                alt={item?.name ?? it}
                className="rounded-[3px]"
                style={{ width: 'calc(var(--hex) * 0.24)', height: 'calc(var(--hex) * 0.24)' }}
              />
            );
          })}
        </span>
      )}
    </span>
  );
}

function BoardUnit({
  hex,
  champion,
  star,
  items,
  selected,
  onSelect,
}: {
  hex: number;
  champion: Champion;
  star: number;
  items: string[];
  selected: boolean;
  onSelect: (hex: number) => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `unit-${hex}`,
    data: { type: 'unit', hex } satisfies DragData,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onSelect(hex)}
      title={`${champion.name}${items.length ? ` with ${items.length} item${items.length > 1 ? 's' : ''}` : ''}`}
      aria-label={`${champion.name}, ${star} star. Select to edit`}
      className={cn('absolute inset-0 touch-none outline-none', isDragging && 'opacity-25')}
    >
      <UnitFace champion={champion} star={star} items={items} selected={selected} />
    </button>
  );
}

function HexCell({
  hex,
  board,
  selected,
  onSelect,
}: {
  hex: number;
  board: BuilderBoard;
  selected: number | null;
  onSelect: (hex: number) => void;
}) {
  const index = useStatic();
  const { setNodeRef, isOver } = useDroppable({ id: `hex-${hex}`, data: { type: 'hex', hex } satisfies DropData });
  const unit = board[hex];
  const champion = unit ? index.champion(unit.key) : undefined;
  return (
    <div
      ref={setNodeRef}
      data-hex={hex}
      className="relative"
      style={{ width: 'var(--hex)', height: `calc(var(--hex) * ${HEX_H})` }}
    >
      <span className={cn('hex-tall absolute inset-0 transition-colors', isOver ? 'bg-wisp/70' : 'bg-lichen/[0.14]')} />
      <span className={cn('hex-tall absolute inset-[2px] transition-colors', isOver ? 'bg-wisp/15' : 'bg-canopy')} />
      {unit && champion && (
        <BoardUnit
          hex={hex}
          champion={champion}
          star={unit.star}
          items={unit.items}
          selected={selected === hex}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

/* ── Pool & items ───────────────────────────────────────── */
function PoolChampion({ champion, onAdd, onBoard }: { champion: Champion; onAdd: (key: string) => void; onBoard: boolean }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `pool-${champion.key}`,
    data: { type: 'pool', key: champion.key } satisfies DragData,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onAdd(champion.key)}
      title={onBoard ? `${champion.name} (on the board)` : `Add ${champion.name}`}
      className={cn(
        'group relative flex touch-none flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition hover:bg-white/[0.05]',
        isDragging && 'opacity-40',
      )}
    >
      <span
        className={cn('block rounded-[9px] p-[2px] ring-offset-2 ring-offset-canopy', onBoard && 'ring-2 ring-wisp')}
        style={{ background: costColor(champion.cost) }}
      >
        <GameImage src={champion.icon} alt={champion.name} className="size-11 rounded-[7px]" />
      </span>
      <span className="w-full truncate text-center text-[10px] leading-tight text-lichen group-hover:text-moon">
        {champion.name}
      </span>
    </button>
  );
}

function PaletteItem({ itemKey, onPick }: { itemKey: string; onPick: (key: string) => void }) {
  const index = useStatic();
  const item = index.item(itemKey);
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `item-${itemKey}`,
    data: { type: 'item', key: itemKey } satisfies DragData,
  });
  if (!item) return null;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onPick(itemKey)}
      title={item.name}
      className={cn('touch-none rounded-lg p-0.5 transition hover:bg-wisp/15', isDragging && 'opacity-40')}
    >
      <GameImage src={item.icon} alt={item.name} className="size-10 rounded-md" />
    </button>
  );
}

function PoolDropZone({ children, active }: { children: ReactNode; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { type: 'pool' } satisfies DropData });
  return (
    <div ref={setNodeRef} className="relative">
      {children}
      {active && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 grid place-items-center rounded-xl border-2 border-dashed text-sm font-medium-[2px] transition-colors',
            isOver ? 'border-bloom/70 bg-bloom/15 text-bloom' : 'border-line-strong bg-night/50 text-lichen',
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Trash2 className="size-4" aria-hidden />
            Drop here to remove
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Traits panel ───────────────────────────────────────── */
function TraitRow({ t }: { t: ActiveTrait }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-xl px-2 py-1.5', t.tier === 0 && 'opacity-60')}>
      <TraitHex trait={t.trait} style={t.style} px={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <Link href={`/traits/${t.trait.slug}`} className="truncate text-sm font-medium hover:text-wisp">
            {t.trait.name}
          </Link>
          <span className="num shrink-0 text-xs text-lichen">
            {t.count}
            {t.next ? <span className="text-fog"> / {t.next}</span> : null}
          </span>
        </div>
        <div className="mt-0.5 flex gap-1">
          {t.trait.effects.map((e, i) => (
            <span
              key={e.minUnits}
              className={cn('num rounded px-1 text-[10px] font-semibold', i < t.tier ? 'bg-night' : 'text-fog')}
              style={i < t.tier ? { color: `var(--color-style-${e.style})` } : undefined}
            >
              {e.minUnits}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

/* ── Main ───────────────────────────────────────────────── */
export function BuilderApp({ initialCode }: { initialCode: string | null }) {
  const index = useStatic();
  const initial = useMemo(() => decodeBoard(initialCode, index), [initialCode, index]);
  const [board, setBoard] = useState<BuilderBoard>(initial.board);
  const [level, setLevel] = useState<number | null>(initial.level);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [saved, setSaved] = useState<SavedBoard[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [q, setQ] = useState('');
  const [cost, setCost] = useState<number | null>(null);
  const [traitFilter, setTraitFilter] = useState('');
  const [itemTab, setItemTab] = useState('completed');
  const hydrated = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3800);
  }, []);

  // Restore saved boards (and the last board when the URL carries none).
  useEffect(() => {
    const stored = readStorage();
    setSaved(Array.isArray(stored.saved) ? stored.saved.slice(0, 30) : []);
    if (!initialCode && stored.current) {
      const restored = decodeBoard(stored.current, index);
      setBoard(restored.board);
      setLevel(stored.level ?? restored.level);
    }
    hydrated.current = true;
  }, [initialCode, index]);

  const code = useMemo(() => encodeBoard(board, level ?? undefined), [board, level]);
  const empty = Object.keys(board).length === 0;

  // Keep URL and storage in sync with the board.
  useEffect(() => {
    if (!hydrated.current) return;
    const url = empty ? window.location.pathname : `${window.location.pathname}?b=${code}`;
    if (url !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(window.history.state, '', url);
    writeStorage({ ...readStorage(), current: empty ? undefined : code, level });
  }, [code, empty, level]);

  const traits = useMemo(() => computeTraits(board, index), [board, index]);
  const slots = useMemo(() => slotsUsed(board, index), [board, index]);
  const teamSize = level ?? Math.max(1, slots);
  const boardValue = useMemo(
    () =>
      Object.values(board).reduce((sum, u) => {
        const c = index.champion(u.key);
        return sum + (c ? c.cost * 3 ** (Math.min(u.star, 3) - 1) : 0);
      }, 0),
    [board, index],
  );
  const onBoard = useMemo(() => new Set(Object.values(board).map((u) => u.key)), [board]);

  /* Board operations */
  const place = useCallback(
    (key: string, hex: number | null) => {
      const champion = index.champion(key);
      if (!champion) return;
      const conflict = exclusiveConflict(board, key, index, hex ?? undefined);
      if (conflict) {
        flash(`Only one Avatar can be fielded. Remove ${conflict} first.`);
        return;
      }
      const target = hex ?? firstFreeHex(board, preferredRow(champion));
      if (target === null) {
        flash('The board is full.');
        return;
      }
      setBoard((b) => ({ ...b, [target]: { key: champion.key, star: 1, items: [] } }));
      setSelected(target);
    },
    [board, index, flash],
  );

  const move = (from: number, to: number) => {
    if (from === to) return;
    setBoard((b) => {
      const next = { ...b };
      const a = next[from];
      const c = next[to];
      if (!a) return b;
      next[to] = a;
      if (c) next[from] = c;
      else delete next[from];
      return next;
    });
    setSelected((s) => (s === from ? to : s === to ? from : s));
  };

  const remove = (hex: number) => {
    setBoard((b) => {
      const next = { ...b };
      delete next[hex];
      return next;
    });
    setSelected((s) => (s === hex ? null : s));
  };

  const equip = (hex: number, itemKey: string) => {
    const unit = board[hex];
    const item = index.item(itemKey);
    const champion = unit ? index.champion(unit.key) : undefined;
    if (!unit || !item || !champion) return;
    if (unit.items.length >= MAX_ITEMS) {
      flash(`${champion.name} already holds ${MAX_ITEMS} items.`);
      return;
    }
    if (item.unique && unit.items.includes(item.key)) {
      flash(`${item.name} is unique: one per champion.`);
      return;
    }
    const grants = item.traits.map((t) => t.toLowerCase());
    if (grants.length && grants.every((t) => champion.traits.map((x) => x.toLowerCase()).includes(t))) {
      flash(`${champion.name} already has that trait.`);
      return;
    }
    setBoard((b) => ({ ...b, [hex]: { ...unit, items: [...unit.items, item.key] } }));
  };

  const pickItem = (itemKey: string) => {
    if (selected === null || !board[selected]) {
      flash('Select a champion on the board first, or drag the item onto one.');
      return;
    }
    equip(selected, itemKey);
  };

  /* Drag and drop */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
  );
  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as DragData) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const from = e.active.data.current as DragData | undefined;
    const to = e.over?.data.current as DropData | undefined;
    if (!from || !to) return;
    if (from.type === 'unit' && to.type === 'pool') return remove(from.hex);
    if (to.type !== 'hex') return;
    if (from.type === 'pool') {
      const current = board[to.hex];
      if (current) {
        const conflict = exclusiveConflict(board, from.key, index, to.hex);
        if (conflict) return flash(`Only one Avatar can be fielded. Remove ${conflict} first.`);
        setBoard((b) => ({ ...b, [to.hex]: { key: from.key, star: 1, items: [] } }));
        setSelected(to.hex);
        return;
      }
      return place(from.key, to.hex);
    }
    if (from.type === 'unit') return move(from.hex, to.hex);
    if (from.type === 'item') {
      if (!board[to.hex]) return flash('Drop items onto a champion.');
      equip(to.hex, from.key);
      setSelected(to.hex);
    }
  };

  /* Pool list */
  const needle = q.trim().toLowerCase();
  const pool = useMemo(
    () =>
      index.data.champions.filter(
        (c) =>
          (cost === null || Math.min(c.cost, 6) === cost) &&
          (!traitFilter || c.traits.map((t) => t.toLowerCase()).includes(traitFilter)) &&
          (!needle || c.name.toLowerCase().includes(needle)),
      ),
    [index, cost, traitFilter, needle],
  );
  const itemTabs = useMemo(
    () => ITEM_TABS.filter((t) => index.data.items.some((i) => t.cats.includes(i.category))),
    [index],
  );
  const paletteItems = useMemo(() => {
    const cats = (itemTabs.find((t) => t.id === itemTab) ?? itemTabs[0])?.cats ?? [];
    return index.data.items
      .filter((i) => cats.includes(i.category))
      .sort((a, b) => cats.indexOf(a.category) - cats.indexOf(b.category) || a.name.localeCompare(b.name));
  }, [index, itemTabs, itemTab]);

  /* Actions */
  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/builder?b=${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      flash('Copy the link from the address bar.');
    }
  };
  const persistSaved = (list: SavedBoard[]) => {
    setSaved(list);
    writeStorage({ ...readStorage(), saved: list });
  };
  const saveBoard = () => {
    if (empty) return flash('Add some champions before saving.');
    const topTrait = traits.find((t) => t.tier > 0 && t.trait.kind !== 'unique');
    const name = saveName.trim() || (topTrait ? `${topTrait.count} ${topTrait.trait.name}` : 'My board');
    persistSaved([{ id: `${Date.now()}`, name, code, savedAt: Date.now() }, ...saved].slice(0, 30));
    setSaveName('');
    flash(`Saved “${name}”.`);
  };
  const load = (s: SavedBoard) => {
    const restored = decodeBoard(s.code, index);
    setBoard(restored.board);
    setLevel(restored.level);
    setSelected(null);
  };
  const explorerHref = useMemo(() => {
    const filters: Filter[] = [];
    for (const u of Object.values(board)) {
      if (u.items.length >= 2 && filters.length < 2) filters.push({ k: 'unit', id: u.key });
    }
    for (const t of traits) {
      if (filters.length >= 4) break;
      if (t.tier > 0 && t.trait.kind !== 'unique' && t.trait.effects.length > 1)
        filters.push({ k: 'trait', id: t.trait.key, min: t.tier });
    }
    return filters.length ? `/explorer?f=${encodeFilters(filters)}` : null;
  }, [board, traits]);

  const selectedUnit = selected !== null ? board[selected] : undefined;
  const selectedChampion = selectedUnit ? index.champion(selectedUnit.key) : undefined;
  const active = traits.filter((t) => t.tier > 0);
  const inactive = traits.filter((t) => t.tier === 0);
  const dragChampion =
    dragging?.type === 'pool'
      ? index.champion(dragging.key)
      : dragging?.type === 'unit'
        ? index.champion(board[dragging.hex]?.key)
        : undefined;
  const dragItem = dragging?.type === 'item' ? index.item(dragging.key) : undefined;

  const boardStyle = { '--hex': 'clamp(38px, calc((100cqw - 56px) / 7.5), 84px)' } as CSSProperties;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Team builder</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-lichen">
              Drag champions onto the board, drop items on them, and watch synergies update with this set&apos;s rules, including
              the Avatar&apos;s doubled trait and the Elder Dragon&apos;s two slots.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="Player level"
              value={level === null ? 'auto' : String(level)}
              onChange={(e) => setLevel(e.target.value === 'auto' ? null : Number(e.target.value))}
            >
              <option value="auto">Level: auto</option>
              {[3, 4, 5, 6, 7, 8, 9, 10].map((l) => (
                <option key={l} value={l}>
                  Level {l}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={share}
              disabled={empty}
              className={cn(TOOL_BUTTON, 'hover:border-lichen/45')}
            >
              {copied ? <Check className="size-4 text-wisp" /> : <Link2 className="size-4" />}
              {copied ? 'Copied' : 'Share'}
            </button>
            {explorerHref && (
              <Link href={explorerHref} className={cn(TOOL_BUTTON, 'hover:border-lichen/45')}>
                <FlaskConical className="size-4" />
                Explore similar
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setBoard({});
                setSelected(null);
                setLevel(null);
              }}
              disabled={empty}
              className={cn(TOOL_BUTTON, 'hover:border-bloom/45 hover:text-bloom')}
            >
              <Eraser className="size-4" />
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            {/* Board */}
            <section className="surface relative rounded-xl p-4 sm:p-6" aria-label="Board">
              <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className={cn('num font-semibold', slots > teamSize ? 'text-bloom' : 'text-moon')}>
                  {level === null ? `${slots} ${slots === 1 ? 'unit' : 'units'}` : `${slots} / ${level} units`}
                </span>
                <span className="num text-lichen">{boardValue} gold of champions</span>
                <span className="text-lichen">{active.length} active traits</span>
                {slots > teamSize && <span className="text-xs text-bloom">More units than your level allows</span>}
              </div>
              <div className="@container">
                <div className="mx-auto w-fit py-2" style={boardStyle}>
                  {Array.from({ length: ROWS }, (_, row) => (
                    <div
                      key={row}
                      className="flex gap-[calc(var(--hex)*0.07)]"
                      style={{
                        marginLeft: row % 2 === 1 ? 'calc(var(--hex) * 0.535)' : 0,
                        marginTop: row === 0 ? 0 : `calc(var(--hex) * ${HEX_H} * -0.21)`,
                      }}
                    >
                      {Array.from({ length: COLS }, (_, col) => {
                        const hex = row * COLS + col;
                        return (
                          <HexCell
                            key={hex}
                            hex={hex}
                            board={board}
                            selected={selected}
                            onSelect={(h) => setSelected(h === selected ? null : h)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              {empty && (
                <p className="mt-4 text-center text-sm text-lichen">
                  Click a champion below to add it, or drag it onto a hex. The front line is at the top.
                </p>
              )}
              {notice && (
                <div
                  role="status"
                  className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-xl border border-firefly/30 bg-night/95 px-4 py-2.5 text-sm text-moon shadow-lg sm:inset-x-auto sm:right-6"
                >
                  <Info className="size-4 shrink-0 text-firefly" aria-hidden />
                  {notice}
                </div>
              )}
            </section>

            {/* Champions and items side by side, right under the board; the pool gets the room */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              {/* Champion pool */}
              <PoolDropZone active={dragging?.type === 'unit'}>
                <section className="surface flex h-full flex-col rounded-xl p-4 sm:p-5" aria-label="Champions">
                  <div className="flex flex-wrap items-center gap-2 border-b hairline pb-3">
                    <label className="flex h-9 min-w-[9rem] flex-1 items-center gap-2 rounded-lg border border-line-strong bg-night/60 px-3 focus-within:border-lichen/45">
                      <Search className="size-4 text-fog" aria-hidden />
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search champions"
                        aria-label="Search champions"
                        className="min-w-0 flex-1 bg-transparent text-sm text-moon outline-none placeholder:text-fog"
                      />
                    </label>
                    <Select label="Trait" value={traitFilter} onChange={(e) => setTraitFilter(e.target.value)}>
                      <option value="">All traits</option>
                      {[...index.data.traits]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((t) => (
                          <option key={t.id} value={t.key}>
                            {t.name}
                          </option>
                        ))}
                    </Select>
                    <div role="group" aria-label="Cost" className="flex h-9 items-center rounded-lg border border-line-strong bg-canopy p-0.5">
                      {[1, 2, 3, 4, 5].map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={cost === c}
                          title={`${c}-cost`}
                          onClick={() => setCost(cost === c ? null : c)}
                          className={cn(
                            'flex h-full items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                            cost === c ? 'bg-bark text-moon' : 'text-lichen hover:text-moon',
                          )}
                        >
                          <span className="size-1.5 rounded-full" style={{ background: costColor(c) }} />
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid max-h-[400px] grid-cols-[repeat(auto-fill,minmax(54px,1fr))] gap-x-0.5 gap-y-1 overflow-y-auto pr-1 scroll-thin">
                    {pool.map((c) => (
                      <PoolChampion key={c.id} champion={c} onAdd={(k) => place(k, null)} onBoard={onBoard.has(c.key)} />
                    ))}
                    {!pool.length && <div className="col-span-full py-8 text-center text-sm text-fog">No champions match.</div>}
                  </div>
                </section>
              </PoolDropZone>

              {/* Items */}
              <section className="surface flex h-full flex-col rounded-xl p-4 sm:p-5" aria-label="Items">
                <div
                  role="tablist"
                  aria-label="Item type"
                  className="flex flex-wrap justify-between gap-x-3 border-b hairline sm:justify-start sm:gap-x-6 lg:justify-between lg:gap-x-3"
                >
                  {itemTabs.map((t) => {
                    const on = t.id === itemTab;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setItemTab(t.id)}
                        className={cn(
                          'relative h-12 shrink-0 pb-3 text-[13px] font-medium transition-colors',
                          on ? 'text-moon' : 'text-lichen hover:text-moon',
                        )}
                      >
                        {t.label}
                        {on && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-wisp" />}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex max-h-[400px] flex-wrap content-start gap-1 overflow-y-auto pr-1 scroll-thin">
                  {paletteItems.map((i, n) => (
                    <Fragment key={i.id}>
                      {n > 0 && paletteItems[n - 1].category !== i.category && (
                        <span className="my-1.5 basis-full border-t hairline" aria-hidden />
                      )}
                      <PaletteItem itemKey={i.key} onPick={pickItem} />
                    </Fragment>
                  ))}
                </div>
                <p className="mt-auto pt-3 text-[11px] text-fog">Drag onto a champion, or select one on the board and click.</p>
              </section>
            </div>
          </div>

          <aside className="min-w-0 space-y-5">
            {/* Selected unit */}
            <section className="surface rounded-xl p-4 sm:p-5" aria-label="Selected champion">
              {selectedUnit && selectedChampion && selected !== null ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-[12px] p-[2px]" style={{ background: costColor(selectedChampion.cost) }}>
                      <GameImage src={selectedChampion.icon} alt={selectedChampion.name} className="size-12 rounded-[10px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/units/${selectedChampion.slug}`}
                        className="block truncate text-lg font-semibold hover:text-wisp"
                      >
                        {selectedChampion.name}
                      </Link>
                      <div className="text-xs text-lichen">
                        {selectedChampion.traits
                          .map((t) => index.trait(t)?.name)
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      aria-label="Close"
                      className="grid size-8 place-items-center rounded-lg text-lichen hover:bg-white/5"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setBoard((b) => ({ ...b, [selected]: { ...selectedUnit, star: s } }))}
                        className={cn(
                          'h-9 flex-1 rounded-xl border text-sm',
                          selectedUnit.star === s
                            ? 'border-firefly/60 bg-firefly/10 text-firefly'
                            : 'border-line-strong text-lichen hover:text-moon',
                        )}
                      >
                        {'★'.repeat(s)}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-lichen">
                      Items ({selectedUnit.items.length}/{MAX_ITEMS})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedUnit.items.map((it, i) => {
                        const item = index.item(it);
                        return (
                          <button
                            key={`${it}-${i}`}
                            type="button"
                            onClick={() =>
                              setBoard((b) => ({
                                ...b,
                                [selected]: { ...selectedUnit, items: selectedUnit.items.filter((_, j) => j !== i) },
                              }))
                            }
                            className="group flex items-center gap-2 rounded-xl border border-line-strong py-1 pl-1 pr-2 text-xs hover:border-bloom/40"
                            title="Remove item"
                          >
                            <GameImage src={item?.icon} alt={item?.name ?? it} className="size-7 rounded-md" />
                            <span className="max-w-[8rem] truncate">{item?.name ?? it}</span>
                            <X className="size-3 text-fog group-hover:text-bloom" />
                          </button>
                        );
                      })}
                      {!selectedUnit.items.length && <span className="text-xs text-fog">Drag or click items to equip.</span>}
                    </div>
                  </div>
                  {selectedChampion.ability.name && (
                    <div className="rounded-xl bg-night/60 p-3 text-xs text-lichen">
                      <div className="mb-1 font-semibold text-moon">{selectedChampion.ability.name}</div>
                      <RichText value={selectedChampion.ability.desc.slice(0, 40)} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(selected)}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-bloom/30 text-sm font-medium text-bloom hover:bg-bloom/10"
                  >
                    <Trash2 className="size-4" />
                    Remove from board
                  </button>
                </div>
              ) : (
                <div className="text-sm text-lichen">
                  <div className="text-[15px] font-semibold text-moon">No champion selected</div>
                  <p className="mt-1">Click a champion on the board to change stars, items or remove it.</p>
                </div>
              )}
            </section>

            {/* Traits */}
            <section className="surface rounded-xl p-4 sm:p-5" aria-label="Traits">
              <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Synergies</h2>
              {traits.length ? (
                <ul className="space-y-0.5">
                  {active.map((t) => (
                    <TraitRow key={t.trait.id} t={t} />
                  ))}
                  {inactive.length > 0 && active.length > 0 && <li className="my-2 border-t hairline" aria-hidden />}
                  {inactive.map((t) => (
                    <TraitRow key={t.trait.id} t={t} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fog">Traits appear as you add champions.</p>
              )}
            </section>

            {/* Saved */}
            <section className="surface rounded-xl p-4 sm:p-5" aria-label="Saved boards">
              <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Saved boards</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveBoard();
                }}
                className="flex gap-2"
              >
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Name this board"
                  aria-label="Board name"
                  maxLength={40}
                  className="h-9 min-w-0 flex-1 rounded-xl border border-line-strong bg-night/60 px-3 text-sm text-moon outline-none placeholder:text-fog focus:border-wisp/50"
                />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-wisp px-3 text-[13px] font-semibold text-[#1b1306] hover:bg-[#ecc57c]"
                >
                  <Save className="size-4" />
                  Save
                </button>
              </form>
              <ul className="mt-3 space-y-1">
                {saved.map((s) => (
                  <li key={s.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
                    <button type="button" onClick={() => load(s)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="text-[11px] text-fog">{new Date(s.savedAt).toLocaleDateString()}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => persistSaved(saved.filter((x) => x.id !== s.id))}
                      aria-label={`Delete ${s.name}`}
                      className="grid size-7 place-items-center rounded-lg text-fog opacity-0 transition hover:text-bloom group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
                {!saved.length && <li className="text-xs text-fog">Saved boards stay in this browser.</li>}
              </ul>
            </section>
          </aside>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragChampion ? (
          <div className="relative" style={{ '--hex': '64px', width: 64, height: 64 * HEX_H } as CSSProperties}>
            <UnitFace
              champion={dragChampion}
              star={dragging?.type === 'unit' ? (board[dragging.hex]?.star ?? 1) : 1}
              items={dragging?.type === 'unit' ? (board[dragging.hex]?.items ?? []) : []}
              lifted
            />
          </div>
        ) : dragItem ? (
          <GameImage src={dragItem.icon} alt={dragItem.name} className="size-11 rounded-lg shadow-2xl ring-2 ring-wisp/60" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
