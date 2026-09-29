import Link from 'next/link';
import { ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { MarqueeTrack } from './marquee';

export interface CarouselItem {
  key: string;
  /** e.g. "Most played item" */
  title: string;
  kind: 'unit' | 'item' | 'trait' | 'comp';
  /** Champion, item or trait key; for comps, the carry */
  entity: string;
  tier?: number;
  /** For comps: the main trait and its breakpoint */
  trait?: { id: string; tier: number } | null;
  name: string;
  detail: string;
  href: string;
}

function Icon({ item }: { item: CarouselItem }) {
  if (item.kind === 'unit') return <ChampionIcon id={item.entity} size="sm" link={false} hover={false} />;
  if (item.kind === 'item') return <ItemIcon id={item.entity} px={30} link={false} hover={false} />;
  if (item.kind === 'trait')
    return <TraitBadge id={item.entity} tier={item.tier} size={30} link={false} hover={false} showCount={false} />;
  return <ChampionIcon id={item.entity} size="sm" link={false} hover={false} />;
}

function Entry({ item, copy }: { item: CarouselItem; copy: boolean }) {
  return (
    <Link
      href={item.href}
      tabIndex={copy ? -1 : undefined}
      aria-hidden={copy || undefined}
      className="group flex shrink-0 items-center gap-3 border-l border-line px-6 py-1"
    >
      <Icon item={item} />
      <span className="min-w-0">
        <span className="eyebrow block text-[10px] text-fog">{item.title}</span>
        <span className="mt-0.5 flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-[14px] font-medium text-moon transition-colors group-hover:text-wisp">{item.name}</span>
          <span className="num text-[13px] text-lichen">{item.detail}</span>
        </span>
      </span>
    </Link>
  );
}

/**
 * A running ticker of the patch's standout champions, comps, items and traits.
 * Slows to a crawl on hover; becomes a scrollable row when motion is reduced.
 */
export function StatsCarousel({ items }: { items: CarouselItem[] }) {
  if (items.length < 3) return null;
  const duration = Math.max(50, items.length * 7);
  return (
    <div
      className="marquee-viewport relative -mx-4 overflow-hidden border-y border-line py-3 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] sm:-mx-6"
      aria-label="Patch highlights"
      role="region"
    >
      <MarqueeTrack duration={duration}>
        {items.map((item) => (
          <Entry key={`a-${item.key}`} item={item} copy={false} />
        ))}
        {items.map((item) => (
          <Entry key={`b-${item.key}`} item={item} copy />
        ))}
      </MarqueeTrack>
    </div>
  );
}
