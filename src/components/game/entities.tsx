'use client';

import Link from 'next/link';
import { HoverCard } from 'radix-ui';
import type { CSSProperties, ReactNode } from 'react';
import { useStatic } from '@/components/providers';
import { costColor } from '@/lib/static-index';
import { styleFor } from '@/lib/trait-style';
import { cn } from '@/lib/utils';
import type { Champion, Item, Trait, TraitStyle } from '@/types/static';
import { ITEM_CATEGORY_LABEL } from '@/types/static';
import { GameImage } from './game-image';
import { RichText } from './rich-text';

const SIZES = { xs: 22, sm: 30, md: 40, ml: 46, lg: 52, xl: 72, '2xl': 96 } as const;
export type IconSize = keyof typeof SIZES;

export function Hover({ trigger, children, disabled }: { trigger: ReactNode; children: ReactNode; disabled?: boolean }) {
  if (disabled) return <>{trigger}</>;
  return (
    <HoverCard.Root openDelay={180} closeDelay={60}>
      <HoverCard.Trigger asChild>{trigger}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[300px] rounded-xl border border-line-strong bg-canopy p-4 text-sm text-moon shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)] data-[state=open]:animate-rise"
        >
          {children}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

/* ── Stars ──────────────────────────────────────────────── */
const STAR_COLOR: Record<number, string> = { 1: '#b8a58a', 2: '#d8e3ea', 3: '#f5c86a', 4: '#7ff3ff' };

/** A crisp dark outline, for stars sitting on busy art. */
const STAR_OUTLINE =
  '-1px -1px 0 #0f0d0b, 1px -1px 0 #0f0d0b, -1px 1px 0 #0f0d0b, 1px 1px 0 #0f0d0b, 0 2px 5px rgb(0 0 0 / 0.85)';

export function Stars({
  star,
  className,
  size,
  outline = false,
}: {
  star: number;
  className?: string;
  size?: number;
  outline?: boolean;
}) {
  if (star < 2) return null;
  return (
    <span
      aria-label={`${star} star`}
      className={cn('pointer-events-none flex justify-center leading-none tracking-[-0.12em]', className)}
      style={{
        color: STAR_COLOR[star] ?? STAR_COLOR[3],
        textShadow: outline ? STAR_OUTLINE : '0 1px 2px rgb(0 0 0 / 0.9)',
        ...(size ? { fontSize: size } : {}),
      }}
    >
      {'★'.repeat(Math.min(star, 4))}
    </span>
  );
}

/* ── Champions ──────────────────────────────────────────── */
export function ChampionCard({ champion }: { champion: Champion }) {
  const index = useStatic();
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
      {champion.ability.name && (
        <div className="text-[13px] text-lichen">
          <div className="mb-1 font-semibold text-moon">{champion.ability.name}</div>
          <RichText value={champion.ability.desc.slice(0, 60)} />
        </div>
      )}
    </div>
  );
}

function Portrait({ champion, px, className }: { champion: Champion; px: number; className?: string }) {
  const radius = Math.max(5, Math.round(px * 0.2));
  return (
    <span
      className={cn('relative block shrink-0', className)}
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        padding: px >= 40 ? 2 : 1.5,
        background: `linear-gradient(160deg, ${costColor(champion.cost)}, color-mix(in oklab, ${costColor(champion.cost)} 45%, #0f0d09))`,
      }}
    >
      <GameImage
        src={champion.icon}
        alt={champion.name}
        className="h-full w-full"
        imgClassName="scale-[1.08]"
        style={{ borderRadius: radius - 2 }}
      />
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
  children,
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
  children?: ReactNode;
}) {
  const index = useStatic();
  const champion = index.champion(id);
  if (!champion) return null;
  const px = pxProp ?? SIZES[size];
  const itemPx = Math.max(12, Math.round(px / 2.7));
  // The lift answers a pointer on this unit only (a named group, so hovering the
  // card, row or ticker entry around it does nothing), and only when the unit
  // itself does something: links somewhere or opens a hover card.
  const interactive = link || hover;
  const body = (
    <span
      className={cn('group/unit relative inline-flex w-fit flex-col items-center', className)}
      style={even ? { width: Math.max(px, itemPx * 3 + 4) } : undefined}
    >
      {star !== undefined && star >= 2 && (
        <Stars star={star} size={Math.max(9, Math.round(px * 0.3))} className="absolute -top-[0.55em] left-0 right-0 z-10" />
      )}
      <Portrait
        champion={champion}
        px={px}
        className={interactive ? 'transition-transform duration-150 group-hover/unit:-translate-y-0.5' : undefined}
      />
      {items && items.length > 0 && (
        <span className="-mt-[4px] flex gap-px rounded-md bg-night/90 p-px">
          {items.slice(0, 3).map((it, i) => (
            <ItemIcon key={`${it}-${i}`} id={it} px={itemPx} link={false} hover={false} />
          ))}
        </span>
      )}
      {showName && (
        <span className="mt-1 max-w-[6.5rem] truncate text-center text-[11px] text-lichen">{champion.name}</span>
      )}
      {children}
    </span>
  );
  const trigger = link ? (
    <Link href={`/units/${champion.slug}`} className="inline-flex rounded-lg" aria-label={champion.name}>
      {body}
    </Link>
  ) : (
    body
  );
  return (
    <Hover trigger={trigger} disabled={!hover}>
      <ChampionCard champion={champion} />
    </Hover>
  );
}

