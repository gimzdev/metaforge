'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStaticText } from '@/components/providers';
import { floatingSize, placeFloating } from '@/lib/floating';
import { costColor, currentIndex, styleFor, traitKindLabel } from '@/lib/static';
import { ITEM_CATEGORY_LABEL } from '@/lib/static/types';
import { cn } from '@/lib/utils';
import { Portrait, TraitHex } from './entities';
import { GameImage } from './game-image';
import { RichText } from './rich-text';

/** One hover card per page, for icons with data-hover="u:key" | "i:key" | "t:key:tier" | "a:key"; touch never opens it. */
const OPEN_DELAY = 180;
const CLOSE_DELAY = 60;

/** The open card and its icon: a popover holding the icon counts a press in the card as inside itself. */
export const openCard: { anchor: HTMLElement | null; card: HTMLElement | null } = { anchor: null, card: null };

function Head({ icon, name, sub }: { icon: ReactNode; name: string; sub: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-tight">{name}</div>
        {sub}
      </div>
    </div>
  );
}

function Card({ spec }: { spec: string }) {
  const [kind, key, tierText] = spec.split(':');
  const index = currentIndex();
  const text = useStaticText();

  if (kind === 'u') {
    const champion = index.champion(key);
    if (!champion) return null;
    const ability = text?.abilities[champion.key];
    return (
      <div className="space-y-3">
        <Head
          icon={<Portrait champion={champion} px={48} />}
          name={champion.name}
          sub={<div className="mt-0.5 text-xs" style={{ color: costColor(champion.cost) }}>{champion.cost}-cost</div>}
        />
        <div className="flex flex-wrap gap-1.5">
          {champion.traits.map((t) => {
            const trait = index.trait(t);
            return trait ? (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/5 py-0.5 pl-0.5 pr-2 text-xs">
                <TraitHex trait={trait} style="inactive" px={18} />
                {trait.name}
              </span>
            ) : null;
          })}
        </div>
        {ability?.name && (
          <div className="text-[13px] text-lichen">
            <div className="mb-1 font-semibold text-moon">{ability.name}</div>
            <RichText value={ability.desc.slice(0, 60)} />
          </div>
        )}
      </div>
    );
  }

  if (kind === 'i') {
    const item = index.item(key);
    if (!item) return null;
    return (
      <div className="space-y-3">
        <Head
          icon={<GameImage src={item.icon} alt={item.name} className="size-11 rounded-lg" />}
          name={item.name}
          sub={<div className="mt-0.5 text-xs text-lichen">{ITEM_CATEGORY_LABEL[item.category]}</div>}
        />
        {item.composition.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-lichen">
            {item.composition.map((c, i) => {
              const part = index.item(c);
              return part ? (
                <span key={`${c}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-fog">+</span>}
                  <GameImage src={part.icon} alt={part.name} className="size-6 rounded" />
                </span>
              ) : null;
            })}
          </div>
        )}
        <div className="text-[13px] text-lichen">
          <RichText value={text?.items[item.key] ?? []} />
        </div>
      </div>
    );
  }

  if (kind === 't') {
    const trait = index.trait(key);
    if (!trait) return null;
    const tier = Number(tierText) || 0;
    const desc = text?.traits[trait.key];
    return (
      <div className="space-y-3">
        <Head
          icon={<TraitHex trait={trait} style={styleFor(trait, tier || trait.effects.length)} px={40} />}
          name={trait.name}
          sub={<div className="mt-0.5 text-xs capitalize text-lichen">{traitKindLabel(trait)}</div>}
        />
        {desc && desc.desc.length > 0 && (
          <div className="text-[13px] text-lichen">
            <RichText value={desc.desc.slice(0, 40)} />
          </div>
        )}
        {trait.effects.length > 0 && (
          <ul className="space-y-1">
            {trait.effects.map((e, i) => (
              <li key={e.minUnits} className={cn('flex gap-2 rounded-lg px-2 py-1 text-xs', tier === i + 1 ? 'bg-wisp/10 text-moon' : 'text-lichen')}>
                <span className="num w-5 shrink-0 font-semibold" style={{ color: `var(--color-style-${e.style})` }}>
                  {e.minUnits}
                </span>
                <span className="min-w-0">
                  <RichText value={(desc?.effects[i] ?? []).slice(0, 30)} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          {trait.champions.slice(0, 12).map((c) => {
            const champion = index.champion(c);
            return champion ? <Portrait key={c} champion={champion} px={24} /> : null;
          })}
        </div>
      </div>
    );
  }

  const aug = index.augment(key);
  if (!aug) return null;
  return (
    <div className="space-y-2">
      <div className="text-[15px] font-semibold">{aug.name}</div>
      <div className="text-xs capitalize text-lichen">{aug.tier} augment</div>
      <div className="text-[13px] text-lichen">
        <RichText value={text?.augments[aug.key] ?? []} />
      </div>
    </div>
  );
}

export function HoverCards() {
  const [open, setOpen] = useState<{ el: HTMLElement; spec: string; n: number } | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLElement | null>(null);
  const close = () => {
    current.current = null;
    setOpen(null);
  };

  useEffect(() => {
    // Leaving an icon (or its card) closes after CLOSE_DELAY; resting on another opens its card after OPEN_DELAY.
    let openTimer = 0;
    let closeTimer = 0;
    let opened = 0;
    let pending: HTMLElement | null = null;
    const triggerOf = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>('[data-hover]') : null);
    const inCard = (node: EventTarget | null) => node instanceof Node && Boolean(card.current?.contains(node));
    const inZone = (node: EventTarget | null) => inCard(node) || (node instanceof Node && Boolean(current.current?.contains(node)));
    const show = (el: HTMLElement) => {
      if (el === current.current) return window.clearTimeout(closeTimer);
      if (el === pending) return;
      window.clearTimeout(openTimer);
      pending = el;
      openTimer = window.setTimeout(() => {
        pending = null;
        current.current = el;
        setPos(null);
        setOpen({ el, spec: el.dataset.hover ?? '', n: ++opened });
      }, OPEN_DELAY);
    };
    const cancel = (el: HTMLElement) => {
      if (el !== pending) return;
      window.clearTimeout(openTimer);
      pending = null;
    };
    const hide = () => {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(close, CLOSE_DELAY);
    };
    // Only entering an icon opens its card, so moving inside one after a dismissal doesn't bring it back.
    let hovered: HTMLElement | null = null;
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = triggerOf(e.target);
      if (el && el !== hovered) {
        hovered = el;
        show(el);
      }
      if (inZone(e.target)) window.clearTimeout(closeTimer);
    };
    const out = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const to = e.relatedTarget;
      const from = triggerOf(e.target);
      if (from && !(to instanceof Node && from.contains(to))) {
        cancel(from);
        if (from === hovered) hovered = null;
      }
      if (current.current && inZone(e.target) && !inZone(to)) hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = triggerOf(e.target);
      if (el) show(el);
    };
    const focusOut = (e: FocusEvent) => {
      const el = triggerOf(e.target);
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      cancel(el);
      if (el === current.current) hide();
    };
    const dismiss = () => {
      window.clearTimeout(openTimer);
      pending = null;
      if (current.current) close();
    };
    const escape = (e: KeyboardEvent) => {
      // An open card is the top layer: Escape closes it, not a popover under it.
      if (e.key !== 'Escape' || !current.current) return;
      e.preventDefault();
      window.clearTimeout(closeTimer);
      close();
    };
    const press = (e: PointerEvent) => {
      if (!inCard(e.target)) dismiss();
    };
    // A click on the card counts as a click on whatever holds its icon (a table row, a comp link, a search hit).
    const click = (e: MouseEvent) => {
      const holder = current.current?.parentElement;
      if (!holder || !inCard(e.target)) return;
      const { detail, screenX, screenY, clientX, clientY, button, buttons, ctrlKey, shiftKey, altKey, metaKey } = e;
      const init = { detail, screenX, screenY, clientX, clientY, button, buttons, ctrlKey, shiftKey, altKey, metaKey };
      const copy = new MouseEvent('click', { ...init, bubbles: true, cancelable: true, view: window });
      // Page handlers run; the browser's own action (following a link) does not.
      const keep = (ev: Event) => ev === copy && ev.preventDefault();
      window.addEventListener('click', keep);
      holder.dispatchEvent(copy);
      window.removeEventListener('click', keep);
    };
    const ctl = new AbortController();
    const opts = { signal: ctl.signal };
    document.addEventListener('pointerover', over, opts);
    document.addEventListener('pointerout', out, opts);
    document.addEventListener('focusin', focusIn, opts);
    document.addEventListener('focusout', focusOut, opts);
    document.addEventListener('keydown', escape, opts);
    document.addEventListener('pointerdown', press, opts);
    document.addEventListener('click', click, opts);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      ctl.abort();
    };
  }, []);

  // A new page never keeps the last page's card.
  const path = usePathname();
  useEffect(close, [path]);

  // Above the icon (below when only that fits), kept 12px inside the window sideways; it follows the icon.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = card.current;
      if (!box) return;
      if (!open.el.isConnected) return close();
      const { top, left } = placeFloating(open.el.getBoundingClientRect(), floatingSize(box), 'top', 'center');
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
    };
    place();
    const ro = new ResizeObserver(place);
    if (card.current) ro.observe(card.current);
    ro.observe(open.el);
    // The page changing under the card: follow the icon, show what it now stands for, or close when it is gone.
    const mo = new MutationObserver(() => {
      const spec = open.el.isConnected ? open.el.dataset.hover : undefined;
      if (!spec) close();
      else if (spec !== open.spec) setOpen({ ...open, spec });
      else place();
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    mo.observe(open.el, { attributes: true, attributeFilter: ['data-hover'] });
    const ctl = new AbortController();
    window.addEventListener('scroll', place, { capture: true, signal: ctl.signal });
    window.addEventListener('resize', place, { signal: ctl.signal });
    openCard.anchor = open.el;
    openCard.card = card.current;
    return () => {
      ro.disconnect();
      mo.disconnect();
      ctl.abort();
      openCard.anchor = openCard.card = null;
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      ref={card}
      key={open.n}
      className="fixed z-50 w-[300px] animate-rise rounded-xl border border-line-strong bg-canopy p-4 text-sm text-moon shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]"
      style={pos ?? { top: -10000, left: 0 }}
    >
      <Card spec={open.spec} />
    </div>,
    document.body,
  );
}
