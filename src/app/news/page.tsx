import type { Metadata } from 'next';
import Link from 'next/link';
import type { LucideIcon } from '@/components/icons';
import { ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, Ban, ExternalLink, Settings2, Sparkles, Undo2, Wrench } from '@/components/icons';
import { getSetInfo, patchTimeline, setTitle, type TimelinePatch } from '@/config/game';
import { ESPORTS, ESPORTS_SOURCE, NOTES_SET, OFFICIAL_LINKS, PATCH_NOTES, RIOT_PATCH_NOTES_URL, type Change, type ChangeGroup, type ChangeKind, type PatchNote } from '@/content/news';
import { SET19 } from '@/content/set19';
import { AugmentIcon, ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { AvgPlace } from '@/components/stats/bits';
import { PageHeader } from '@/components/ui';
import { HScroll } from '@/components/ui-client';
import { PATCHLAB_PATCHES, patchlabPatchHref } from '@/lib/patchlab';
import { param, type SearchParams } from '@/lib/search-params';
import { getStaticData, shownSetNumber } from '@/lib/static/load';
import type { StaticData } from '@/lib/static/types';
import { getMeta, statMap, type StatMap } from '@/lib/stats/service';
import { cn, fmt, slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const selectedNote = (sp: Awaited<SearchParams>) => PATCH_NOTES.find((n) => n.id === param(sp, 'p')) ?? PATCH_NOTES[0];

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const note = selectedNote(await searchParams);
  const newest = note.id === PATCH_NOTES[0].id;
  return {
    title: newest ? 'Patch notes' : `Patch ${note.label} notes`,
    description: newest
      ? `Every ${setTitle(getSetInfo(NOTES_SET), ' ')} patch sorted into buffs, nerfs and changes, plus the patch calendar and the competitive schedule.`
      : note.summary,
    alternates: { canonical: noteHref(note) },
  };
}

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

/** Changes of one group per target, in first-appearance order. */
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
          <span className="text-fog" aria-hidden>→</span>
          <span className="sr-only">to</span>
        </>
      ) : (
        <span className="text-fog">now</span>
      )}
      <span className="whitespace-nowrap font-semibold text-moon">{change.to}</span>
    </span>
  );
}

const groupId = (group: ChangeGroup) => `changes-${slugify(group.title)}`;

