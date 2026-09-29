import type { Metadata } from 'next';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Ban,
  ExternalLink,
  Settings2,
  Sparkles,
  Undo2,
  Wrench,
} from 'lucide-react';
import { configuredSetNumber, currentPatch, getSetInfo } from '@/config/game';
import {
  ESPORTS,
  ESPORTS_SOURCE,
  OFFICIAL_LINKS,
  PATCH_NOTES,
  type Change,
  type ChangeGroup,
  type ChangeKind,
  type PatchNote,
} from '@/content/news';
import { AugmentIcon, ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { HScroll } from '@/components/ui/hscroll';
import { PageHeader } from '@/components/ui/primitives';
import { getStaticData } from '@/lib/cdragon';
import { param, type SearchParams } from '@/lib/search-params';
import { cn, fmt, slugify } from '@/lib/utils';
import type { StaticData } from '@/types/static';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Patch notes',
  description: 'Every Set 18 Enchanted Wilds patch sorted into buffs, nerfs and changes, plus the patch calendar and the competitive schedule.',
};

const KIND_LABEL: Record<PatchNote['kind'], string> = {
  launch: 'Set launch',
  patch: 'Patch',
  'mid-patch': 'Mid-patch update',
  hotfix: 'Hotfix',
};

const CHANGE: Record<ChangeKind, { icon: LucideIcon; tone: string; one: string; many: string }> = {
  buff: { icon: ArrowUp, tone: 'bg-good/12 text-good', one: 'buff', many: 'buffs' },
  nerf: { icon: ArrowDown, tone: 'bg-bloom/12 text-bloom', one: 'nerf', many: 'nerfs' },
  change: { icon: ArrowLeftRight, tone: 'bg-dusk/15 text-dusk', one: 'adjustment', many: 'adjustments' },
  revert: { icon: Undo2, tone: 'bg-dusk/15 text-dusk', one: 'revert', many: 'reverts' },
  disabled: { icon: Ban, tone: 'bg-fog/15 text-lichen', one: 'disabled', many: 'disabled' },
  new: { icon: Sparkles, tone: 'bg-wisp/12 text-wisp', one: 'new', many: 'new' },
  fix: { icon: Wrench, tone: 'bg-lichen/10 text-lichen', one: 'fix', many: 'fixes' },
};
const KIND_ORDER: ChangeKind[] = ['buff', 'nerf', 'change', 'revert', 'disabled', 'new', 'fix'];

/* ── Matching targets to the catalog ─────────────────────── */

