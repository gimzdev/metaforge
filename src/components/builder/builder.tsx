'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Eraser, FlaskConical, Info, Link2, Save, Search, Trash2, X } from '@/components/icons';
import { StarShapes, TraitHex } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { RichText } from '@/components/game/rich-text';
import { useStaticText } from '@/components/providers';
import { Select } from '@/components/ui';
import { COLS, MAX_ITEMS, ROWS, computeTraits, decodeBoard, encodeBoard, exclusiveConflict, firstFreeHex, isAvatar, slotsUsed, type ActiveTrait, type BuilderBoard } from '@/lib/builder';
import { costColor, currentIndex } from '@/lib/static';
import type { ChampionLite, ItemCategory } from '@/lib/static/types';
import { encodeFilters } from '@/lib/stats/filters';
import type { Filter } from '@/lib/stats/types';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'metaforge-builder-v2';
/** Solid so the buttons stay readable over the page artwork. */
const TOOL_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-canopy px-3 text-[13px] font-medium text-moon transition-colors disabled:pointer-events-none disabled:border-line disabled:text-fog';

const ITEM_TABS: Array<{ id: string; label: string; cats: ItemCategory[] }> = [
  { id: 'completed', label: 'Completed', cats: ['completed'] },
  { id: 'emblem', label: 'Emblems', cats: ['emblem'] },
  { id: 'artifact', label: 'Artifacts', cats: ['artifact'] },
  { id: 'radiant', label: 'Radiant', cats: ['radiant'] },
  { id: 'other', label: 'Other', cats: ['component', 'support'] },
];

interface SavedBoard { id: string; name: string; code: string; savedAt: number }
interface Persisted { current?: string; level?: number | null; saved?: SavedBoard[] }

function readStorage(): Persisted {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    // A hand edit or another format reads as nothing stored instead of breaking the page.
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Persisted) : {};
  } catch {
    return {};
  }
}

/** Drops malformed saved entries (a null would crash the list). */
function isSaved(s: unknown): s is SavedBoard {
  const b = s as Partial<SavedBoard> | null;
  return Boolean(b) && typeof b!.id === 'string' && typeof b!.name === 'string' && typeof b!.code === 'string' && Number.isFinite(b!.savedAt);
}

function writeStorage(value: Persisted) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode): the URL still holds the board */
  }
}

type DragData = { type: 'pool'; key: string } | { type: 'unit'; hex: number } | { type: 'item'; key: string };
/** `over` is a data-drop value: "hex:<n>", "pool" or "trash". left/top: the ghost's position when the target last changed. */
interface Drag { data: DragData; left: number; top: number; over: string | null }

/** The drop target under the pointer whose corners are nearest on average (the closer hex wins where hex boxes overlap). */
function dropAt(x: number, y: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const el of document.querySelectorAll<HTMLElement>('[data-drop]')) {
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const sum = Math.hypot(x - r.left, y - r.top) + Math.hypot(x - r.right, y - r.top) + Math.hypot(x - r.left, y - r.bottom) + Math.hypot(x - r.right, y - r.bottom);
    const d = Number((sum / 4).toFixed(4));
    if (d < bestDistance) [best, bestDistance] = [el, d];
  }
  return best;
}

/** Scrollable boxes around an element (not the element itself), nearest first, ending with the page; none past a fixed box. */
function scrollParents(el: Element): Element[] {
  const out: Element[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const style = getComputedStyle(n);
    if (n !== el && /(auto|scroll|overlay)/.test(style.overflow + style.overflowX + style.overflowY)) out.push(n);
    if (style.position === 'fixed') return out;
  }
  const page = document.scrollingElement;
  if (page && !out.includes(page)) out.push(page);
  return out;
}

/**
 * Edge auto-scroll while dragging: the boxes around the target under the pointer (else the source), outermost first; up to
 * 10px per 5ms within the outer 20% of a box, and only in a direction the pointer has moved in during this drag.
 */