/** `now`: champion key → [average place, play rate] on the patch these notes are for (only while it is the live patch). */
function Group({ group, resolve, now }: { group: ChangeGroup; resolve: ReturnType<typeof resolver>; now: StatMap | null }) {
  const targets = byTarget(group);
  return (
    <section id={groupId(group)} className="scroll-mt-32 space-y-3">
      <h3 className="eyebrow flex items-center gap-2 text-fog">
        {group.title}
        <span className="num font-normal normal-case tracking-normal text-fog">{group.changes.length}</span>
      </h3>
      <div className="surface overflow-hidden rounded-xl">
        {targets.map(([target, changes]) => {
          const refd = resolve(group, target);
          const result = refd?.type === 'unit' ? now?.[refd.key] : undefined;
          const name = (
            <span className="flex min-w-0 items-center gap-3">
              <TargetIcon refd={refd} group={group} />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug text-moon transition-colors group-hover/target:text-wisp">{target}</span>
                {result && (
                  <span className="mt-0.5 block text-xs text-fog">
                    <AvgPlace value={result[0]} className="text-xs" /> avg, {fmt.pct(result[1], result[1] < 0.1 ? 1 : 0)} played
                  </span>
                )}
              </span>
            </span>
          );
          return (
            <div
              key={target}
              className="grid gap-x-6 gap-y-2 border-t hairline px-4 py-3.5 first:border-t-0 sm:px-5 md:grid-cols-[13rem_minmax(0,1fr)]"
            >
              {refd?.href ? (
                <Link href={refd.href} className="group/target self-start rounded-md">{name}</Link>
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


const noteHref = (n: PatchNote) => (n.id === PATCH_NOTES[0].id ? '/news' : `/news?p=${n.id}`);

/** The note that covers a patch that went live: its own, or for a lettered mid-patch without one, its base patch's. */
function noteFor(p: TimelinePatch): PatchNote | undefined {
  const own = PATCH_NOTES.find((n) => n.label === p.label);
  if (own || p.state === 'scheduled') return own;
  return PATCH_NOTES.find((n) => n.label === p.label.replace(/[a-z]$/, ''));
}

/**
 * The set's patches in order: the ones that went live (dated by the calendar or by their first games), then the ones
 * on Riot's schedule. A scheduled patch is never shown as live by its date: only once its games are collected.
 */
function Timeline({ patches, selected }: { patches: TimelinePatch[]; selected: PatchNote }) {
  const liveAt = patches.findIndex((p) => p.state === 'live');
  const now = Date.now();
  return (
    <HScroll className="rounded-xl border border-line-strong bg-canopy shadow-[0_20px_50px_-30px_rgb(0_0_0/0.9)]">
      <ol aria-label="Patches this set" className="grid min-w-[52rem] auto-cols-fr grid-flow-col px-3 py-2">
        {patches.map((p, i) => {
          const note = noteFor(p);
          const future = p.state === 'scheduled';
          // Two days after the start of its scheduled day (UTC) the day has ended everywhere and the collector has run:
          // a patch still without games by then is late, and the timeline says so instead of "Scheduled".
          const late = future && now > Date.parse(`${p.date}T00:00:00Z`) + 48 * 3600 * 1000;
          const isLive = p.state === 'live';
          const on = note?.id === selected.id && note?.label === p.label;
          const line = (from: number) => (from < liveAt ? 'border-solid border-lichen/45' : 'border-dashed border-lichen/25');
          const dot = on ? (
            <span className="size-[18px] rounded-full bg-wisp ring-[5px] ring-wisp/20" />
          ) : isLive ? (
            <span className="grid size-[16px] place-items-center rounded-full border-2 border-good">
              <span className="size-[6px] rounded-full bg-good" />
            </span>
          ) : future ? (
            <span className="size-[14px] rounded-full border-2 border-dashed border-fog/60" />
          ) : note ? (
            <span className="size-[14px] rounded-full bg-lichen transition-colors group-hover:bg-moon" />
          ) : (
            <span className="size-[14px] rounded-full border-2 border-lichen/50" />
          );
          const body = (
            <>
              <span className="relative z-10 grid size-[24px] place-items-center rounded-full bg-canopy">{dot}</span>
              <span className={cn('num mt-3 text-[17px] font-semibold leading-none transition-colors', on ? 'text-wisp' : future ? 'text-lichen' : 'text-moon group-hover:text-wisp')}>
                {p.label}
              </span>
              <span className={cn('mt-1.5 whitespace-nowrap text-[13px]', on ? 'text-moon' : 'text-lichen')}>{fmt.date(`${p.date}T12:00:00Z`)}</span>
              {/* Its state on a line of its own: beside the date it ran into the next patch's label on narrower screens. */}
              {(isLive || future) && (
                <span className={cn('mt-1 whitespace-nowrap text-[12px] leading-none', isLive ? 'font-medium text-good' : 'text-lichen')}>
                  {isLive ? 'Live' : late ? 'Not out yet' : 'Scheduled'}
                </span>
              )}
            </>
          );
          const box = cn('flex flex-col items-center rounded-lg px-3 pb-3 pt-3', on && 'bg-wisp/[0.09]');
          return (
            <li key={p.label} className="relative flex justify-center">
              {i > 0 && <span aria-hidden className={cn('absolute left-0 right-1/2 top-[24px] border-t-2', line(i - 1))} />}
              {i < patches.length - 1 && <span aria-hidden className={cn('absolute left-1/2 right-0 top-[24px] border-t-2', line(i))} />}
              {note && !future ? (
                <Link
                  href={noteHref(note)}
                  scroll={false}
                  aria-current={on ? 'page' : undefined}
                  title={note.label === p.label ? note.title : `Covered in the ${note.label} notes`}
                  className={cn(box, 'group outline-none transition-colors focus-visible:ring-2 focus-visible:ring-wisp/60', on ? 'hover:bg-wisp/[0.09]' : 'hover:bg-white/[0.05]')}
                >
                  {body}
                </Link>
              ) : (
                <div
                  className={box}
                  title={
                    late
                      ? 'The date on Riot’s schedule. The patch is not out yet; it shows as live here once its ranked games are collected.'
                      : future
                        ? 'The date on Riot’s schedule. It shows as live here once its ranked games are collected.'
                        : undefined
                  }
                >
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

function ExtLink({ href, className, icon = 'size-3.5', children }: { href: string; className: string; icon?: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={cn('text-lichen transition-colors hover:text-wisp', className)}>
      {children}
      <ExternalLink className={icon} aria-hidden />
    </a>
  );
}

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const setNumber = await shownSetNumber();
  const timeline = patchTimeline(setNumber);
  const live = timeline.find((p) => p.state === 'live');
  // The written notes, the overview and the circuit are about one set (NOTES_SET).
  const ownSet = setNumber === NOTES_SET;
  const written = getSetInfo(NOTES_SET);
  // A live patch nobody has written notes for yet (they are written from Riot's published notes only): said plainly.
  const unwritten = live && !(ownSet && noteFor(live)) ? live.label : null;
  const today = new Date().toISOString().slice(0, 10);
  const resolve = resolver(await getStaticData().catch(() => null));

  const note = selectedNote(sp);
  const counts = tally(note);
  // How each changed champion does since: the tier list's own numbers, and only beside the notes of the patch they are from.
  const meta = await getMeta({}).catch(() => null);
  const now = meta && meta.meta.total > 0 && meta.scope.patch === note.label ? statMap(meta.units, meta.minN) : null;
  const changedUnits = now
    ? note.groups.filter((g) => g.type === 'unit').flatMap((g) => byTarget(g).map(([target]) => resolve(g, target))).filter((r) => r && now[r.key]).length
    : 0;
  const stateOf = (e: (typeof ESPORTS)[number]) =>
    e.tba || !e.starts || !e.ends ? 'tba' : e.ends < today ? 'done' : e.starts <= today ? 'live' : 'upcoming';
  const nextEvent = ESPORTS.find((e) => stateOf(e) === 'upcoming');

  return (
    <div className="space-y-10">
      <div className="space-y-9">
        <PageHeader title="Patch notes" />
        <Timeline patches={timeline} selected={note} />
        {setNumber < SET19.number && (
          <p role="note" className="surface rounded-xl px-5 py-4 text-sm leading-relaxed text-lichen">
            <span className="font-semibold text-moon">Set {SET19.number}: {SET19.name}</span> is on the PBE on November 17 and live with patch 19.1 on December 1.{' '}
            <Link href="/set-19" className="font-medium text-wisp hover:underline">Champions, traits and unlocks</Link>
          </p>
        )}
        {unwritten && (
          <p role="note" className="surface rounded-xl px-5 py-4 text-sm leading-relaxed text-lichen">
            <span className="font-semibold text-moon">Patch {unwritten} is live.</span> MetaForge has no notes for it yet. Its changes are in{' '}
            <ExtLink href={RIOT_PATCH_NOTES_URL} className="inline-flex items-center gap-1 font-medium text-wisp">Riot&apos;s patch notes</ExtLink>
            . The tier lists already count its games. Below: the {note.label} notes{ownSet ? '' : `, from ${setTitle(written)}`}.
          </p>
        )}
        {!ownSet && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-lichen">{setTitle(written)}: the patches with notes here</h2>
            <Timeline patches={patchTimeline(NOTES_SET)} selected={note} />
          </div>
        )}
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

          {changedUnits > 0 && (
            <p className="text-[13px] leading-relaxed text-fog">
              Under each champion: its average place and the share of boards it is played on, on patch {note.label}.
            </p>
          )}
          {note.groups.map((g) => <Group key={g.title} group={g} resolve={resolve} now={now} />)}
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
              <ExtLink href={note.source.url} className="flex items-center justify-between gap-3">Riot&apos;s full notes</ExtLink>
              {PATCHLAB_PATCHES.has(note.id) && (
                <ExtLink href={patchlabPatchHref(note.id)} className="flex items-center justify-between gap-3">Simulated in Patchlab</ExtLink>
              )}
              {ownSet && (
                <Link href="/guides#set-mechanics" className="group flex items-center justify-between gap-3 text-lichen transition-colors hover:text-wisp">
                  How {written.name} works
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 lg:hidden">
        <ExtLink href={note.source.url} className="inline-flex items-center gap-1.5 text-sm font-medium">
          Riot&apos;s full {note.label} notes
        </ExtLink>
        {PATCHLAB_PATCHES.has(note.id) && (
          <ExtLink href={patchlabPatchHref(note.id)} className="inline-flex items-center gap-1.5 text-sm font-medium">
            {note.label}, simulated in Patchlab
          </ExtLink>
        )}
      </div>

      <section className="space-y-5 border-t hairline pt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="text-[1.6rem] leading-tight text-moon">Competitive season</h2>
            <p className="mt-1.5 text-sm text-lichen">
              The {written.name} circuit from the cups to the Tactician&apos;s Crown, then the Set 19 launch and the Vegas Open.
              {nextEvent ? ` Next up: ${nextEvent.name}, ${nextEvent.dates}.` : ''}
            </p>
          </div>
          <ExtLink href={ESPORTS_SOURCE.url} className="inline-flex items-center gap-1.5 text-sm font-medium">
            {ESPORTS_SOURCE.label}
          </ExtLink>
        </div>
        <ol className="surface divide-y divide-line overflow-hidden rounded-xl">
          {ESPORTS.map((e) => {
            const state = stateOf(e);
            const next = e === nextEvent;
            const current = state === 'live' || next;
            const tone = {
              // A finished event is dimmer by its colours and struck through, not see-through: at half opacity its text fell to 2.3:1.
              done: { row: '', tag: 'text-fog', name: 'text-lichen', dates: 'text-fog', detail: 'text-fog' },
              live: { row: 'bg-white/[0.035]', tag: 'text-moon', name: 'text-moon', dates: 'text-moon', detail: 'text-lichen' },
              upcoming: { row: next ? 'bg-white/[0.035]' : '', tag: next ? 'text-moon' : 'text-fog', name: 'text-moon', dates: 'text-moon', detail: 'text-lichen' },
              tba: { row: '', tag: 'text-fog', name: 'text-lichen', dates: 'italic text-fog', detail: 'text-fog' },
            }[state];
            const tag = state === 'done' ? 'Done' : state === 'live' ? 'Live now' : state === 'tba' ? 'TBA' : next ? 'Next' : 'Upcoming';
            return (
              <li
                key={e.name}
                aria-current={current ? 'step' : undefined}
                className={cn('grid gap-x-6 gap-y-1 px-4 py-3.5 sm:px-5 md:grid-cols-[5.5rem_minmax(0,15rem)_10rem_minmax(0,1fr)] md:items-baseline', tone.row)}
              >
                <span className={cn('flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em]', tone.tag)}>
                  <span
                    aria-hidden
                    className={cn('size-1.5 rounded-full', current ? 'bg-moon' : state === 'done' ? 'bg-fog/60' : 'border border-fog/70')}
                  />
                  {tag}
                </span>
                <span className={cn('font-medium', state === 'done' && 'line-through decoration-fog/40', tone.name)}>
                  {e.name}
                  {e.tag && <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-[0.14em] text-fog">{e.tag}</span>}
                </span>
                <span className={cn('num text-sm', tone.dates)}>{e.dates}</span>
                <span className={cn('text-sm leading-relaxed', tone.detail)}>{e.detail}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm">
          <span className="eyebrow text-fog">From Riot</span>
          {OFFICIAL_LINKS.map((l) => (
            <ExtLink key={l.url} href={l.url} icon="size-3" className="inline-flex items-center gap-1.5">
              {l.label}
            </ExtLink>
          ))}
        </div>
      </section>
    </div>
  );
}
