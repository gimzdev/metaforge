import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { costColor, currentIndex, styleFor } from '@/lib/static';
import type { ChampionLite, TraitLite, TraitStyle } from '@/lib/static/types';
import { cn } from '@/lib/utils';
import { GameImage } from './game-image';

/**
 * Champion, item, trait and augment icons. Plain markup (no hooks), so server pages
 * render them without shipping them to the browser. Icons with data-hover get the
 * shared hover card (components/game/hover.tsx).
 */

const SIZES = { xs: 22, sm: 30, md: 40, ml: 46, lg: 52, xl: 72, '2xl': 96 } as const;
type IconSize = keyof typeof SIZES;

/**
 * Link an icon and mark it for the hover card: the link carries the mark when there is
 * one, otherwise the icon itself (no wrapper element either way).
 */
function linked(body: (hoverProps: object) => ReactNode, href: string | null, label: string, hover: string | null) {
  const mark = hover ? { 'data-hover': hover } : {};
  if (!href) return body(mark);
  return (
    <Link href={href} className="inline-flex rounded-lg" aria-label={label} {...mark}>
      {body({})}
    </Link>
  );
}

/* ── Stars ──────────────────────────────────────────────── */
const STAR_COLOR: Record<number, string> = { 1: '#b8a58a', 2: '#d8e3ea', 3: '#f5c86a', 4: '#5bd68a' };

export function Stars({ star, className, size }: { star: number; className?: string; size?: number }) {
  if (star < 2) return null;
  return (
    <span
      aria-label={`${star} star`}
      className={cn('pointer-events-none flex justify-center tracking-[-0.12em]', className)}
      style={{ color: STAR_COLOR[star] ?? STAR_COLOR[3], textShadow: '0 1px 2px rgb(0 0 0 / 0.9)', ...(size ? { fontSize: size } : {}) }}
    >
      {'★'.repeat(Math.min(star, 4))}
    </span>
  );
}

/** A five-point star in a 24×24 box. */
const STAR_POINTS = Array.from({ length: 10 }, (_, k) => {
  const r = k % 2 ? 4.6 : 10.8;
  const a = -Math.PI / 2 + (k * Math.PI) / 5;
  return `${(12 + r * Math.cos(a)).toFixed(2)},${(12.9 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** Stars drawn as shapes, so they measure the same on every system. Each is `var(--s)` wide. */
export function StarShapes({ star, className, style }: { star: number; className?: string; style?: CSSProperties }) {
  if (star < 2) return null;
  const color = STAR_COLOR[star] ?? STAR_COLOR[3];
  return (
    <span aria-label={`${star} star`} className={cn('pointer-events-none flex justify-center', className)} style={style}>
      {Array.from({ length: Math.min(star, 4) }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          aria-hidden
          className="shrink-0 overflow-visible drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.85)]"
          style={{ width: 'var(--s)', height: 'var(--s)', marginLeft: i ? 'calc(var(--s) * -0.12)' : 0 }}
        >
          <polygon points={STAR_POINTS} fill={color} stroke="#0f0d0b" strokeWidth={2.4} strokeLinejoin="round" paintOrder="stroke" />
        </svg>
      ))}
    </span>
  );
}

/* ── Champions ──────────────────────────────────────────── */
export function Portrait({ champion, px, className }: { champion: ChampionLite; px: number; className?: string }) {
  const radius = Math.max(5, Math.round(px * 0.2));
  const color = costColor(champion.cost);
  return (
    <span
      className={cn('relative block shrink-0', className)}
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        padding: px >= 40 ? 2 : 1.5,
        background: `linear-gradient(160deg, ${color}, color-mix(in oklab, ${color} 45%, #0f0d09))`,
      }}
    >
      <GameImage src={champion.icon} alt={champion.name} px={px} className="h-full w-full" imgClassName="scale-[1.08]" style={{ borderRadius: radius - 2 }} />
    </span>
  );
}