function autoScroller(source: Element, x0: number, y0: number) {
  const intent = { up: false, down: false, left: false, right: false };
  let pointer = { x: x0, y: y0 };
  let node: Element | null = null;
  let boxes: Element[] = [];
  let timer = 0;
  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };
  const check = () => {
    stop();
    const { x, y } = pointer;
    for (const box of [...boxes].reverse()) {
      const page = box === document.scrollingElement;
      const r = page ? { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth, width: window.innerWidth, height: window.innerHeight } : box.getBoundingClientRect();
      const maxY = box.scrollHeight - (page ? window.innerHeight : box.clientHeight);
      const maxX = box.scrollWidth - (page ? window.innerWidth : box.clientWidth);
      const th = { y: r.height * 0.2, x: r.width * 0.2 };
      let dy = 0;
      let dx = 0;
      if (box.scrollTop > 0 && y <= r.top + th.y) dy = intent.up ? -10 * Math.abs((r.top + th.y - y) / th.y) : 0;
      else if (box.scrollTop < maxY && y >= r.bottom - th.y) dy = intent.down ? 10 * Math.abs((r.bottom - th.y - y) / th.y) : 0;
      if (box.scrollLeft < maxX && x >= r.right - th.x) dx = intent.right ? 10 * Math.abs((r.right - th.x - x) / th.x) : 0;
      else if (box.scrollLeft > 0 && x <= r.left + th.x) dx = intent.left ? -10 * Math.abs((r.left + th.x - x) / th.x) : 0;
      if (dx || dy) {
        timer = window.setInterval(() => box.scrollBy(dx, dy), 5);
        return;
      }
    }
  };
  /** Follow the drop target under the pointer; true when that changed which boxes can scroll. */
  const retarget = (over: Element | null) => {
    const next = over ?? source;
    if (next === node) return false;
    const same = node !== null && boxes.length > 0 && next.parentNode === node.parentNode;
    node = next;
    if (same) return false;
    boxes = scrollParents(next);
    return true;
  };
  return {
    move(x: number, y: number, over: Element | null) {
      if (y < pointer.y) intent.up = true;
      if (y > pointer.y) intent.down = true;
      if (x < pointer.x) intent.left = true;
      if (x > pointer.x) intent.right = true;
      const moved = x !== pointer.x || y !== pointer.y;
      pointer = { x, y };
      if (retarget(over) || moved) check();
    },
    scrolled(over: Element | null) {
      if (retarget(over)) check();
    },
    stop,
  };
}

/** Pointer drag and drop: starts after 6px of movement; Escape, a resize or leaving the tab cancels; the ending click is swallowed. */
function useDrag(onDrop: (from: DragData, to: string | null) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  // Moved directly on every pointer move; state (and a render of the whole builder) changes only with the drop target.
  const ghost = useRef<HTMLDivElement>(null);
  const latest = useRef('');
  // A render writes the position the state was given, which can be a move behind by then: put the latest back before paint.
  useLayoutEffect(() => {
    if (ghost.current && latest.current) ghost.current.style.transform = latest.current;
  });

  const start = useCallback(
    (data: DragData) => (e: ReactPointerEvent<HTMLElement>) => {
      if (!e.isPrimary || e.button !== 0) return;
      const id = e.pointerId;
      const source = e.currentTarget;
      const rect = source.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let x = x0;
      let y = y0;
      let active = false;
      let scroller: ReturnType<typeof autoScroller> | null = null;
      const show = (over = dropAt(x, y)) => {
        const left = rect.left + x - x0;
        const top = rect.top + y - y0;
        const target = over?.dataset.drop ?? null;
        latest.current = `translate3d(${left}px, ${top}px, 0)`;
        if (ghost.current) ghost.current.style.transform = latest.current;
        setDrag((d) => (d?.data === data && d.over === target ? d : { data, left, top, over: target }));
      };
      const prevent = (ev: Event) => ev.preventDefault();
      const swallow = (ev: Event) => ev.stopPropagation();
      const unselect = () => document.getSelection()?.removeAllRanges();
      const begin = () => {
        active = true;
        document.addEventListener('click', swallow, true);
        unselect();
        document.addEventListener('selectionchange', unselect);
        scroller = autoScroller(source, x0, y0);
        show();
      };
      const stop = () => {
        scroller?.stop();
        for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
        // The click that follows pointerup comes next: stop swallowing a moment later.
        window.setTimeout(() => {
          document.removeEventListener('click', swallow, true);
          document.removeEventListener('selectionchange', unselect);
        }, 50);
      };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        x = ev.clientX;
        y = ev.clientY;
        if (!active) {
          if (Math.hypot(x - x0, y - y0) > 6) begin();
          return;
        }
        if (ev.cancelable) ev.preventDefault();
        const over = dropAt(x, y);
        scroller?.move(x, y, over);
        show(over);
      };
      const scrolled = () => {
        if (!active) return;
        const over = dropAt(x, y);
        scroller?.scrolled(over);
        show(over);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        stop();
        if (!active) return;
        setDrag(null);
        drop.current(data, dropAt(x, y)?.dataset.drop ?? null);
      };
      const cancel = () => {
        stop();
        if (active) setDrag(null);
      };
      const key = (ev: KeyboardEvent) => ev.key === 'Escape' && cancel();
      const listeners = [
        [window, 'pointermove', move, { passive: false }],
        [window, 'pointerup', up],
        [window, 'pointercancel', cancel],
        [window, 'resize', cancel],
        [window, 'dragstart', prevent],
        [window, 'contextmenu', prevent],
        [window, 'scroll', scrolled, true],
        [document, 'visibilitychange', cancel],
        [document, 'keydown', key],
      ] as Array<[EventTarget, string, EventListener, (boolean | AddEventListenerOptions)?]>;
      for (const [target, type, fn, opts] of listeners) target.addEventListener(type, fn, opts);
    },
    [],
  );
  return { drag, start, ghost };
}

