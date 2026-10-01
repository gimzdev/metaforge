'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStaticText } from '@/components/providers';
import { floatingSize, placeFloating } from '@/lib/floating';
import { costColor, currentIndex, styleFor, traitKindLabel } from '@/lib/static';
import { ITEM_CATEGORY_LABEL } from '@/lib/static/types';
import { cn } from '@/lib/utils';
import { Portrait, TraitHex } from './entities';
import { GameImage } from './game-image';
import { RichText } from './rich-text';

/**
 * One hover card for the whole page. Icons carry data-hover="u:key" (champion),
 * "i:key" (item), "t:key:tier" (trait) or "a:key" (augment); hovering or focusing
 * one opens its card above it after a short delay. Touch doesn't open cards.
 */
const OPEN_DELAY = 180;
const CLOSE_DELAY = 60;

/** The open card and its icon: a popover holding the icon counts a press in the card as inside itself. */
export const openCard: { anchor: HTMLElement | null; card: HTMLElement | null } = { anchor: null, card: null };

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
        <div className="flex items-center gap-3">
          <Portrait champion={champion} px={48} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight">{champion.name}</div>
            <div className="mt-0.5 text-xs" style={{ color: costColor(champion.cost) }}>
              {champion.cost}-cost
            </div>
          </div>
        </div>
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
        <div className="flex items-center gap-3">
          <GameImage src={item.icon} alt={item.name} className="size-11 rounded-lg" />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight">{item.name}</div>
            <div className="mt-0.5 text-xs text-lichen">{ITEM_CATEGORY_LABEL[item.category]}</div>
          </div>
        </div>
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
        <div className="flex items-center gap-3">
          <TraitHex trait={trait} style={styleFor(trait, tier || trait.effects.length)} px={40} />
          <div>
            <div className="text-[15px] font-semibold leading-tight">{trait.name}</div>
            <div className="mt-0.5 text-xs capitalize text-lichen">{traitKindLabel(trait)}</div>
          </div>
        </div>
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

  useEffect(() => {
    // Like one hover card per icon: leaving an icon (or its card) closes the card after
    // CLOSE_DELAY, resting on another icon opens that one's card after OPEN_DELAY.
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
      closeTimer = window.setTimeout(() => {
        current.current = null;
        setOpen(null);
      }, CLOSE_DELAY);
    };
    // The icon the pointer is in: only entering an icon opens its card (as pointerenter would),
    // so moving about inside one after its card was dismissed doesn't bring the card back.
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
      if (!current.current) return;
      current.current = null;
      setOpen(null);
    };
    const escape = (e: KeyboardEvent) => {
      // An open card is the top layer: Escape closes it (and not a popover under it).
      if (e.key !== 'Escape' || !current.current) return;
      e.preventDefault();
      window.clearTimeout(closeTimer);
      current.current = null;
      setOpen(null);
    };
    const press = (e: PointerEvent) => {
      if (!inCard(e.target)) dismiss();
    };
    // A click on the card counts as a click on whatever holds its icon (a table row, a comp link,
    // a search hit), as it did when each icon rendered its own card inside those.
    const click = (e: MouseEvent) => {
      const holder = current.current?.parentElement;
      if (!holder || !inCard(e.target)) return;
      const copy = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: e.detail,
        screenX: e.screenX,
        screenY: e.screenY,
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
        buttons: e.buttons,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
      // Page handlers run; the browser's own action (following a link) does not.
      const keep = (ev: Event) => ev === copy && ev.preventDefault();
      window.addEventListener('click', keep);
      holder.dispatchEvent(copy);
      window.removeEventListener('click', keep);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', press);
    document.addEventListener('click', click);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', press);
      document.removeEventListener('click', click);
    };
  }, []);

  // A new page never keeps the last page's card.
  const path = usePathname();
  useEffect(() => {
    current.current = null;
    setOpen(null);
  }, [path]);

  // Above the icon (below when only that fits), kept 12px inside the window sideways; it follows the icon.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = card.current;
      if (!box) return;
      if (!open.el.isConnected) {
        current.current = null;
        return setOpen(null);
      }
      const { top, left } = placeFloating(open.el.getBoundingClientRect(), floatingSize(box), 'top', 'center');
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
    };
    place();
    const ro = new ResizeObserver(place);
    if (card.current) ro.observe(card.current);
    ro.observe(open.el);
    // The page changing under the card: follow the icon, show what it now stands for, or close
    // when it is gone (the card belongs to its icon).
    const mo = new MutationObserver(() => {
      const spec = open.el.isConnected ? open.el.dataset.hover : undefined;
      if (!spec) {
        current.current = null;
        setOpen(null);
      } else if (spec !== open.spec) setOpen({ ...open, spec });
      else place();
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    mo.observe(open.el, { attributes: true, attributeFilter: ['data-hover'] });
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    openCard.anchor = open.el;
    openCard.card = card.current;
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
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