type Ref = { type: 'unit' | 'trait' | 'item' | 'augment'; key: string; href?: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function resolver(data: StaticData | null) {
  const maps = {
    unit: new Map((data?.champions ?? []).map((c) => [norm(c.name), { key: c.key, href: `/units/${c.slug}` }])),
    trait: new Map((data?.traits ?? []).map((t) => [norm(t.name), { key: t.key, href: `/traits/${t.slug}` }])),
    item: new Map((data?.items ?? []).map((i) => [norm(i.name), { key: i.key, href: `/items/${i.slug}` }])),
    augment: new Map((data?.augments ?? []).map((a) => [norm(a.name), { key: a.key, href: undefined as string | undefined }])),
  };
  return (group: ChangeGroup, target: string): Ref | undefined => {
    if (group.type === 'other') return undefined;
    const hit = maps[group.type].get(norm(target));
    return hit ? { type: group.type, ...hit } : undefined;
  };
}

/** Changes of one group, gathered per target in the order they first appear. */
function byTarget(group: ChangeGroup) {
  const out = new Map<string, Change[]>();
  for (const c of group.changes) out.set(c.target, [...(out.get(c.target) ?? []), c]);
  return [...out.entries()];
}

function tally(note: PatchNote) {
  const counts = new Map<ChangeKind, number>();
  for (const g of note.groups) for (const c of g.changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  return KIND_ORDER.filter((k) => counts.get(k)).map((k) => ({ kind: k, n: counts.get(k)! }));
}

/* ── Pieces ──────────────────────────────────────────────── */

function Marker({ kind }: { kind: ChangeKind }) {
  const { icon: Icon, tone, one } = CHANGE[kind];
  return (
    <span className={cn('mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-[5px]', tone)} title={one}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      <span className="sr-only">{one}</span>
    </span>
  );
}

function TargetIcon({ refd, group }: { refd?: Ref; group: ChangeGroup }) {
  if (refd?.type === 'unit') return <ChampionIcon id={refd.key} size="sm" link={false} hover={false} />;
  if (refd?.type === 'trait') return <TraitBadge id={refd.key} tier={1} size={28} link={false} hover={false} showCount={false} />;
  if (refd?.type === 'item') return <ItemIcon id={refd.key} px={30} link={false} hover={false} />;
  if (refd?.type === 'augment') return <AugmentIcon id={refd.key} px={30} />;
  const Icon = /wisp/i.test(group.title) ? Sparkles : Settings2;
  return (
    <span className="grid size-[30px] shrink-0 place-items-center rounded-md border border-line bg-bark/60 text-fog">
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

function Values({ change }: { change: Change }) {
  if (!change.from && !change.to) return null;
  return (
    <span className="num inline-flex flex-wrap items-baseline gap-x-1.5 text-[14px]">
      {change.from ? (
        <>
          <span className="whitespace-nowrap text-fog">{change.from}</span>
          <span className="text-fog" aria-label="to">
            →
          </span>
        </>
      ) : (
        <span className="text-fog">now</span>
      )}
      <span className="whitespace-nowrap font-semibold text-moon">{change.to}</span>
    </span>
  );
}

const groupId = (group: ChangeGroup) => `changes-${slugify(group.title)}`;

function Group({ group, resolve }: { group: ChangeGroup; resolve: ReturnType<typeof resolver> }) {
  const targets = byTarget(group);
  return (
    <section id={groupId(group)} className="scroll-mt-32 space-y-3">
      <h3 className="eyebrow flex items-center gap-2 text-fog">
        {group.title}
        <span className="num font-normal normal-case tracking-normal text-fog/80">{group.changes.length}</span>
      </h3>
      <div className="surface overflow-hidden rounded-xl">
        {targets.map(([target, changes]) => {
          const refd = resolve(group, target);
          const name = (
            <span className="flex min-w-0 items-center gap-3">
              <TargetIcon refd={refd} group={group} />
              <span className="min-w-0 text-[15px] font-semibold leading-snug text-moon transition-colors group-hover/target:text-wisp">
                {target}
              </span>
            </span>
          );
          return (
            <div
              key={target}
              className="grid gap-x-6 gap-y-2 border-t hairline px-4 py-3.5 first:border-t-0 sm:px-5 md:grid-cols-[13rem_minmax(0,1fr)]"
            >
              {refd?.href ? (
                <Link href={refd.href} className="group/target self-start rounded-md">
                  {name}
                </Link>
              ) : (
                <div className="self-start">{name}</div>
              )}
              <ul className="min-w-0 space-y-2 md:pt-[5px]">
                {changes.map((c, i) => (
                  <li key={`${c.what}-${i}`} className="flex gap-3">
                    <Marker kind={c.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5">
                        <span className="text-[14px] leading-relaxed text-lichen">{c.what}</span>
                        <Values change={c} />
                      </div>
                      {c.note && <p className="mt-0.5 text-[13px] leading-relaxed text-fog">{c.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Patch timeline: the calendar is the navigation ─────── */

type PatchWindow = ReturnType<typeof getSetInfo>['patches'][number];

const noteHref = (n: PatchNote) => (n.id === PATCH_NOTES[0].id ? '/news' : `/news?p=${n.id}`);

/** The note that covers a calendar patch: its own, or for a lettered mid-patch without one, its base patch's. */
function noteFor(p: PatchWindow, today: string): PatchNote | undefined {
  const own = PATCH_NOTES.find((n) => n.label === p.label);
  if (own || p.start > today) return own;
  return PATCH_NOTES.find((n) => n.label === p.label.replace(/[a-z]$/, ''));
}

function Timeline({ patches, live, selected, today }: { patches: PatchWindow[]; live?: string; selected: PatchNote; today: string }) {
  const liveAt = patches.findIndex((p) => p.label === live);
  return (
    <HScroll className="-mx-4 px-4 sm:-mx-6 sm:px-6">
      <ol aria-label="Patches this set" className="grid min-w-[48rem] auto-cols-fr grid-flow-col pb-1">
        {patches.map((p, i) => {
          const note = noteFor(p, today);
          const future = p.start > today;
          const isLive = p.label === live;
          const on = note?.id === selected.id && note?.label === p.label;
          const line = (from: number) => (from < liveAt ? 'border-lichen/35' : 'border-dashed border-line-strong');
          const body = (
            <>
              <span
                className={cn(
                  'relative z-10 grid size-[19px] place-items-center rounded-full border-2 bg-night transition-colors',
                  on
                    ? 'border-wisp bg-wisp ring-4 ring-wisp/15'
                    : isLive
                      ? 'border-good'
                      : future
                        ? 'border-dashed border-line-strong'
                        : note
                          ? 'border-lichen/70 group-hover:border-moon'
                          : 'border-lichen/40',
                )}
              >
                {isLive && !on && <span className="size-[7px] rounded-full bg-good" />}
              </span>
              <span
                className={cn(
                  'num mt-2.5 text-[15px] font-semibold leading-none transition-colors',
                  on ? 'text-wisp' : future ? 'text-fog' : 'text-moon group-hover:text-wisp',
                )}
              >
                {p.label}
              </span>
              <span className="mt-1.5 whitespace-nowrap text-xs text-fog">
                {isLive ? (
                  <>
                    <span className="font-medium text-good">Live</span> · {fmt.date(`${p.start}T12:00:00Z`)}
                  </>
                ) : (
                  fmt.date(`${p.start}T12:00:00Z`)
                )}
              </span>
            </>
          );
          return (
            <li key={p.label} className="relative flex justify-center">
              {i > 0 && <span aria-hidden className={cn('absolute left-0 right-1/2 top-[9px] border-t', line(i - 1))} />}
              {i < patches.length - 1 && (
                <span aria-hidden className={cn('absolute left-1/2 right-0 top-[9px] border-t', line(i))} />
              )}
              {note && !future ? (
                <Link
                  href={noteHref(note)}
                  scroll={false}
                  aria-current={on ? 'page' : undefined}
                  title={note.label === p.label ? note.title : `Covered in the ${note.label} notes`}
                  className="group flex flex-col items-center rounded-lg px-2 outline-none focus-visible:ring-2 focus-visible:ring-wisp/60"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex flex-col items-center px-2" title={future ? (p.tentative ? 'Planned' : 'Upcoming') : undefined}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </HScroll>
  );
}

/* ── Page ────────────────────────────────────────────────── */

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const setNumber = configuredSetNumber();
  const info = getSetInfo(setNumber);
  const live = currentPatch(setNumber)?.label;
  const today = new Date().toISOString().slice(0, 10);
  const data = await getStaticData().catch(() => null);
  const resolve = resolver(data);

  const wanted = param(sp, 'p');
  const note = PATCH_NOTES.find((n) => n.id === wanted) ?? PATCH_NOTES[0];
  const counts = tally(note);
  const nextEvent = ESPORTS.find((e) => e.ends >= today);

  return (
    <div className="space-y-10">
      <div className="space-y-9">
        <PageHeader
          eyebrow={`Set ${info.number} · ${info.name}`}
          title="Patch notes"
          description="Every patch this set, sorted into buffs, nerfs and changes. Pick one on the timeline; Riot's full notes are linked on each."
        />
        <Timeline patches={info.patches} live={live} selected={note} today={today} />
      </div>

      <div className="grid grid-cols-1 gap-10 border-t hairline pt-10 lg:grid-cols-[minmax(0,1fr)_15rem] xl:gap-14">
        <article id={note.id} className="min-w-0 space-y-8">
          <header>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-lichen">
              <span className="num font-semibold text-wisp">{note.label}</span>
              <span className="text-fog">·</span>
              <span>{KIND_LABEL[note.kind]}</span>
              <span className="text-fog">·</span>
              <span>{fmt.date(`${note.date}T12:00:00Z`)}</span>
            </div>
            <h2 className="mt-3 text-[1.9rem] leading-[1.15] text-moon sm:text-[2.2rem]">{note.title}</h2>
            <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-lichen">{note.summary}</p>
            {counts.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2" aria-label="Changes in this patch">
                {counts.map(({ kind, n }) => (
                  <li key={kind} className="flex items-center gap-2 text-[13px] text-lichen">
                    <Marker kind={kind} />
                    <span>
                      <span className="num font-semibold text-moon">{n}</span> {n === 1 ? CHANGE[kind].one : CHANGE[kind].many}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </header>

          {note.groups.map((g) => (
            <Group key={g.title} group={g} resolve={resolve} />
          ))}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-32 space-y-7">
            <nav aria-label="In this patch">
              <div className="eyebrow border-b hairline pb-3 text-fog">In this patch</div>
              <ol className="mt-2 space-y-0.5">
                {note.groups.map((g) => (
                  <li key={g.title}>
                    <a
                      href={`#${groupId(g)}`}
                      className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-lichen transition-colors hover:bg-white/[0.03] hover:text-moon"
                    >
                      <span className="min-w-0">{g.title}</span>
                      <span className="num text-xs text-fog">{g.changes.length}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="space-y-2.5 border-t hairline pt-5 text-sm">
              <a
                href={note.source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between gap-3 text-lichen transition-colors hover:text-wisp"
              >
                Riot&apos;s full notes
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
              <Link href="/guides#set-mechanics" className="group flex items-center justify-between gap-3 text-lichen transition-colors hover:text-wisp">
                How {info.name} works
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <a
        href={note.source.url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-lichen transition-colors hover:text-wisp lg:hidden"
      >
        Riot&apos;s full {note.label} notes
        <ExternalLink className="size-3.5" aria-hidden />
      </a>

      <section className="space-y-5 border-t hairline pt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="text-[1.6rem] leading-tight text-moon">Competitive season</h2>
            <p className="mt-1.5 text-sm text-lichen">
              The {info.name} circuit, from the cups to the Tactician&apos;s Crown.
              {nextEvent ? ` Next up: ${nextEvent.name}, ${nextEvent.dates}.` : ''}
            </p>
          </div>
          <a
            href={ESPORTS_SOURCE.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-lichen transition-colors hover:text-wisp"
          >
            {ESPORTS_SOURCE.label}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        <ol className="surface divide-y divide-line overflow-hidden rounded-xl">
          {ESPORTS.map((e) => {
            const done = e.ends < today;
            const next = e === nextEvent;
            return (
              <li
                key={e.name}
                className={cn(
                  'grid gap-x-6 gap-y-1 px-4 py-3.5 sm:px-5 md:grid-cols-[5.5rem_minmax(0,15rem)_9rem_minmax(0,1fr)] md:items-baseline',
                  next && 'bg-wisp/[0.05]',
                )}
              >
                <span
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.12em]',
                    done ? 'text-fog' : next ? 'text-wisp' : 'text-lichen',
                  )}
                >
                  {done ? 'Done' : next ? 'Next' : 'Upcoming'}
                </span>
                <span className={cn('font-medium', done ? 'text-lichen' : 'text-moon')}>{e.name}</span>
                <span className="num text-sm text-lichen">{e.dates}</span>
                <span className={cn('text-sm leading-relaxed', done ? 'text-fog/80' : 'text-fog')}>{e.detail}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm">
          <span className="eyebrow text-fog">From Riot</span>
          {OFFICIAL_LINKS.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-lichen transition-colors hover:text-wisp"
            >
              {l.label}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