const same = (a: DragData | undefined, b: DragData) =>
  Boolean(a && a.type === b.type && (a.type === 'unit' ? a.hex === (b as { hex: number }).hex : (a as { key: string }).key === (b as { key: string }).key));

const HEX_H = 1.1547;

/** In multiples of the hex width (--hex). Rows sit wider than a tight honeycomb so one row's items end where the next row's stars begin. */
const GEOMETRY = {
  '--gx': 0.24, // gap between hexes in a row
  '--pitch': 1.075, // distance from one row to the next (a tight honeycomb is about 0.93)
  '--star': 0.24, // star size
  '--star-y': 0, // star row top, below the hex's top point
  '--item': 0.28, // item icon size
  '--item-y': 0.1, // item strip bottom, above the hex's bottom point
} as const;

function UnitFace({ champion, star, items, lifted, selected }: { champion: ChampionLite; star: number; items: string[]; lifted?: boolean; selected?: boolean }) {
  const index = currentIndex();
  return (
    <span className={cn('absolute inset-0 block', lifted && 'scale-110')}>
      {selected && <span className="hex-tall absolute -inset-[4px] bg-wisp" aria-hidden />}
      <span className="hex-tall absolute inset-0" style={{ background: costColor(champion.cost) }} />
      <span className="hex-tall absolute inset-[3px] overflow-hidden bg-bark">
        <GameImage src={champion.tile ?? champion.icon} alt={champion.name} className="h-full w-full" imgClassName="scale-[1.12]" />
      </span>
      {star >= 2 && (
        <StarShapes
          star={star}
          className="absolute inset-x-0 z-10"
          style={{ '--s': 'calc(var(--hex) * var(--star, 0.24))', top: 'calc(var(--hex) * var(--star-y, 0))' } as CSSProperties}
        />
      )}
      {items.length > 0 && (
        <span
          className="absolute left-1/2 z-20 flex -translate-x-1/2 gap-px rounded-[4px] bg-night/90 p-px shadow-[0_2px_6px_rgb(0_0_0/0.6)]"
          style={{ bottom: 'calc(var(--hex) * var(--item-y, 0.03))' }}
        >
          {items.map((it, i) => {
            const item = index.item(it);
            return (
              <GameImage
                key={`${it}-${i}`}
                src={item?.icon}
                alt={item?.name ?? it}
                className="rounded-[3px]"
                style={{ width: 'calc(var(--hex) * var(--item, 0.22))', height: 'calc(var(--hex) * var(--item, 0.22))' }}
              />
            );
          })}
        </span>
      )}
    </span>
  );
}