export function ChampionIcon({
  id,
  size = 'md',
  px: pxProp,
  star,
  items,
  showName,
  link = true,
  hover = true,
  even = false,
  className,
}: {
  id: string;
  size?: IconSize;
  /** Exact portrait size in pixels, instead of one of the preset sizes. */
  px?: number;
  star?: number;
  items?: string[];
  showName?: boolean;
  link?: boolean;
  hover?: boolean;
  /** Reserve room for a full three-item bar, so a row of units stays evenly spaced whatever each one holds. */
  even?: boolean;
  className?: string;
}) {
  const champion = currentIndex().champion(id);
  if (!champion) return null;
  const px = pxProp ?? SIZES[size];
  const itemPx = Math.max(12, Math.round(px / 2.7));
  // The lift answers a pointer on this unit only, and only when the unit itself does something.
  return linked(
    (mark) => (
      <span {...mark} className={cn('group/unit relative inline-flex w-fit flex-col items-center', className)} style={even ? { width: Math.max(px, itemPx * 3 + 4) } : undefined}>
        {star !== undefined && star >= 2 && (
          <Stars star={star} size={Math.max(9, Math.round(px * 0.3))} className="absolute -top-[0.55em] left-0 right-0 z-10 leading-none" />
        )}
        <Portrait champion={champion} px={px} className={link || hover ? 'transition-transform duration-150 group-hover/unit:-translate-y-0.5' : undefined} />
        {items && items.length > 0 && (
          <span className="-mt-[4px] flex gap-px rounded-md bg-night/90 p-px">
            {items.slice(0, 3).map((it, i) => (
              <ItemIcon key={`${it}-${i}`} id={it} px={itemPx} link={false} hover={false} />
            ))}
          </span>
        )}
        {showName && <span className="mt-1 max-w-[6.5rem] truncate text-center text-[11px] text-lichen">{champion.name}</span>}
      </span>
    ),
    link ? `/units/${champion.slug}` : null,
    champion.name,
    hover ? `u:${champion.key}` : null,
  );
}

/* ── Items ──────────────────────────────────────────────── */
export function ItemIcon({
  id,
  size = 'sm',
  px,
  link = true,
  hover = true,
  className,
}: {
  id: string;
  size?: IconSize;
  px?: number;
  link?: boolean;
  hover?: boolean;
  className?: string;
}) {
  const item = currentIndex().item(id);
  if (!item) return null;
  const dim = px ?? SIZES[size];
  return linked(
    (mark) => (
      <span {...mark} className="inline-flex overflow-hidden rounded-[22%] ring-1 ring-black/40">
        <span className={cn('inline-block shrink-0', className)} style={{ width: dim, height: dim }}>
          <GameImage src={item.icon} alt={item.name} className="h-full w-full" />
        </span>
      </span>
    ),
    link ? `/items/${item.slug}` : null,
    item.name,
    hover ? `i:${item.key}` : null,
  );
}

/* ── Traits ─────────────────────────────────────────────── */
const STYLE_FILL: Record<TraitStyle, string> = {
  inactive: 'var(--color-bark)',
  bronze: 'linear-gradient(160deg, #e0ad7d, #9a6a3f)',
  silver: 'linear-gradient(160deg, #eef5fa, #8f9fab)',
  gold: 'linear-gradient(160deg, #ffe08a, #c7922b)',
  unique: 'linear-gradient(160deg, #ffb07a, #d9542a)',
  prismatic: 'linear-gradient(135deg, #b8f7ff, #f1b9ff 45%, #ffe7a8 80%)',
};

export function TraitHex({ trait, style, px = 28 }: { trait: TraitLite; style: TraitStyle; px?: number }) {
  return (
    <span className="hex relative grid shrink-0 place-items-center" style={{ width: px, height: px * 0.9, background: STYLE_FILL[style] }}>
      <GameImage
        src={trait.icon}
        alt={trait.name}
        contain
        className="h-[62%] w-[62%] bg-transparent"
        imgClassName={style !== 'inactive' ? 'brightness-0 opacity-80' : 'opacity-75'}
      />
    </span>
  );
}

export function TraitBadge({
  id,
  tier,
  count,
  matchStyle,
  size = 28,
  showName,
  showCount = true,
  link = true,
  hover = true,
  className,
}: {
  id: string;
  tier?: number;
  count?: number;
  matchStyle?: number;
  size?: number;
  showName?: boolean;
  /** Show the unit count next to the hex (defaults to the breakpoint's size). */
  showCount?: boolean;
  link?: boolean;
  hover?: boolean;
  className?: string;
}) {
  const trait = currentIndex().trait(id);
  if (!trait) return null;
  const label = showCount ? (count ?? (tier ? trait.effects[tier - 1]?.minUnits : undefined)) : undefined;
  return linked(
    (mark) => (
      <span {...mark} className={cn('inline-flex items-center gap-1.5', className)}>
        <TraitHex trait={trait} style={styleFor(trait, tier, matchStyle)} px={size} />
        {(showName || label !== undefined) && (
          <span className="text-[13px] leading-none">
            {label !== undefined && <span className="num mr-1 font-semibold text-moon">{label}</span>}
            {showName && <span className="text-lichen">{trait.name}</span>}
          </span>
        )}
      </span>
    ),
    link ? `/traits/${trait.slug}` : null,
    trait.name,
    hover ? `t:${trait.key}:${tier ?? 0}` : null,
  );
}

/* ── Augments ───────────────────────────────────────────── */
export function AugmentIcon({ id, px = 32, className }: { id: string; px?: number; className?: string }) {
  const aug = currentIndex().augment(id);
  if (!aug) return null;
  return (
    <span data-hover={`a:${aug.key}`} className={cn('inline-flex overflow-hidden rounded-lg', className)} style={{ width: px, height: px }}>
      <GameImage src={aug.icon} alt={aug.name} className="h-full w-full" />
    </span>
  );
}
