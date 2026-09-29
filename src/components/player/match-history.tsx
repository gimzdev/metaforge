'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, TriangleAlert } from 'lucide-react';
import { useStatic } from '@/components/providers';
import { ChampionIcon, TraitBadge } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { Skeleton } from '@/components/ui/primitives';
import type { BoardView, MatchView } from '@/lib/players';
import { platformFromMatchId } from '@/lib/match-id';
import { cn, fmt, riotIdToSlug } from '@/lib/utils';

interface Page {
  matches: MatchView[];
  next: number | null;
}

const PLACE_STYLE: Record<number, string> = {
  1: 'text-firefly',
  2: 'text-good',
  3: 'text-good',
  4: 'text-good',
};

function placeBar(p: number) {
  if (p === 1) return 'bg-firefly';
  if (p <= 4) return 'bg-good';
  if (p === 8) return 'bg-bloom';
  return 'bg-fog/60';
}

function UnitFallback({ id, star }: { id: string; star: number }) {
  const name = id.replace(/^tft\d*_/i, '').replace(/_/g, ' ');
  return (
    <span title={`${name} (${star}★)`} className="grid size-[30px] place-items-center rounded-md bg-bark text-[9px] font-semibold uppercase text-lichen">
      {name.slice(0, 3)}
    </span>
  );
}