function HexCell({ hex, board, selected, onSelect, moving, onMove, drag, start }: {
  hex: number;
  board: BuilderBoard;
  selected: number | null;
  onSelect: (hex: number) => void;
  /** The selected champion's name: empty hexes then move it there when pressed. */
  moving: string | null;
  onMove: (hex: number) => void;
  drag: Drag | null;
  start: ReturnType<typeof useDrag>['start'];
}) {
  const unit = board[hex];
  const champion = unit ? currentIndex().champion(unit.key) : undefined;
  const isOver = drag?.over === `hex:${hex}`;
  // Row 1 is the front line.
  const place = `row ${Math.floor(hex / COLS) + 1}, hex ${(hex % COLS) + 1}`;
  return (
    <div data-drop={`hex:${hex}`} data-hex={hex} className="relative" style={{ width: 'var(--hex)', height: `calc(var(--hex) * ${HEX_H})` }}>
      <span className={cn('hex-tall absolute inset-0 transition-colors', isOver ? 'bg-wisp/70' : 'bg-lichen/[0.14]')} />
      <span className={cn('hex-tall absolute inset-[2px] transition-colors', isOver ? 'bg-wisp/15' : 'bg-canopy')} />
      {unit && champion ? (
        <button
          type="button"
          onPointerDown={start({ type: 'unit', hex })}
          onClick={() => onSelect(hex)}
          title={`${champion.name}${unit.items.length ? ` with ${unit.items.length} item${unit.items.length > 1 ? 's' : ''}` : ''}`}
          aria-label={`${champion.name}, ${unit.star} star, ${place}. Select to edit`}
          aria-pressed={selected === hex}
          className={cn('group/hex absolute inset-0 touch-none outline-none', same(drag?.data, { type: 'unit', hex }) && 'opacity-25')}
        >
          {/* Keyboard focus as a ring in the hex's own shape (an outline would draw a square around it). */}
          <span className="hex-tall absolute -inset-[4px] hidden bg-moon/70 group-focus-visible/hex:block" aria-hidden />
          <UnitFace champion={champion} star={unit.star} items={unit.items} selected={selected === hex} />
        </button>
      ) : (
        moving && (
          // With a champion selected, an empty hex moves it there: the click and keyboard way to reposition one.
          <button
            type="button"
            onClick={() => onMove(hex)}
            title={`Move ${moving} here`}
            aria-label={`Move ${moving} to ${place}`}
            className="hex-tall absolute inset-[2px] outline-none transition-colors hover:bg-wisp/15 focus-visible:bg-wisp/30"
          />
        )
      )}
    </div>
  );
}

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

