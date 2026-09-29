import Link from 'next/link';
import { ChampionIcon } from '@/components/game/entities';
import { Collection, type StatMap } from '@/components/home/collection';
import { ImageTile, SectionHead, ToolColumn } from '@/components/home/section';
import { StatsCarousel, type CarouselItem } from '@/components/home/stats-carousel';
import { PlayerSearch } from '@/components/player/player-search';
import { currentPatch, getSetInfo } from '@/config/game';
import { brand } from '@/lib/brand';
import { getStaticData } from '@/lib/cdragon';
import { env } from '@/lib/env';
import { ingestRunning } from '@/lib/ingest';
import { platformLabel } from '@/lib/riot/regions';
import { indexStatic, type StaticIndex } from '@/lib/static-index';
import { getMeta, type MetaResult } from '@/lib/stats/service';
import type { Highlight } from '@/lib/stats/tiers';
import type { StatRow } from '@/lib/stats/types';
import { fmt } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function toMap(rows: StatRow[], minN: number): StatMap {
  const out: StatMap = {};
  for (const r of rows) if (r.n >= minN) out[r.id] = [Number(r.avg.toFixed(2)), Number(r.freq.toFixed(4))];
  return out;
}

const HIGHLIGHT_LABEL: Record<Highlight['kind'], string> = {
  best: 'Best average',
  top4: 'Top 4 rate',
  win: 'Win rate',
  popular: 'Most played',
  sleeper: 'Sleeper',
};

function highlightDetail(h: Highlight) {
  const r = h.row;
  switch (h.kind) {
    case 'best':
      return `${fmt.place(r.avg)} avg over ${fmt.int(r.n)} games`;
    case 'top4':
      return `${fmt.pct(r.top4)} top 4 rate`;
    case 'win':
      return `${fmt.pct(r.win)} of games won`;
    case 'popular':
      return `on ${fmt.pct(r.freq, 0)} of boards, ${fmt.place(r.avg)} avg`;
    case 'sleeper':
      return `${fmt.place(r.avg)} avg at ${fmt.pct(r.freq, 1)} play rate`;
  }
}

/** Highlight cards for the carousel, mixed across champions, items, traits and comps. */
function carouselItems(data: MetaResult, index: StaticIndex): CarouselItem[] {
  const units: CarouselItem[] = [];
  for (const h of data.highlights.units) {
    const c = index.champion(h.id);
    if (c)
      units.push({
        key: `u-${h.kind}`,
        title: `${HIGHLIGHT_LABEL[h.kind]} champion`,
        kind: 'unit',
        entity: c.key,
        name: c.name,
        detail: highlightDetail(h),
        href: `/units/${c.slug}`,
      });
  }
  const items: CarouselItem[] = [];
  for (const h of data.highlights.items) {
    const it = index.item(h.id);
    if (it && it.category !== 'component') {
      items.push({
        key: `i-${h.kind}`,
        title: `${HIGHLIGHT_LABEL[h.kind]} item`,
        kind: 'item',
        entity: it.key,
        name: it.name,
        detail: highlightDetail(h),
        href: `/items/${it.slug}`,
      });
    }
  }
  const traits: CarouselItem[] = [];
  for (const h of data.highlights.traits) {
    const key = h.id.slice(0, h.id.lastIndexOf(':'));
    const t = index.trait(key);
    if (!t) continue;
    const units = t.effects[(h.row.tier ?? 1) - 1]?.minUnits;
    traits.push({
      key: `t-${h.kind}`,
      title: `${HIGHLIGHT_LABEL[h.kind]} trait`,
      kind: 'trait',
      entity: t.key,
      tier: h.row.tier,
      name: `${units ?? ''} ${t.name}`.trim(),
      detail: highlightDetail(h),
      href: `/traits/${t.slug}`,
    });
  }
  const comps: CarouselItem[] = data.comps
    .filter((c) => c.grade && c.carry)
    .slice(0, 4)
    .map((c, i) => {
      const t = c.traits.find((x) => x.id === c.trait);
      return {
        key: `c-${c.id}`,
        title: i === 0 ? 'Top comp' : `Comp #${i + 1}`,
        kind: 'comp' as const,
        entity: c.carry!,
        trait: t ? { id: t.id, tier: t.tier } : null,
        name: c.name,
        detail: `${fmt.place(c.avg)} avg, ${fmt.pct(c.top4, 0)} top 4`,
        href: `/comps/${c.id}`,
      };
    });
  const lanes = [units, comps, items, traits];
  const out: CarouselItem[] = [];
  for (let i = 0; lanes.some((l) => i < l.length); i++) {
    for (const lane of lanes) if (lane[i]) out.push(lane[i]);
  }
  return out;
}