function BoardRow({ board, compact, currentSet }: { board: BoardView; compact?: boolean; currentSet: boolean }) {
  const index = useStatic();
  const traits = [...board.traits]
    .filter((t) => index.trait(t.id))
    .sort((a, b) => b.style - a.style || b.n - a.n)
    .slice(0, compact ? 5 : 8);
  const units = [...board.units].sort((a, b) => {
    const ca = index.champion(a.id)?.cost ?? 0;
    const cb = index.champion(b.id)?.cost ?? 0;
    return b.items.length - a.items.length || cb - ca || b.star - a.star;
  });
  return (
    <div className="flex min-w-0 flex-col gap-2.5 md:flex-row md:items-center md:gap-4">
      {currentSet && traits.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1 md:w-44">
          {traits.map((t) => (
            <TraitBadge key={t.id} id={t.id} tier={t.tier} matchStyle={t.style} size={22} />
          ))}
        </div>
      )}
      <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-3.5 pt-1.5">
        {units.map((u, i) =>
          index.champion(u.id) ? (
            <ChampionIcon key={`${u.id}-${i}`} id={u.id} size={compact ? 'md' : 'ml'} star={u.star} items={u.items} even />
          ) : (
            <UnitFallback key={`${u.id}-${i}`} id={u.id} star={u.star} />
          ),
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, puuid, setNumber }: { match: MatchView; puuid: string; setNumber: number }) {
  const [open, setOpen] = useState(false);
  const index = useStatic();
  const me = match.me;
  if (!me) return null;
  const currentSet = match.setNumber === setNumber;
  const platform = platformFromMatchId(match.id);
  return (
    <article className="surface relative overflow-hidden rounded-xl">
      <span className={cn('absolute inset-y-0 left-0 w-1', placeBar(me.placement))} aria-hidden />
      <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-4 sm:w-40">
          <div className={cn('num font-display text-3xl font-semibold', PLACE_STYLE[me.placement] ?? 'text-lichen')}>
            {fmt.ordinal(me.placement)}
          </div>
          <div className="text-xs leading-relaxed text-lichen">
            <div className="font-medium text-moon">{match.queueLabel}</div>
            <div>{fmt.ago(match.datetime)}</div>
            <div className="num">
              {fmt.duration(match.length)}, level {me.level}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {!currentSet && <div className="mb-1 text-xs text-fog">Set {match.setNumber} game</div>}
          <BoardRow board={me} currentSet={currentSet} />
          {me.augments.length > 0 && (
            <div className="mt-2 flex gap-1">
              {me.augments.map((a) => {
                const aug = index.augment(a);
                return aug ? <GameImage key={a} src={aug.icon} alt={aug.name} className="size-7 rounded-md" /> : null;
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex h-8 shrink-0 items-center gap-1 self-start rounded-lg px-2.5 text-xs font-medium text-lichen hover:bg-white/5 hover:text-moon sm:self-center"
        >
          Lobby
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="border-t hairline bg-night/40">
          {match.lobby.map((b) => (
            <div
              key={b.puuid}
              className={cn('flex flex-col gap-2 border-t hairline px-5 py-3 first:border-t-0 md:flex-row md:items-center md:gap-4', b.puuid === puuid && 'bg-wisp/[0.05]')}
            >
              <div className="flex shrink-0 items-center gap-3 md:w-56">
                <span className={cn('num w-8 font-display text-lg font-semibold', PLACE_STYLE[b.placement] ?? 'text-fog')}>
                  {b.placement}
                </span>
                {b.gameName && b.tagLine ? (
                  <Link
                    href={`/player/${platform}/${riotIdToSlug(b.gameName, b.tagLine)}`}
                    className="min-w-0 truncate text-sm font-medium hover:text-wisp"
                  >
                    {b.gameName}
                    <span className="text-fog">#{b.tagLine}</span>
                  </Link>
                ) : (
                  <span className="text-sm text-fog">Unknown player</span>
                )}
                <span className="num ml-auto text-xs text-fog md:hidden">Lv {b.level}</span>
              </div>
              <div className="min-w-0 flex-1">
                <BoardRow board={b} compact currentSet={currentSet} />
              </div>
              <span className="num hidden shrink-0 text-xs text-fog md:block">Lv {b.level}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function MatchHistory({ puuid, platform, setNumber }: { puuid: string; platform: string; setNumber: number }) {
  const index = useStatic();
  const query = useInfiniteQuery({
    queryKey: ['matches', puuid, platform],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<Page> => {
      const res = await fetch(`/api/player/matches?puuid=${encodeURIComponent(puuid)}&platform=${platform}&start=${pageParam}&count=10`, {
        signal,
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as Page & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Could not load matches (${res.status})`);
      return json;
    },
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: 60_000,
    retry: 1,
  });

  // Only games that include this player can be shown (Riot always includes them; be defensive anyway).
  const matches = useMemo(() => (query.data?.pages.flatMap((p) => p.matches) ?? []).filter((m) => m.me), [query.data]);
  const mine = matches.map((m) => m.me).filter((b): b is BoardView => Boolean(b));

  const summary = useMemo(() => {
    if (!mine.length) return null;
    const avg = mine.reduce((s, b) => s + b.placement, 0) / mine.length;
    const top4 = mine.filter((b) => b.placement <= 4).length / mine.length;
    const wins = mine.filter((b) => b.placement === 1).length;
    const traitCount = new Map<string, number>();
    const unitCount = new Map<string, number>();
    for (const b of mine) {
      for (const t of b.traits) if (t.style >= 1 && index.trait(t.id)?.kind !== 'unique') traitCount.set(t.id, (traitCount.get(t.id) ?? 0) + 1);
      for (const u of new Set(b.units.map((x) => x.id))) if (index.champion(u)) unitCount.set(u, (unitCount.get(u) ?? 0) + 1);
    }
    const topTraits = [...traitCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const topUnits = [...unitCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { avg, top4, wins, games: mine.length, topTraits, topUnits, recent: mine.slice(0, 20).map((b) => b.placement) };
  }, [mine, index]);

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (query.isError && !matches.length) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-bloom/30 bg-bloom/10 p-5 text-sm">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-bloom" aria-hidden />
        <div className="flex-1">
          <div className="font-semibold text-moon">Match history unavailable</div>
          <div className="mt-1 text-lichen">{(query.error as Error).message}</div>
        </div>
        <button type="button" onClick={() => query.refetch()} className="inline-flex items-center gap-1.5 text-sm font-medium text-wisp">
          <RefreshCw className="size-4" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-lichen">
        No recent TFT games on record for this account.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="surface grid gap-5 rounded-xl p-4 sm:p-5 lg:grid-cols-[auto_1fr_auto]">
          <div className="grid grid-cols-3 gap-5">
            <div>
              <div className="text-xs text-lichen">Avg place</div>
              <div className="num mt-1 font-display text-[1.6rem] leading-none">{fmt.place(summary.avg)}</div>
            </div>
            <div>
              <div className="text-xs text-lichen">Top 4 rate</div>
              <div className="num mt-1 font-display text-[1.6rem] leading-none">{fmt.pct(summary.top4, 0)}</div>
            </div>
            <div>
              <div className="text-xs text-lichen" title="First-place finishes">
                Win rate
              </div>
              <div className="num mt-1 font-display text-[1.6rem] leading-none">{fmt.pct(summary.wins / summary.games, 0)}</div>
              <div className="mt-1 text-[11px] text-fog">
                {summary.wins} of {summary.games} games
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-lichen">Last {summary.recent.length} games</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {summary.recent.map((p, i) => (
                <span
                  key={i}
                  className={cn(
                    'num grid size-7 place-items-center rounded-md text-xs font-bold',
                    p === 1 ? 'bg-firefly text-night' : p <= 4 ? 'bg-good/15 text-good' : 'bg-bark text-lichen',
                  )}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {summary.topTraits.map(([id, n]) => (
                <TraitBadge key={id} id={id} tier={1} size={22} count={n} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {summary.topUnits.map(([id]) => (
                <ChampionIcon key={id} id={id} size="xs" />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} puuid={puuid} setNumber={setNumber} />
        ))}
      </div>

      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="w-full rounded-xl border hairline py-3 text-sm font-medium text-lichen hover:bg-white/[0.03] hover:text-moon disabled:opacity-50"
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more games'}
        </button>
      )}
      {query.isError && matches.length > 0 && (
        <p className="text-center text-sm text-bloom">{(query.error as Error).message}</p>
      )}
    </div>
  );
}