/* ── Items ──────────────────────────────────────────────── */
export function ItemCard({ item }: { item: Item }) {
  const index = useStatic();
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
            const comp = index.item(c);
            return comp ? (
              <span key={`${c}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-fog">+</span>}
                <GameImage src={comp.icon} alt={comp.name} className="size-6 rounded" />
              </span>
            ) : null;
          })}
        </div>
      )}
      <div className="text-[13px] text-lichen">
        <RichText value={item.desc} />
      </div>
    </div>
  );
}

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
  const index = useStatic();
  const item = index.item(id);
  if (!item) return null;
  const dim = px ?? SIZES[size];
  const img = (
    <span className={cn('inline-block shrink-0', className)} style={{ width: dim, height: dim }}>
      <GameImage src={item.icon} alt={item.name} className="h-full w-full" />
    </span>
  );
  const styled = (
    <span className="inline-flex overflow-hidden rounded-[22%] ring-1 ring-black/40">{img}</span>
  );
  const trigger = link ? (
    <Link href={`/items/${item.slug}`} aria-label={item.name} className="inline-flex rounded-md">
      {styled}
    </Link>
  ) : (
    styled
  );
  return (
    <Hover trigger={trigger} disabled={!hover}>
      <ItemCard item={item} />
    </Hover>
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

export function TraitHex({ trait, style, px = 28 }: { trait: Trait; style: TraitStyle; px?: number }) {
  const active = style !== 'inactive';
  return (
    <span
      className="hex relative grid shrink-0 place-items-center"
      style={{ width: px, height: px * 0.9, background: STYLE_FILL[style] } as CSSProperties}
    >
      <GameImage
        src={trait.icon}
        alt={trait.name}
        className="h-[62%] w-[62%] bg-transparent"
        imgClassName={cn('object-contain', active ? 'brightness-0 opacity-80' : 'opacity-75')}
      />
    </span>
  );
}

export function TraitCard({ trait, tier }: { trait: Trait; tier?: number }) {
  const index = useStatic();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <TraitHex trait={trait} style={styleFor(trait, tier || trait.effects.length)} px={40} />
        <div>
          <div className="text-[15px] font-semibold leading-tight">{trait.name}</div>
          <div className="mt-0.5 text-xs capitalize text-lichen">{trait.kind === 'trait' ? 'Synergy' : trait.kind}</div>
        </div>
      </div>
      {trait.desc.length > 0 && (
        <div className="text-[13px] text-lichen">
          <RichText value={trait.desc.slice(0, 40)} />
        </div>
      )}
      {trait.effects.length > 0 && (
        <ul className="space-y-1">
          {trait.effects.map((e, i) => (
            <li
              key={e.minUnits}
              className={cn(
                'flex gap-2 rounded-lg px-2 py-1 text-xs',
                tier === i + 1 ? 'bg-wisp/10 text-moon' : 'text-lichen',
              )}
            >
              <span className="num w-5 shrink-0 font-semibold" style={{ color: `var(--color-style-${e.style})` }}>
                {e.minUnits}
              </span>
              <span className="min-w-0">
                <RichText value={e.desc.slice(0, 30)} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1">
        {trait.champions.slice(0, 12).map((c) => {
          const champ = index.champion(c);
          return champ ? <Portrait key={c} champion={champ} px={24} /> : null;
        })}
      </div>
    </div>
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
  const index = useStatic();
  const trait = index.trait(id);
  if (!trait) return null;
  const style = styleFor(trait, tier, matchStyle);
  const label = showCount ? (count ?? (tier ? trait.effects[tier - 1]?.minUnits : undefined)) : undefined;
  const body = (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <TraitHex trait={trait} style={style} px={size} />
      {(showName || label !== undefined) && (
        <span className="text-[13px] leading-none">
          {label !== undefined && <span className="num mr-1 font-semibold text-moon">{label}</span>}
          {showName && <span className="text-lichen">{trait.name}</span>}
        </span>
      )}
    </span>
  );
  const trigger = link ? (
    <Link href={`/traits/${trait.slug}`} className="inline-flex rounded-md" aria-label={trait.name}>
      {body}
    </Link>
  ) : (
    body
  );
  return (
    <Hover trigger={trigger} disabled={!hover}>
      <TraitCard trait={trait} tier={tier} />
    </Hover>
  );
}

/* ── Augments ───────────────────────────────────────────── */
export function AugmentIcon({ id, px = 32, className }: { id: string; px?: number; className?: string }) {
  const index = useStatic();
  const aug = index.augment(id);
  if (!aug) return null;
  return (
    <Hover
      trigger={
        <span className={cn('inline-flex overflow-hidden rounded-lg', className)} style={{ width: px, height: px }}>
          <GameImage src={aug.icon} alt={aug.name} className="h-full w-full" />
        </span>
      }
    >
      <div className="space-y-2">
        <div className="text-[15px] font-semibold">{aug.name}</div>
        <div className="text-xs capitalize text-lichen">{aug.tier} augment</div>
        <div className="text-[13px] text-lichen">
          <RichText value={aug.desc} />
        </div>
      </div>
    </Hover>
  );
}

/** Resolved display name for any entity key. */
export function useEntityName() {
  const index = useStatic();
  return (kind: 'unit' | 'item' | 'trait' | 'aug', key: string) =>
    (kind === 'unit'
      ? index.champion(key)?.name
      : kind === 'item'
        ? index.item(key)?.name
        : kind === 'trait'
          ? index.trait(key)?.name
          : index.augment(key)?.name) ?? key;
}
