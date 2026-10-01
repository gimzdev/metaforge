import Link from 'next/link';
import type { ReactNode } from 'react';
import { Art } from '@/components/art';
import { ArrowUpRight } from '@/components/icons';
import { Collection, MarqueeTrack, type CollectionTab } from '@/components/collection';
import { ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { EntityTable, ScopeBar } from '@/components/stats/table';
import { PageHeader, Panel } from '@/components/ui';
import { getMeta, statMap } from '@/lib/stats/service';
import { itemMinSample } from '@/lib/stats/tiers';
import type { Scope } from '@/lib/stats/types';

/* Home page pieces and the shared body of the /units, /items and /traits pages. */

/** Section opener: numbered label, serif title, hairline underneath. */
export function SectionHead({ label, title }: { label: string; title: ReactNode }) {
  return (
    <div className="mb-7 flex scroll-mt-32 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
      <div className="min-w-0">
        <div className="eyebrow text-wisp">{label}</div>
        <h2 className="mt-2.5 text-[1.85rem] leading-[1.1] text-moon sm:text-[2.15rem]">{title}</h2>
      </div>
    </div>
  );
}

/** One column of the tools row: number, title, a line of copy and a live detail. */
export function ToolColumn({
  n,
  href,
  title,
  description,
  detail,
}: {
  n: string;
  href: string;
  title: string;
  description: string;
  detail?: ReactNode;
}) {
  return (
    <Link href={href} className="group flex flex-col gap-3 py-6 md:px-8 md:py-2 md:first:pl-0 md:last:pr-0">
      <span className="num font-display text-sm italic text-fog">{n}</span>
      <span className="flex items-center justify-between gap-3">
        <span className="font-display text-[1.6rem] leading-tight text-moon transition-colors group-hover:text-wisp">
          {title}
        </span>
        <ArrowUpRight
          className="size-5 shrink-0 text-fog transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-wisp"
          aria-hidden
        />
      </span>
      <span className="max-w-sm text-[15px] leading-relaxed text-lichen">{description}</span>
      {detail && <span className="num text-[13px] text-fog">{detail}</span>}
    </Link>
  );
}

/** Large picture tile with the title set over the art (Guides, Ladder). */
export function ImageTile({
  href,
  art,
  label,
  title,
  description,
  position = 'center',
}: {
  href: string;
  art: string;
  label: string;
  title: string;
  description: string;
  position?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative isolate flex min-h-[300px] flex-col justify-end overflow-hidden rounded-xl border border-line p-6 sm:min-h-[340px] sm:p-8"
    >
      <Art
        src={art}
        lazy
        sizes="(min-width: 1400px) 700px, (min-width: 768px) 50vw, 100vw"
        className="-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        style={{ objectPosition: position }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night via-night/70 to-night/5" aria-hidden />
      <span className="eyebrow text-wisp">{label}</span>
      <span className="mt-2 flex items-end justify-between gap-4">
        <span>
          <span className="block font-display text-[2rem] leading-tight text-moon">{title}</span>
          <span className="mt-2 block max-w-md text-[15px] leading-relaxed text-moon/75">{description}</span>
        </span>
        <ArrowUpRight
          className="mb-1 size-6 shrink-0 text-moon/70 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-wisp"
          aria-hidden
        />
      </span>
    </Link>
  );
}

/* ── Patch highlights ticker ───────────────────────────── */

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

/** Shared body of the /units, /items and /traits index pages. */
export async function CollectionPage({
  tab,
  title,
  description,
  scope,
}: {
  tab: CollectionTab;
  title: string;
  description: string;
  scope: Partial<Scope>;
}) {
  const data = await getMeta(scope).catch(() => null);
  const has = Boolean(data && data.meta.total > 0);
  const itemMin = itemMinSample(data?.minN ?? 0);
  const stats = has && data ? { units: statMap(data.units, data.minN), items: statMap(data.items, itemMin) } : null;
  return (
    <div className="space-y-10">
      <PageHeader title={title} description={description}>
        {has && data && <ScopeBar scope={data.scope} meta={data.meta} />}
      </PageHeader>
      {has && data && tab !== 'augments' && (
        <Panel title="Performance" aside={<span className="text-xs">{data.scope.patch === 'all' ? 'Whole set' : `Patch ${data.scope.patch}`}</span>} flush>
          {tab === 'champions' && <EntityTable kind="unit" rows={data.units} minN={data.minN} limit={20} />}
          {tab === 'items' && <EntityTable kind="item" rows={data.items} minN={itemMin} limit={20} />}
          {tab === 'traits' && <EntityTable kind="trait" rows={data.traits} minN={data.minN} limit={20} />}
        </Panel>
      )}
      <Collection stats={stats} initialTab={tab} title="Browse" />
    </div>
  );
}
