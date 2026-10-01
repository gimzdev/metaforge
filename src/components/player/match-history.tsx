'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, RefreshCw, TriangleAlert } from '@/components/icons';
import { ChampionIcon, TraitBadge } from '@/components/game/entities';
import { RANKED_QUEUE } from '@/config/game';
import { GameImage } from '@/components/game/game-image';
import { Skeleton } from '@/components/ui';
import type { BoardView, MatchView } from '@/lib/players';
import { platformFromMatchId } from '@/lib/riot/regions';
import { currentIndex } from '@/lib/static';
import { addPlacement, summarize, type PublicTotals } from '@/lib/totals';
import { cn, deltaTone, fmt, placementTone, riotIdToSlug, sleep, toneText } from '@/lib/utils';

interface Page {
  matches: MatchView[];
  next: number | null;
}

/* ── Loading pages of games ─────────────────────────────── */

/**
 * Pages already loaded per player: shown at once when coming back (and asked for again in the
 * background once they are a minute old), forgotten five minutes after leaving the player.
 */
const cache = new Map<string, { pages: Page[]; at: number; left: number | null }>();
const FRESH_MS = 60_000;
const KEEP_MS = 5 * 60_000;

function cachedPages(key: string): Page[] {
  const hit = cache.get(key);
  if (hit?.left && Date.now() - hit.left > KEEP_MS) cache.delete(key);
  return cache.get(key)?.pages ?? [];
}