export function BuilderApp({ initialCode }: { initialCode: string | null }) {
  const index = currentIndex();
  const text = useStaticText();
  const initial = useMemo(() => decodeBoard(initialCode, index), [initialCode, index]);
  const [board, setBoard] = useState<BuilderBoard>(initial.board);
  const [level, setLevel] = useState<number | null>(initial.level);
  const [selected, setSelected] = useState<number | null>(null);
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

  // Saved boards, and the last board when the URL carries none.
  useEffect(() => {
    const stored = readStorage();
    setSaved(Array.isArray(stored.saved) ? stored.saved.filter(isSaved).slice(0, 30) : []);
    if (!initialCode && stored.current && typeof stored.current === 'string') {
      const restored = decodeBoard(stored.current, index);
      setBoard(restored.board);
      setLevel(Number.isInteger(stored.level) ? stored.level! : restored.level);
    }
    hydrated.current = true;
  }, [initialCode, index]);

  const code = useMemo(() => encodeBoard(board, level ?? undefined), [board, level]);
  const empty = Object.keys(board).length === 0;

  const load = (c: string) => {
    const next = decodeBoard(c, index);
    setBoard(next.board);
    setLevel(next.level);
    setSelected(null);
  };
  const searchParams = useSearchParams();
  /** The ?b= value this builder last put in the address ('' for none), so its own updates are recognized below. */
  const written = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated.current) return;
    written.current = empty ? '' : code;
    const url = empty ? window.location.pathname : `${window.location.pathname}?b=${code}`;
    // No state object: Next ignores a call that passes its own history state, and its address would go stale.
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url);
    writeStorage({ ...readStorage(), current: empty ? undefined : code, level });
  }, [code, empty, level]);

  // Back/Forward and links to a shared board change ?b= without remounting the builder: that board is loaded. A link
  // to the plain builder keeps the board on screen (as a fresh visit restores it) and puts its code back in the address.
  useEffect(() => {
    if (written.current === null) return;
    const b = searchParams.get('b') ?? '';
    if (b === written.current) return;
    if (b && b.length < 4000) load(b);
    else if (written.current) {
      window.history.replaceState(null, '', `${window.location.pathname}?b=${written.current}`);
    }
  }, [searchParams, index]);

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

  const place = (key: string, hex: number | null) => {
    const champion = index.champion(key);
    if (!champion) return;
    const conflict = exclusiveConflict(board, key, index, hex ?? undefined);
    if (conflict) return flash(`Only one Avatar can be fielded. Remove ${conflict} first.`);
    const target = hex ?? firstFreeHex(board, champion.row);
    if (target === null) return flash('The board is full.');
    setBoard((b) => ({ ...b, [target]: { key: champion.key, star: 1, items: [] } }));
    setSelected(target);
  };

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

  // Pressing an empty hex moves the selected champion there (drag and drop without dragging).
  const refocus = useRef<number | null>(null);
  const moveSelected = (to: number) => {
    if (selected === null) return;
    move(selected, to);
    refocus.current = to;
  };
  // The pressed hex's button is gone after the move: focus the moved unit unless focus went elsewhere (else it resets to the page top).
  useEffect(() => {
    const hex = refocus.current;
    refocus.current = null;
    if (hex === null || (document.activeElement && document.activeElement !== document.body)) return;
    document.querySelector<HTMLElement>(`[data-hex="${hex}"] button`)?.focus({ preventScroll: true });
  });

  const equip = (hex: number, itemKey: string) => {
    const unit = board[hex];
    const item = index.item(itemKey);
    const champion = unit ? index.champion(unit.key) : undefined;
    if (!unit || !item || !champion) return;
    if (unit.items.length >= MAX_ITEMS) return flash(`${champion.name} already holds ${MAX_ITEMS} items.`);
    if (item.unique && unit.items.includes(item.key)) return flash(`${item.name} is unique: one per champion.`);
    if (item.traits.length && item.traits.every((t) => champion.traits.includes(t))) return flash(`${champion.name} already has that trait.`);
    setBoard((b) => ({ ...b, [hex]: { ...unit, items: [...unit.items, item.key] } }));
  };

  const pickItem = (itemKey: string) => {
    if (selected === null || !board[selected]) return flash('Select a champion on the board first, or drag the item onto one.');
    equip(selected, itemKey);
  };

  const { drag, start, ghost } = useDrag((from, to) => {
    if (!to) return;
    if (from.type === 'unit' && (to === 'pool' || to === 'trash')) return remove(from.hex);
    if (!to.startsWith('hex:')) return;
    const hex = Number(to.slice(4));
    if (from.type === 'pool') return place(from.key, hex);
    if (from.type === 'unit') return move(from.hex, hex);
    if (!board[hex]) return flash('Drop items onto a champion.');
    equip(hex, from.key);
    setSelected(hex);
  });

  const needle = q.trim().toLowerCase();
  const pool = useMemo(
    () =>
      index.data.champions.filter(
        (c) => (cost === null || Math.min(c.cost, 6) === cost) && (!traitFilter || c.traits.includes(traitFilter)) && (!needle || c.name.toLowerCase().includes(needle)),
      ),
    [index, cost, traitFilter, needle],
  );
  const traitOptions = useMemo(() => [...index.data.traits].sort((a, b) => a.name.localeCompare(b.name)), [index]);
  const itemTabs = useMemo(() => ITEM_TABS.filter((t) => index.data.items.some((i) => t.cats.includes(i.category))), [index]);
  const paletteItems = useMemo(() => {
    const cats = (itemTabs.find((t) => t.id === itemTab) ?? itemTabs[0])?.cats ?? [];
    return index.data.items
      .filter((i) => cats.includes(i.category))
      .sort((a, b) => cats.indexOf(a.category) - cats.indexOf(b.category) || a.name.localeCompare(b.name));
  }, [index, itemTabs, itemTab]);

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
  const explorerHref = useMemo(() => {
    const filters: Filter[] = [];
    for (const u of Object.values(board)) if (u.items.length >= 2 && filters.length < 2) filters.push({ k: 'unit', id: u.key });
    for (const t of traits) {
      if (filters.length >= 4) break;
      if (t.tier > 0 && t.trait.kind !== 'unique' && t.trait.effects.length > 1) filters.push({ k: 'trait', id: t.trait.key, min: t.tier });
    }
    return filters.length ? `/explorer?f=${encodeFilters(filters)}` : null;
  }, [board, traits]);

  const selectedUnit = selected !== null ? board[selected] : undefined;
  const selectedChampion = selectedUnit ? index.champion(selectedUnit.key) : undefined;
  const ability = selectedChampion ? text?.abilities[selectedChampion.key] : undefined;
  const active = traits.filter((t) => t.tier > 0);
  const inactive = traits.filter((t) => t.tier === 0);
  const dragging = drag?.data;
  const dragUnit = dragging?.type === 'unit' ? board[dragging.hex] : undefined;
  const dragChampion = dragging?.type === 'pool' ? index.champion(dragging.key) : dragUnit && index.champion(dragUnit.key);
  const dragItem = dragging?.type === 'item' ? index.item(dragging.key) : undefined;
  const unitDrag = dragging?.type === 'unit';

  // Seven hexes and six gaps per row, plus half a hex of offset on odd rows (fits phones down to 320px).
  const boardStyle = { ...GEOMETRY, '--hex': 'clamp(26px, calc((100cqw - 8px) / (8 + 7 * var(--gx))), 84px)' } as CSSProperties;

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <section className="surface relative rounded-xl p-4 sm:p-6" aria-label="Board">
              <h1 className="sr-only">Team builder</h1>
              <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className={cn('num font-semibold', slots > teamSize ? 'text-bloom' : 'text-moon')}>
                  {level === null ? `${slots} ${slots === 1 ? 'unit' : 'units'}` : `${slots} / ${level} units`}
                </span>
                <span className="num text-lichen">{boardValue} gold of champions</span>
                <span className="text-lichen">{active.length} active traits</span>
                {slots > teamSize && <span className="text-xs text-bloom">More units than your level allows</span>}
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <Select label="Player level" value={level === null ? 'auto' : String(level)} onChange={(e) => setLevel(e.target.value === 'auto' ? null : Number(e.target.value))}>
                    <option value="auto">Level: auto</option>
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((l) => (
                      <option key={l} value={l}>Level {l}</option>
                    ))}
                  </Select>
                  <button type="button" onClick={share} disabled={empty} className={cn(TOOL_BUTTON, 'hover:border-lichen/45 hover:text-moon')}>
                    {copied ? <Check className="size-4 text-wisp" /> : <Link2 className="size-4" />}
                    {copied ? 'Copied' : 'Share'}
                  </button>
                  {explorerHref && (
                    <Link href={explorerHref} className={cn(TOOL_BUTTON, 'hover:border-lichen/45 hover:text-moon')}>
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
              <div className="@container">
                <div className="relative mx-auto w-fit py-2" style={{ ...boardStyle, paddingLeft: 'calc(var(--hex) * ((1 + var(--gx)) / 2))' }}>
                  {Array.from({ length: ROWS }, (_, row) => (
                    <div
                      key={row}
                      className="flex"
                      style={{
                        gap: 'calc(var(--hex) * var(--gx))',
                        marginLeft: row % 2 === 1 ? 'calc(var(--hex) * (1 + var(--gx)) / 2)' : 0,
                        marginTop: row === 0 ? 0 : `calc(var(--hex) * (var(--pitch) - ${HEX_H}))`,
                      }}
                    >
                      {Array.from({ length: COLS }, (_, col) => (
                        <HexCell
                          key={row * COLS + col}
                          hex={row * COLS + col}
                          board={board}
                          selected={selected}
                          onSelect={(h) => setSelected(h === selected ? null : h)}
                          moving={selectedChampion?.name ?? null}
                          onMove={moveSelected}
                          drag={drag}
                          start={start}
                        />
                      ))}
                    </div>
                  ))}
                  <div
                    data-drop="trash"
                    role="img"
                    aria-label="Drop a champion here to remove it"
                    title="Drop a champion here to remove it"
                    className={cn('absolute bottom-2 left-0 transition-opacity', unitDrag ? 'opacity-100' : 'opacity-60')}
                    style={{ width: 'var(--hex)', height: `calc(var(--hex) * ${HEX_H})` }}
                  >
                    <span className={cn('hex-tall absolute inset-0 transition-colors', drag?.over === 'trash' ? 'bg-bloom' : 'bg-bloom/50')} />
                    <span className={cn('hex-tall absolute inset-[2px] grid place-items-center transition-colors', drag?.over === 'trash' ? 'bg-bloom/50' : 'bg-[#2a1210]')}>
                      <Trash2 className={cn('size-[34%] transition-colors', drag?.over === 'trash' ? 'text-moon' : 'text-bloom')} aria-hidden />
                    </span>
                  </div>
                </div>
              </div>
              {empty && <p className="mt-4 text-center text-sm text-lichen">Click a champion below to add it, or drag it onto a hex. The front line is at the top.</p>}
              {/* The live region stays mounted (one that appears along with its text is often not read out). */}
              <div role="status">
                {notice && (
                  <div className="mx-auto mt-3 flex w-fit max-w-full items-center gap-2 rounded-xl border border-firefly/30 bg-night/95 px-4 py-2.5 text-sm text-moon shadow-lg">
                    <Info className="size-4 shrink-0 text-firefly" aria-hidden />
                    {notice}
                  </div>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              {/* Dropping a board unit on the pool removes it. */}
              <div data-drop="pool" className="relative">
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
                      {traitOptions.map((t) => (
                        <option key={t.key} value={t.key}>{t.name}</option>
                      ))}
                    </Select>
                    <div role="group" aria-label="Cost" className="flex h-9 items-center rounded-lg border border-line-strong bg-canopy p-0.5">
                      {[1, 2, 3, 4, 5].map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={cost === c}
                          title={`${c}-cost`}
                          aria-label={`${c}-cost`}
                          onClick={() => setCost(cost === c ? null : c)}
                          className={cn('flex h-full items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors', cost === c ? 'bg-bark text-moon' : 'text-lichen hover:text-moon')}
                        >
                          <span className="size-1.5 rounded-full" style={{ background: costColor(c) }} />
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid max-h-[400px] grid-cols-[repeat(auto-fill,minmax(54px,1fr))] gap-x-0.5 gap-y-1 overflow-y-auto pr-1 scroll-thin">
                    {pool.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onPointerDown={start({ type: 'pool', key: c.key })}
                        onClick={() => place(c.key, null)}
                        title={onBoard.has(c.key) ? `Add ${c.name} (on the board)` : `Add ${c.name}`}
                        aria-label={onBoard.has(c.key) ? `Add ${c.name} (on the board)` : `Add ${c.name}`}
                        className={cn(
                          'group relative flex touch-none flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition hover:bg-white/[0.05]',
                          same(dragging, { type: 'pool', key: c.key }) && 'opacity-40',
                        )}
                      >
                        <span className={cn('block rounded-[9px] p-[2px] ring-offset-2 ring-offset-canopy', onBoard.has(c.key) && 'ring-2 ring-wisp')} style={{ background: costColor(c.cost) }}>
                          <GameImage src={c.icon} alt={c.name} px={44} className="size-11 rounded-[7px]" />
                        </span>
                        <span className="w-full truncate text-center text-[10px] leading-tight text-lichen group-hover:text-moon">{c.name}</span>
                      </button>
                    ))}
                    {!pool.length && <div className="col-span-full py-8 text-center text-sm text-fog">No champions match.</div>}
                  </div>
                </section>
                {unitDrag && (
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-0 grid place-items-center rounded-xl border-2 border-dashed text-sm transition-colors',
                      drag?.over === 'pool' ? 'border-bloom/70 bg-bloom/15 text-bloom' : 'border-line-strong bg-night/50 text-lichen',
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Trash2 className="size-4" aria-hidden />
                      Drop here to remove
                    </span>
                  </div>
                )}
              </div>

              <section className="surface flex h-full flex-col rounded-xl p-4 sm:p-5" aria-label="Items">
                <div role="tablist" aria-label="Item type" className="flex flex-wrap justify-between gap-x-3 border-b hairline sm:justify-start sm:gap-x-6 lg:justify-between lg:gap-x-3">
                  {itemTabs.map((t) => {
                    const on = t.id === itemTab;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setItemTab(t.id)}
                        className={cn('relative h-12 shrink-0 pb-3 text-[13px] font-medium transition-colors', on ? 'text-moon' : 'text-lichen hover:text-moon')}
                      >
                        {t.label}
                        {on && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-wisp" />}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex max-h-[400px] flex-wrap content-start gap-1 overflow-y-auto pr-1 scroll-thin">
                  {paletteItems.map((i, n) => (
                    <Fragment key={i.key}>
                      {n > 0 && paletteItems[n - 1].category !== i.category && <span className="my-1.5 basis-full border-t hairline" aria-hidden />}
                      <button
                        type="button"
                        onPointerDown={start({ type: 'item', key: i.key })}
                        onClick={() => pickItem(i.key)}
                        title={i.name}
                        className={cn('touch-none rounded-lg p-0.5 transition hover:bg-wisp/15', same(dragging, { type: 'item', key: i.key }) && 'opacity-40')}
                      >
                        <GameImage src={i.icon} alt={i.name} className="size-10 rounded-md" />
                      </button>
                    </Fragment>
                  ))}
                </div>
                <p className="mt-auto pt-3 text-[11px] text-fog">Drag onto a champion, or select one on the board and click.</p>
              </section>
            </div>
          </div>

          <aside className="min-w-0 space-y-5">
            <section className="surface rounded-xl p-4 sm:p-5" aria-label="Selected champion">
              {selectedUnit && selectedChampion && selected !== null ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-[12px] p-[2px]" style={{ background: costColor(selectedChampion.cost) }}>
                      <GameImage src={selectedChampion.icon} alt={selectedChampion.name} px={48} className="size-12 rounded-[10px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/units/${selectedChampion.slug}`} className="block truncate text-lg font-semibold hover:text-wisp">
                        {selectedChampion.name}
                      </Link>
                      <div className="text-xs text-lichen">
                        {selectedChampion.traits.map((t) => index.trait(t)?.name).filter(Boolean).join(', ')}
                      </div>
                    </div>
                    <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-lichen hover:bg-white/5">
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={selectedUnit.star === s}
                        aria-label={`${s} star`}
                        onClick={() => setBoard((b) => ({ ...b, [selected]: { ...selectedUnit, star: s } }))}
                        className={cn(
                          'h-9 flex-1 rounded-xl border text-sm',
                          selectedUnit.star === s ? 'border-firefly/60 bg-firefly/10 text-firefly' : 'border-line-strong text-lichen hover:text-moon',
                        )}
                      >
                        {'★'.repeat(s)}
                      </button>
                    ))}
                  </div>
                  {isAvatar(index, selectedUnit.key) && (
                    <Select
                      label={`Trait ${selectedChampion.name} plays as`}
                      value={selectedUnit.trait ?? ''}
                      onChange={(e) => setBoard((b) => ({ ...b, [selected]: { ...selectedUnit, trait: e.target.value || undefined } }))}
                      className="w-full [&>select]:w-full"
                    >
                      <option value="">Pick the trait she plays as</option>
                      {traitOptions.filter((t) => t.kind !== 'unique').map((t) => (
                        <option key={t.key} value={t.key}>{t.name} (counts twice)</option>
                      ))}
                    </Select>
                  )}
                  <div>
                    <div className="mb-2 text-xs text-lichen">Items ({selectedUnit.items.length}/{MAX_ITEMS})</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedUnit.items.map((it, i) => {
                        const item = index.item(it);
                        return (
                          <button
                            key={`${it}-${i}`}
                            type="button"
                            onClick={() => setBoard((b) => ({ ...b, [selected]: { ...selectedUnit, items: selectedUnit.items.filter((_, j) => j !== i) } }))}
                            className="group flex items-center gap-2 rounded-xl border border-line-strong py-1 pl-1 pr-2 text-xs hover:border-bloom/40"
                            title={`Remove ${item?.name ?? it}`}
                            aria-label={`Remove ${item?.name ?? it}`}
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
                  {ability?.name && (
                    <div className="rounded-xl bg-night/60 p-3 text-xs text-lichen">
                      <div className="mb-1 font-semibold text-moon">{ability.name}</div>
                      <RichText value={ability.desc.slice(0, 40)} />
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
                  <p className="text-[11px] text-fog">Click an empty hex to move {selectedChampion.name} there.</p>
                </div>
              ) : (
                <div className="text-sm text-lichen">
                  <div className="text-[15px] font-semibold text-moon">No champion selected</div>
                  <p className="mt-1">Click a champion on the board to change its stars and items, move it or remove it.</p>
                </div>
              )}
            </section>

            <section className="surface rounded-xl p-4 sm:p-5" aria-label="Traits">
              <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Synergies</h2>
              {traits.length ? (
                <ul className="space-y-0.5">
                  {active.map((t) => <TraitRow key={t.trait.key} t={t} />)}
                  {inactive.length > 0 && active.length > 0 && <li className="my-2 border-t hairline" aria-hidden />}
                  {inactive.map((t) => <TraitRow key={t.trait.key} t={t} />)}
                </ul>
              ) : (
                <p className="text-sm text-fog">Traits appear as you add champions.</p>
              )}
            </section>

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
                <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-wisp px-3 text-[13px] font-semibold text-[#1b1306] hover:bg-[#ecc57c]">
                  <Save className="size-4" />
                  Save
                </button>
              </form>
              <ul className="mt-3 space-y-1">
                {saved.map((s) => (
                  <li key={s.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
                    <button type="button" onClick={() => load(s.code)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="text-[11px] text-fog">{new Date(s.savedAt).toLocaleDateString()}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => persistSaved(saved.filter((x) => x.id !== s.id))}
                      aria-label={`Delete ${s.name}`}
                      // Revealed by hover or focus; always shown on touch screens, where it would be an invisible target.
                      className="grid size-7 place-items-center rounded-lg text-fog opacity-0 transition hover:text-bloom group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100"
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

      {drag && (dragChampion || dragItem) && (
        <div ref={ghost} className="pointer-events-none fixed left-0 top-0 z-[999]" style={{ transform: `translate3d(${drag.left}px, ${drag.top}px, 0)` }}>
          {dragChampion ? (
            <div className="relative" style={{ '--hex': '64px', width: 64, height: 64 * HEX_H } as CSSProperties}>
              <UnitFace champion={dragChampion} star={dragUnit?.star ?? 1} items={dragUnit?.items ?? []} lifted />
            </div>
          ) : (
            dragItem && <GameImage src={dragItem.icon} alt={dragItem.name} className="size-11 rounded-lg shadow-2xl ring-2 ring-wisp/60" />
          )}
        </div>
      )}
    </>
  );
}