export default async function HomePage() {
  const staticData = await getStaticData();
  const index = indexStatic(staticData);
  const set = getSetInfo(staticData.set.number);
  const live = currentPatch(staticData.set.number)?.label ?? null;
  const data = await getMeta({}).catch(() => null);
  const hasData = Boolean(data && data.meta.total > 0);
  const topComp = hasData && data ? data.comps.find((c) => c.grade) : undefined;
  const graded = hasData && data ? data.comps.filter((c) => c.grade).length : 0;
  const topUnits = hasData && data ? data.units.filter((u) => u.grade === 'S').slice(0, 6) : [];
  const stats =
    hasData && data
      ? { units: toMap(data.units, data.minN), items: toMap(data.items, Math.max(5, Math.round(data.minN * 0.6))) }
      : null;
  const scopeLabel = data && data.scope.patch !== 'all' ? `patch ${data.scope.patch}` : 'this set';
  const carousel = hasData && data ? carouselItems(data, index) : [];
  const collecting = ingestRunning();
  const champions = staticData.champions.length;
  const guidesArt = brand.learn || brand.background;
  const ladderArt = brand.fight || brand.background;

  return (
    <div className="space-y-24">
      {/* Masthead: sits on the full-bleed skyline from SiteBackdrop */}
      <section className="-mt-10 grid min-h-[600px] grid-cols-1 items-center gap-12 pb-4 pt-14 sm:min-h-[660px] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-16">
        <div className="max-w-2xl">
          <div className="eyebrow flex flex-wrap items-center gap-x-3 gap-y-1 text-wisp">
            <span>
              Set {set.number} · {set.name}
            </span>
            {live && (
              <Link href="/news" className="text-moon/80 transition-colors hover:text-moon">
                Patch {live}
              </Link>
            )}
          </div>
          <h1 className="mt-6 text-[3.1rem] font-[520] leading-[0.98] tracking-[-0.03em] text-moon sm:text-[4.6rem]">
            Forge your next climb<span className="text-wisp">.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-moon/80">
            Tier lists, a stats explorer and a team builder for {set.name}, built from top players&apos; games and refreshed
            through the day.
          </p>
          <PlayerSearch size="xl" className="mt-9 max-w-xl" />
        </div>

        <aside className="rounded-xl border border-line bg-night/[0.78] p-6 sm:p-7">
          {hasData && data ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="eyebrow text-fog">This patch</span>
                <span className="text-xs text-fog">
                  {data.meta.newest ? `newest game ${fmt.ago(data.meta.newest)}` : collecting ? 'collecting now' : ''}
                </span>
              </div>
              <dl className="mt-5 divide-y divide-line border-y border-line">
                {[
                  ['Boards analyzed', fmt.int(data.summary.boards)],
                  [graded > 0 ? 'Graded comps' : 'Comps tracked', String(graded > 0 ? graded : data.comps.length)],
                  [
                    data.meta.regions.length === 1 ? 'Region' : 'Regions',
                    data.meta.regions.map((r) => platformLabel(r.id)).join(' · '),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="text-sm text-lichen">{label}</dt>
                    <dd
                      className={
                        label.startsWith('Region')
                          ? 'truncate text-right text-[15px] font-medium text-moon'
                          : 'num text-right font-display text-[1.45rem] leading-none text-moon'
                      }
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              {topUnits.length > 0 && (
                <div className="mt-6">
                  <div className="eyebrow text-fog">S tier champions</div>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {topUnits.map((u) => (
                      <div key={u.id} className="flex flex-col items-center gap-1.5">
                        <ChampionIcon id={u.id} size="md" />
                        <span className="num text-[11px] font-medium text-good">{fmt.place(u.avg)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {topComp && (
                <Link
                  href={`/comps/${topComp.id}`}
                  className="group mt-6 flex items-center justify-between gap-3 border-t border-line pt-5"
                >
                  <span className="min-w-0">
                    <span className="eyebrow block text-fog">Top comp</span>
                    <span className="mt-1 block truncate text-[15px] font-medium text-moon group-hover:text-wisp">
                      {topComp.name}
                    </span>
                  </span>
                  <span className="num shrink-0 text-right">
                    <span className="block font-display text-[1.45rem] leading-none text-good">{fmt.place(topComp.avg)}</span>
                    <span className="mt-1 block text-[11px] text-fog">{fmt.pct(topComp.top4, 0)} top 4</span>
                  </span>
                </Link>
              )}
            </>
          ) : (
            <>
              <span className="eyebrow text-fog">{env.riotApiKey ? 'Collecting' : 'Setup'}</span>
              <h2 className="mt-3 text-2xl text-moon">Stats are warming up</h2>
              <p className="mt-3 text-sm leading-relaxed text-lichen">
                {env.riotApiKey
                  ? 'MetaForge is collecting ranked games right now. Tier lists and the explorer fill in as soon as the first boards are stored, usually within a few minutes.'
                  : 'Add RIOT_API_KEY to .env.local and restart to start collecting. The collection, team builder and guides already work.'}
              </p>
            </>
          )}
        </aside>
      </section>

      {carousel.length >= 3 && (
        <div className="-mt-12">
          <StatsCarousel items={carousel} />
        </div>
      )}

      <section>
        <SectionHead label="01 · Collection" title={`Discover the ${set.name}`} />
        <Collection stats={stats} title={null} />
      </section>

      <section>
        <SectionHead label="02 · Tools" title="Three ways into the meta" />
        <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
          <ToolColumn
            n="i."
            href="/meta"
            title="Meta report"
            description="Comps grouped by their carries, plus champion, item and trait tier lists for the live patch."
            detail={graded ? `${graded} graded comps on ${scopeLabel}` : undefined}
          />
          <ToolColumn
            n="ii."
            href="/explorer"
            title="Stats explorer"
            description="Filter boards by champions, items, traits and level, and see how everything does on the boards that match."
            detail={hasData && data ? `${fmt.int(data.meta.total)} boards to query` : undefined}
          />
          <ToolColumn
            n="iii."
            href="/builder"
            title="Team builder"
            description="Drag champions onto the board, add items and emblems, and see which traits are active."
            detail={`${champions} champions, share links built in`}
          />
        </div>
      </section>

      {(guidesArt || ladderArt) && (
        <section>
          <SectionHead label="03 · Resources" title="More to explore" />
          <div className="grid gap-4 md:grid-cols-2">
            {guidesArt ? (
              <ImageTile
                href="/guides"
                art={guidesArt}
                label="Guides"
                title="Learn the set"
                description="Fundamentals, the item chart, emblem recipes and how this set's mechanics work."
              />
            ) : null}
            {ladderArt ? (
              <ImageTile
                href="/leaderboard"
                art={ladderArt}
                label="Ladder"
                title="Ranked ladder"
                description="Standings for every region, with each player's match history."
                position="center 35%"
              />
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