async function fetchPage(puuid: string, platform: string, start: number, signal: AbortSignal): Promise<Page> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`/api/player/matches?puuid=${encodeURIComponent(puuid)}&platform=${platform}&start=${start}&count=20`, {
        signal,
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as Page & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Could not load matches (${res.status})`);
      return json;
    } catch (error) {
      if (signal.aborted || attempt > 0) throw error;
      await sleep(1000); // one retry
    }
  }
}

function useMatchPages(puuid: string, platform: string) {
  const key = `${puuid}|${platform}`;
  const [pages, setPages] = useState<Page[]>(() => cachedPages(key));
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef({ pages, ctl: null as AbortController | null });

  const save = useCallback(
    (next: Page[]) => {
      live.current.pages = next;
      cache.set(key, { pages: next, at: Date.now(), left: null });
      setPages(next);
    },
    [key],
  );
  /** A new request; one still running is dropped. */
  const begin = useCallback(() => {
    live.current.ctl?.abort();
    const ctl = new AbortController();
    live.current.ctl = ctl;
    setError(null);
    return ctl;
  }, []);

  /** One more page (start 0 starts over). */
  const load = useCallback(
    (start: number) => {
      const ctl = begin();
      setFetching(true);
      fetchPage(puuid, platform, start, ctl.signal)
        .then((page) => {
          if (!ctl.signal.aborted) save(start === 0 ? [page] : [...live.current.pages, page]);
        })
        .catch((e: Error) => {
          if (!ctl.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!ctl.signal.aborted) setFetching(false);
        });
    },
    [puuid, platform, save, begin],
  );

  /** Ask again for as many pages as are shown and swap them in together; the old ones stay meanwhile. */
  const refresh = useCallback(
    (count: number) => {
      const ctl = begin();
      (async () => {
        const fresh: Page[] = [];
        let start: number | null = 0;
        while (start !== null && fresh.length < count) {
          const page: Page = await fetchPage(puuid, platform, start, ctl.signal);
          fresh.push(page);
          start = page.next;
        }
        return fresh;
      })()
        .then((fresh) => {
          if (!ctl.signal.aborted) save(fresh);
        })
        .catch((e: Error) => {
          if (!ctl.signal.aborted) setError(e.message);
        });
    },
    [puuid, platform, save, begin],
  );

  useEffect(() => {
    const state = live.current;
    const hit = cache.get(key);
    if (hit) hit.left = null;
    if (!state.pages.length) load(0);
    else if (hit && Date.now() - hit.at >= FRESH_MS) refresh(state.pages.length);
    return () => {
      state.ctl?.abort();
      const left = cache.get(key);
      if (left) left.left = Date.now();
    };
  }, [key, load, refresh]);

  const last = pages[pages.length - 1];
  return {
    pages,
    pending: !pages.length && !error,
    error,
    fetching,
    next: last?.next ?? null,
    load,
  };
}

const PLACE_STYLE: Record<number, string> = {
  1: 'text-firefly',
  2: 'text-good',
  3: 'text-good',
  4: 'text-good',
  8: 'text-bloom',
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
  const index = currentIndex();
  const traits = [...board.traits]
    .filter((t) => index.trait(t.id))
    .sort((a, b) => b.style - a.style || b.n - a.n)
    .slice(0, 5);
  const units = [...board.units].sort((a, b) => {
    const ca = index.champion(a.id)?.cost ?? 0;
    const cb = index.champion(b.id)?.cost ?? 0;
    return b.items.length - a.items.length || cb - ca || b.star - a.star;
  });
  const augments = compact ? [] : board.augments.map((a) => index.augment(a)).filter((a) => a != null);
  return (
    <div className="flex min-w-0 flex-col gap-2.5 md:flex-row md:items-center md:gap-5">
      {currentSet && traits.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1 md:w-48">
          {traits.map((t) => (
            <TraitBadge key={t.id} id={t.id} tier={t.tier} matchStyle={t.style} size={22} />
          ))}
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-3.5 pt-1.5">
        {units.map((u, i) =>
          index.champion(u.id) ? (
            <ChampionIcon key={`${u.id}-${i}`} id={u.id} size={compact ? 'sm' : 'md'} star={u.star} items={u.items} even />
          ) : (
            <UnitFallback key={`${u.id}-${i}`} id={u.id} star={u.star} />
          ),
        )}
        {augments.length > 0 && (
          <span className="ml-1.5 flex gap-1 self-center border-l border-line pl-3">
            {augments.map((aug) => (
              <GameImage key={aug.name} src={aug.icon} alt={aug.name} className="size-6 rounded-md opacity-80" />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, puuid, setNumber }: { match: MatchView; puuid: string; setNumber: number }) {
  const [open, setOpen] = useState(false);
  const me = match.me;
  if (!me) return null;
  const currentSet = match.setNumber === setNumber;
  const platform = platformFromMatchId(match.id, 'na1');
  return (
    <article className="surface relative overflow-hidden rounded-xl">
      <span className={cn('absolute inset-y-0 left-0 w-1', placeBar(me.placement))} aria-hidden />
      <div
        className="flex cursor-pointer flex-col gap-3 py-3.5 pl-5 pr-4 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:gap-5 sm:pr-5"
        onClick={(e) => {
          // The whole row opens the lobby; links, buttons and a text selection keep their own behaviour.
          if ((e.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return;
          setOpen((o) => !o);
        }}
      >
        <div className="flex shrink-0 items-center gap-4 sm:w-40">
          <div className={cn('num font-display text-3xl font-semibold', PLACE_STYLE[me.placement] ?? 'text-lichen')}>{fmt.ordinal(me.placement)}</div>
          <div className="text-xs leading-relaxed text-lichen">
            <div className="font-medium text-moon">{match.queueLabel}</div>
            <div suppressHydrationWarning>{fmt.ago(match.datetime)}</div>
            <div className="num">
              {fmt.duration(match.length)}, level {me.level}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {!currentSet && <div className="mb-1 text-xs text-fog">Set {match.setNumber} game</div>}
          <BoardRow board={me} currentSet={currentSet} />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex h-8 shrink-0 items-center gap-1 self-start rounded-lg px-2.5 text-xs font-medium text-fog hover:bg-white/5 hover:text-moon sm:self-center"
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

/** Games in the recent-form banner, and how many are loaded up front before the season walk starts. */
const SAMPLE = 20;
const DEEP = 40;

/** Totals per player and set as last received, so coming back to one shows them at once. */
const totalsCache = new Map<string, PublicTotals>();

/** Asks the server to walk the player's ranked games of one set a step at a time until it has counted them all. */
function useTotals(puuid: string, platform: string, set: number, ready: boolean) {
  const key = `${puuid}:${set}`;
  const [state, setState] = useState<{ key: string; totals: PublicTotals | null }>(() => ({ key, totals: totalsCache.get(key) ?? null }));
  const [running, setRunning] = useState(false);
  useEffect(() => {
    setState({ key, totals: totalsCache.get(key) ?? null });
    if (!ready) return;
    const ctl = new AbortController();
    (async () => {
      let failures = 0;
      setRunning(true);
      while (!ctl.signal.aborted) {
        try {
          const res = await fetch(`/api/player/totals?puuid=${encodeURIComponent(puuid)}&platform=${platform}&set=${set}`, { signal: ctl.signal, cache: 'no-store' });
          if (!res.ok) throw new Error(String(res.status));
          const json = (await res.json()) as { totals: PublicTotals; done: boolean; retryIn: number };
          totalsCache.set(key, json.totals);
          setState({ key, totals: json.totals });
          failures = 0;
          if (json.done) break;
          await sleep(Math.max(150, json.retryIn || 1000));
        } catch {
          if (ctl.signal.aborted || ++failures >= 3) break;
          await sleep(2000 * failures);
        }
      }
      if (!ctl.signal.aborted) setRunning(false);
    })();
    return () => {
      ctl.abort();
      setRunning(false);
    };
  }, [key, puuid, platform, set, ready]);
  return { totals: state.key === key ? state.totals : null, running };
}

export function MatchHistory({
  puuid,
  platform,
  setNumber,
  identity,
  ranks,
  totals,
}: {
  puuid: string;
  platform: string;
  setNumber: number;
  /** Server-rendered pieces of the player card: who they are, and their ranked queues. */
  identity: ReactNode;
  /** The current ranked queues (Riot only reports the current rank, not the one held in earlier sets). */
  ranks: ReactNode;
  /** Ranked totals for the season (Riot reports top 4 finishes, not first places). */
  totals: { games: number; top4: number } | null;
}) {
  const index = currentIndex();
  const query = useMatchPages(puuid, platform);

  // Only games that include this player can be shown (Riot always includes them; be defensive anyway).
  const matches = useMemo(() => query.pages.flatMap((p) => p.matches).filter((m) => m.me), [query.pages]);
  const mine = useMemo(() => matches.map((m) => m.me).filter((b): b is BoardView => Boolean(b)), [matches]);
  const loaded = query.pages.reduce((n, p) => n + p.matches.length, 0);

  // Recent form uses the last 20 games and the card's win rate the last 40, 20 per request.
  const { next, fetching, error, load } = query;
  useEffect(() => {
    if (next !== null && !fetching && !error && loaded < DEEP) load(next);
  }, [next, fetching, error, loaded, load]);

  const [visible, setVisible] = useState(SAMPLE);
  const [viewSet, setViewSet] = useState(setNumber);
  const isCurrent = viewSet === setNumber;

  // The last 20 games: the averages, the most played champions and how they finished.
  const summary = useMemo(() => {
    const sample = mine.slice(0, SAMPLE);
    if (!sample.length) return null;
    const spread = Array.from({ length: 8 }, () => 0);
    const played = new Map<string, { n: number; total: number }>();
    for (const b of sample) {
      spread[Math.min(8, Math.max(1, b.placement)) - 1] += 1;
      for (const id of new Set(b.units.map((u) => u.id))) {
        if (!index.champion(id)) continue;
        const e = played.get(id) ?? { n: 0, total: 0 };
        e.n += 1;
        e.total += b.placement;
        played.set(id, e);
      }
    }
    const top4Count = spread[0] + spread[1] + spread[2] + spread[3];
    return {
      games: sample.length,
      avg: sample.reduce((sum, b) => sum + b.placement, 0) / sample.length,
      top1: spread[0] / sample.length,
      wins: spread[0],
      top4Count,
      top4: top4Count / sample.length,
      spread,
      champions: [...played.entries()]
        .map(([id, e]) => ({ id, n: e.n, avg: e.total / e.n }))
        .filter((f) => f.n >= 2)
        .sort((x, y) => y.n - x.n || x.avg - y.avg)
        .slice(0, 4),
      recent: sample.map((b) => b.placement),
    };
  }, [mine, index]);

  // Totals for the chosen set: the server walks the player's ranked games of it. For the current set, the loaded
  // games stand in until it has counted more than they hold, and Riot's own ranked totals give top 4 and games.
  const walk = useTotals(puuid, platform, viewSet, true);
  const local = useMemo(() => {
    if (!isCurrent) return null;
    const t = { games: 0, sum: 0, spread: Array.from({ length: 8 }, () => 0) };
    for (const m of matches) if (m.me && m.queue === RANKED_QUEUE && m.setNumber === setNumber) addPlacement(t, m.me.placement);
    return summarize(t);
  }, [matches, setNumber, isCurrent]);
  const server = walk.totals ? summarize(walk.totals) : null;
  const deep = server && (!local || server.games >= local.games) ? server : local;
  const riotGames = isCurrent ? totals?.games ?? 0 : 0;
  const counted = deep?.games ?? 0;
  const partial = isCurrent && !walk.running && walk.totals?.done && riotGames > 0 && riotGames - counted >= 3;
  const counting = walk.running && (isCurrent ? riotGames > 0 && counted < riotGames : true);
  const empty = !isCurrent && !walk.running && walk.totals?.done && !deep;
  const sets = Array.from({ length: setNumber }, (_, i) => setNumber - i);
  // Sets the player has games in (known once the server has looked), so the others can be greyed out.
  // Asked once the first totals are in (so they are not slowed down), or after a few seconds regardless. Until it
  // answers, only the current set can be picked; if it fails, every set can.
  const [played, setPlayed] = useState<Set<number> | null>(null);
  const [askSets, setAskSets] = useState(false);
  const haveTotals = walk.totals !== null;
  useEffect(() => {
    if (haveTotals) {
      setAskSets(true);
      return;
    }
    const timer = setTimeout(() => setAskSets(true), 4000);
    return () => clearTimeout(timer);
  }, [haveTotals]);
  useEffect(() => {
    if (!askSets) return;
    const ctl = new AbortController();
    fetch(`/api/player/sets?puuid=${encodeURIComponent(puuid)}&platform=${platform}`, { signal: ctl.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: { sets: number[] }) => setPlayed(new Set(json.sets)))
      .catch(() => !ctl.signal.aborted && setPlayed(new Set(sets)));
    return () => ctl.abort();
  }, [askSets, puuid, platform]); // eslint-disable-line react-hooks/exhaustive-deps

  const tile = (p: number, i: number) => (
    <span
      key={i}
      className={cn(
        'num grid h-8 place-items-center rounded-md text-xs font-bold',
        p === 0 ? 'bg-bark/60 text-transparent' : p === 1 ? 'bg-firefly text-night' : p <= 4 ? 'bg-good text-night' : p === 8 ? 'bg-bloom text-night' : 'bg-lichen text-night',
      )}
    >
      {p || '·'}
    </span>
  );
  const stat = (id: string, name: string, value: string, tone = '', size = 'text-2xl') => (
    <div key={id} className="min-w-0">
      <dt className="text-xs text-lichen">{name}</dt>
      <dd className={cn('num mt-1 font-display leading-none', size, tone || 'text-moon')}>{value}</dd>
    </div>
  );

  const top1Text = deep ? fmt.pct(deep.top1, deep.top1 >= 0.9995 ? 0 : 1) : '–';
  const useRiot = isCurrent && totals;
  const note = counting
    ? isCurrent
      ? `Counting your ranked games… ${fmt.int(counted)} of ${fmt.int(riotGames)}`
      : `Counting ranked games… ${fmt.int(counted)} so far`
    : partial
      ? `Win rate and average from ${fmt.int(counted)} of ${fmt.int(riotGames)} ranked games`
      : empty
        ? `No ranked games found for Set ${viewSet}`
        : '';

  // The player and their totals for the chosen set. Riot reports the current season's top 4 and games; first
  // places and average place come from the games themselves.
  const side = (
    <aside aria-label="Player" className="surface rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{identity}</div>
        <label className="shrink-0">
          <span className="sr-only">Set</span>
          <select
            value={viewSet}
            onChange={(e) => setViewSet(Number(e.target.value))}
            className="cursor-pointer rounded-md border hairline bg-transparent px-2 py-1 text-xs font-medium text-lichen hover:text-moon focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-wisp"
          >
            {sets.map((n) => (
              <option key={n} value={n} disabled={n !== setNumber && !played?.has(n)} className="bg-night text-moon disabled:text-fog">
                Set {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 border-t hairline">
        {isCurrent ? (
          ranks
        ) : (
          // Riot only reports the current rank, so a past set's is not known.
          <dl className="divide-y divide-line">
            {['Ranked', 'Hyper Roll', 'Double Up'].map((queue) => (
              <div key={queue} className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="text-sm text-lichen">{queue}</dt>
                <dd className="text-sm text-fog">Unknown</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <dl className="grid grid-cols-4 gap-x-2 border-t hairline pt-4">
        {stat('avg', 'Avg place', deep ? fmt.place(deep.avg) : '–', deep ? toneText[placementTone(deep.avg)] : '', 'text-[1.4rem]')}
        {stat('top1', 'Win rate', top1Text, '', 'text-[1.4rem]')}
        {stat('top4', 'Top 4', useRiot ? fmt.pct(totals.top4, 1) : deep ? fmt.pct(deep.top4, 1) : '–', '', 'text-[1.4rem]')}
        {stat('games', 'Games', useRiot ? fmt.int(totals.games) : deep ? fmt.int(deep.games) : '–', '', 'text-[1.4rem]')}
      </dl>
      {note && (
        <p className={cn('mt-3 text-[11px] text-fog', counting && 'animate-pulse')} aria-live="polite">
          {note}
        </p>
      )}
    </aside>
  );

  // Top right, beside the player: the last 20 games in four cells (numbers, most played, results, finishes).
  const recentSpread = summary?.spread ?? Array.from({ length: 8 }, () => 0);
  const spreadTop = Math.max(1, ...recentSpread);
  const label = 'font-sans text-xs font-medium uppercase tracking-wider text-fog';
  const cell = 'flex flex-col p-5 sm:p-6';
  const fig = (name: string, value: string, sub = '', tone = '', subTone = 'text-fog') => (
    <div key={name} className="min-w-0">
      <dt className="text-xs text-lichen">{name}</dt>
      <dd className={cn('num mt-1.5 font-display text-[1.7rem] leading-none', tone || 'text-moon')}>{value}</dd>
      <div className={cn('num mt-1.5 min-h-4 text-[11px]', subTone)}>{sub}</div>
    </div>
  );
  // How the last 20 compare with the whole set: minus is better (a lower average place).
  const toTotal = summary && deep && deep.games > summary.games ? summary.avg - deep.avg : null;
  const recent = (
    <section aria-label="Recent games" className="surface overflow-hidden rounded-xl">
      <div className="grid lg:grid-cols-2">
        <div className={cell}>
          <h2 className={label}>Last {SAMPLE} games</h2>
          <dl className="my-auto grid grid-cols-3 gap-x-4 pt-4">
            {fig(
              'Avg place',
              summary ? fmt.place(summary.avg) : '–',
              toTotal === null ? '' : `${Math.abs(toTotal) < 0.005 ? '' : toTotal > 0 ? '+' : '−'}${Math.abs(toTotal).toFixed(2)} to total`,
              summary ? toneText[placementTone(summary.avg)] : '',
              toTotal === null ? '' : deltaTone(toTotal),
            )}
            {fig('Win rate', summary ? fmt.pct(summary.top1, 0) : '–', summary ? `${summary.wins} out of ${summary.games}` : '')}
            {fig('Top 4', summary ? fmt.pct(summary.top4, 0) : '–', summary ? `${summary.top4Count} out of ${summary.games}` : '')}
          </dl>
        </div>

        <div className={cn(cell, 'border-t hairline lg:border-l lg:border-t-0 lg:border-line')}>
          <div className={label}>Most played</div>
          {summary && summary.champions.length > 0 ? (
            <ul className="my-auto grid grid-cols-2 gap-x-5 gap-y-3 pt-4">
              {summary.champions.map((f) => (
                <li key={f.id} className="flex items-center gap-3">
                  <ChampionIcon id={f.id} size="md" />
                  <div className="num leading-tight">
                    <div className="text-sm font-medium text-moon">{f.n} games</div>
                    <div className={cn('mt-0.5 text-xs', toneText[placementTone(f.avg)])}>{fmt.place(f.avg)} avg</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="my-auto pt-4 text-sm text-fog">No repeat picks yet.</p>
          )}
        </div>

        <div className={cn(cell, 'border-t hairline')}>
          <div className={label}>Placements</div>
          <div className="my-auto grid grid-cols-10 gap-1.5 pt-4">{Array.from({ length: SAMPLE }, (_, i) => summary?.recent[i] ?? 0).map(tile)}</div>
        </div>

        <div className={cn(cell, 'border-t hairline lg:border-l lg:border-line')}>
          <div className={label}>Finishes</div>
          <div className="my-auto box-content grid h-[4.75rem] grid-cols-8 items-end gap-2 pt-4" aria-label="Finishes by place">
            {recentSpread.map((n, i) => (
              <div key={i} className="flex h-full flex-col items-center justify-end gap-1.5">
                <div
                  className={cn('w-full rounded-sm', i === 0 ? 'bg-firefly' : i < 4 ? 'bg-good' : i === 7 ? 'bg-bloom' : 'bg-lichen', n === 0 && 'opacity-25')}
                  style={{ height: `${n === 0 ? 5 : Math.max(14, (n / spreadTop) * 100)}%`, maxHeight: 'calc(100% - 1.1rem)' }}
                />
                <span className="num text-[10px] leading-none text-fog">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const shell = (body: ReactNode) => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        {side}
        {recent}
      </div>
      {body}
    </div>
  );

  if (query.pending) {
    return shell(
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>,
    );
  }

  if (query.error && !matches.length) {
    return shell(
      <div className="flex items-start gap-3 rounded-xl border border-bloom/30 bg-bloom/10 p-5 text-sm">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-bloom" aria-hidden />
        <div className="flex-1">
          <div className="font-semibold text-moon">Match history unavailable</div>
          <div className="mt-1 text-lichen">{query.error}</div>
        </div>
        <button type="button" onClick={() => query.load(0)} className="inline-flex items-center gap-1.5 text-sm font-medium text-wisp">
          <RefreshCw className="size-4" aria-hidden />
          Retry
        </button>
      </div>,
    );
  }

  if (!matches.length) {
    return shell(
      <div className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-lichen">
        No recent TFT games on record for this account.
      </div>,
    );
  }

  return shell(
    <>
      <div>
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Match history</h2>
        <div className="space-y-2.5">
          {matches.slice(0, visible).map((m) => (
            <MatchCard key={m.id} match={m} puuid={puuid} setNumber={setNumber} />
          ))}
        </div>
      </div>

      {(matches.length > visible || query.next !== null) && (
        <button
          type="button"
          onClick={() => {
            setVisible((v) => v + 10);
            if (matches.length < visible + 10 && query.next !== null && !query.fetching) query.load(query.next);
          }}
          disabled={query.fetching}
          className="w-full rounded-xl border hairline py-3 text-sm font-medium text-lichen hover:bg-white/[0.03] hover:text-moon disabled:opacity-50"
        >
          {query.fetching ? 'Loading…' : 'Load more games'}
        </button>
      )}
      {query.error && matches.length > 0 && <p className="text-center text-sm text-bloom">{query.error}</p>}
    </>,
  );
}
