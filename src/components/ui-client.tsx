'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RefreshCw } from '@/components/icons';
import { bannerArt } from '@/components/art';
import { openCard } from '@/components/game/hover';
import { floatingSize, placeFloating } from '@/lib/floating';
import { cn, safeDecode } from '@/lib/utils';

/** The first element Tab would reach inside a container (links left out, as dialogs do). */
function firstTabbable(container: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      const el = node as HTMLInputElement;
      if (el.disabled || el.hidden || (el.tagName === 'INPUT' && el.type === 'hidden') || el.tagName === 'A') return NodeFilter.FILTER_SKIP;
      return el.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  return walker.nextNode() as HTMLElement | null;
}

// A panel under an anchor (above when only that fits), following it. Opening focuses its first control; Escape, a press
// outside or focus moving away closes it, and focus returns to the anchor unless the user moved on elsewhere.
export function Popover({
  open,
  onOpenChange,
  anchor,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const close = useRef(onOpenChange);
  close.current = onOpenChange;
  const placed = pos !== null;

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      if (!anchor.current || !box.current) return;
      const { top, left } = placeFloating(anchor.current.getBoundingClientRect(), floatingSize(box.current), 'bottom', 'start');
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
    };
    place();
    const ro = new ResizeObserver(place);
    if (box.current) ro.observe(box.current);
    if (anchor.current) ro.observe(anchor.current);
    // The page changing around the anchor (a chip growing, rows above it) moves it.
    const mo = new MutationObserver(place);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    const ctl = new AbortController();
    window.addEventListener('scroll', place, { capture: true, signal: ctl.signal });
    window.addEventListener('resize', place, { signal: ctl.signal });
    return () => {
      ro.disconnect();
      mo.disconnect();
      ctl.abort();
    };
  }, [open, anchor]);

  // Once it is in place (and so focusable), move focus in.
  useEffect(() => {
    const b = box.current;
    if (!open || !placed || !b || b.contains(document.activeElement)) return;
    const first = firstTabbable(b) ?? b;
    first.focus({ preventScroll: true });
    if (first instanceof HTMLInputElement) first.select();
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    let movedOn = false;
    // A hover card opened from an icon in the panel counts as part of the panel.
    const inPanelCard = (t: Node) => Boolean(openCard.card?.contains(t) && openCard.anchor && box.current?.contains(openCard.anchor));
    const outside = (t: EventTarget | null) => t instanceof Node && !box.current?.contains(t) && !anchor.current?.contains(t) && !inPanelCard(t);
    const leave = (e: Event) => {
      if (!outside(e.target)) return;
      movedOn = true;
      close.current(false);
    };
    const key = (e: KeyboardEvent) => {
      // Not when an open hover card above the panel took it.
      if (e.key === 'Escape' && !e.defaultPrevented) close.current(false);
    };
    const ctl = new AbortController();
    document.addEventListener('pointerdown', leave, { signal: ctl.signal });
    document.addEventListener('focusin', leave, { signal: ctl.signal });
    document.addEventListener('keydown', key, { signal: ctl.signal });
    return () => {
      ctl.abort();
      const active = document.activeElement;
      if (!movedOn && (!active || active === document.body)) anchor.current?.focus({ preventScroll: true });
    };
  }, [open, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={box}
      role="dialog"
      tabIndex={-1}
      className={cn(
        'fixed z-50 animate-rise rounded-xl border border-line-strong bg-canopy p-4 text-sm shadow-[0_30px_80px_-24px_rgb(0_0_0/0.9)] outline-none',
        wide ? 'w-[min(520px,calc(100vw-24px))]' : 'w-[min(420px,calc(100vw-24px))]',
      )}
      // Measured off screen first (not hidden: controls inside must be focusable at once).
      style={pos ?? { top: -10000, left: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Collapsed <details> section that opens itself when the #hash points inside it (e.g. /guides#set-mechanics). */
export function Expandable({ id, title, hint, children }: { id?: string; title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openForHash = () => {
      const el = ref.current;
      const hash = window.location.hash.slice(1);
      // A malformed hash (/guides#%) would otherwise throw and take the page down.
      const target = el && hash ? document.getElementById(safeDecode(hash)) : null;
      if (el && target && (target === el || el.contains(target))) {
        el.open = true;
        requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
      }
    };
    openForHash();
    window.addEventListener('hashchange', openForHash);
    return () => window.removeEventListener('hashchange', openForHash);
  }, []);
  return (
    <details ref={ref} id={id} className="group scroll-mt-28 rounded-xl border border-line bg-night/90">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-display text-[1.35rem] leading-tight text-moon">{title}</span>
          {hint && <span className="mt-1 block text-sm text-lichen">{hint}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-fog transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-10 border-t border-line px-5 py-6 sm:px-6">{children}</div>
    </details>
  );
}

export function useEdgeFade(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    // The current item (aria-current) starts centred.
    const current = box.querySelector<HTMLElement>('[aria-current]');
    if (current && box.scrollWidth > box.clientWidth) {
      const a = current.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      box.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
    }
    const update = () => setEdge({ left: box.scrollLeft > 4, right: box.scrollLeft + box.clientWidth < box.scrollWidth - 4 });
    update();
    box.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => {
      box.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, deps);
  return edge;
}

export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const edge = useEdgeFade(ref);
  const mask =
    edge.left && edge.right
      ? '[mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)]'
      : edge.right
        ? '[mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]'
        : edge.left
          ? '[mask-image:linear-gradient(to_right,transparent,black_48px)]'
          : '';
  return (
    <div ref={ref} className={cn('overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', mask, className)}>
      {children}
    </div>
  );
}

/** A banner picture that falls back to the next source when one fails, including failures before hydration. */
export function HeroArt({ sources, className }: { sources: string[]; className?: string }) {
  const key = sources.join('|');
  // Counted per list of sources, so another page's sources start at the first at once.
  const [failed, setFailed] = useState({ key, n: 0 });
  const i = failed.key === key ? failed.n : 0;
  const skip = () => setFailed((f) => ({ key, n: (f.key === key ? f.n : 0) + 1 }));
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) skip();
  }, [i, key]);
  const src = sources[i];
  if (!src) return null;
  // Usually the page's largest picture, at its top: fetched first.
  return <img ref={img} key={src} {...bannerArt(src)} alt="" aria-hidden fetchPriority="high" className={className} onError={skip} />;
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-canopy px-3 text-[13px] font-medium text-moon transition-colors hover:border-lichen/45"
    >
      <RefreshCw className={cn('size-4', pending && 'animate-spin')} aria-hidden />
      Refresh
    </button>
  );
}
