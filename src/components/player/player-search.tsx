'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from 'react';
import { Search } from '@/components/icons';
import { Select } from '@/components/ui';
import { addRecent, setPlatform, usePrefs } from '@/lib/prefs';
import { PLATFORMS, platformLabel } from '@/lib/riot/regions';
import { cn, nameMatch, parseRiotId, riotIdToSlug } from '@/lib/utils';

interface PlayerSuggestion {
  gameName: string;
  tagLine: string;
  platform: string;
  tier: string | null;
  lp: number | null;
}

const NONE: PlayerSuggestion[] = [];
const keyOf = (p: PlayerSuggestion) => `${p.platform}:${p.gameName}#${p.tagLine}`;

/** Looks up a tagless name: known players it prefixes plus Riot's exact match on the region's usual tags. Throws on failure (server text only for 429). */
async function probePlayers(name: string, platform: string, signal?: AbortSignal): Promise<PlayerSuggestion[]> {
  const params = new URLSearchParams({ q: name.trim(), platform, probe: '1' });
  const r = await fetch(`/api/player/search?${params}`, { signal });
  const body = (await r.json().catch(() => ({}))) as { players?: PlayerSuggestion[]; error?: string };
  if (!r.ok) throw new Error(r.status === 429 && body.error ? body.error : 'The player search failed. Try again in a moment.');
  return body.players ?? [];
}

// Known players whose name starts with `value` (2-16 chars, Riot's limits, no #TAG), asked once typing pauses. While
// `pending` for this search and region, the last answer's players that still fit stay listed, so the list doesn't blink.
export function usePlayerSuggestions(value: string, platform: string): { players: PlayerSuggestion[]; pending: boolean } {
  const [last, setLast] = useState<{ q: string; platform: string; players: PlayerSuggestion[] } | null>(null);
  const q = value.trim().toLowerCase();
  const active = q.length >= 2 && q.length <= 16 && !q.includes('#');
  const answered = last?.q === q && last.platform === platform;
  useEffect(() => {
    if (!active || answered) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/player/search?${new URLSearchParams({ q, platform })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { players: [] }))
        .then((d: { players?: PlayerSuggestion[] }) => setLast({ q, platform, players: d.players ?? [] }))
        .catch(() => {
          if (!ctl.signal.aborted) setLast({ q, platform, players: [] });
        });
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [active, answered, q, platform]);
  const players = useMemo(() => {
    if (!active || !last || last.platform !== platform) return NONE;
    if (last.q === q) return last.players;
    const fit = last.players.filter((p) => nameMatch(p.gameName, q) >= 0);
    return fit.length ? fit : NONE;
  }, [active, last, platform, q]);
  return { players, pending: active && !answered };
}

function rankLabel(p: PlayerSuggestion) {
  if (!p.tier) return '';
  const tier = p.tier.charAt(0) + p.tier.slice(1).toLowerCase();
  return typeof p.lp === 'number' ? `${tier} · ${p.lp} LP` : tier;
}

export function PlayerSearch({ size = 'md', className, autoFocus }: { size?: 'md' | 'lg' | 'xl'; className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const { platform, recent } = usePrefs();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // By key, so the highlight stays on its player while answers change the list.
  const [hi, setHi] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const suggest = usePlayerSuggestions(value, platform);
  // What the last "Look up" found, for its region (typing clears it).
  const [probed, setProbed] = useState<{ platform: string; players: PlayerSuggestion[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const probe = useRef<AbortController | null>(null);
  const list = probed?.platform === platform ? probed.players : suggest.players;
  const at = hi === null ? -1 : list.findIndex((p) => keyOf(p) === hi);
  const showList = open && list.length > 0;
  const uid = useId();
  const listId = `${uid}-players`;
  const errorId = `${uid}-error`;

  // A running lookup is dropped when the name, region or component goes, else it would open a stale player.
  const stopProbe = () => {
    if (!probe.current) return;
    probe.current.abort();
    probe.current = null;
    setBusy(false);
  };
  useEffect(() => () => probe.current?.abort(), []);
  useEffect(() => stopProbe(), [platform]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (gameName: string, tagLine: string, region: string) => {
    setOpen(false);
    router.push(`/player/${region}/${riotIdToSlug(gameName, tagLine)}`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const id = parseRiotId(value);
    if (id) {
      setError(null);
      go(id.gameName, id.tagLine, platform);
      return;
    }
    const name = value.trim();
    if (name.length < 2 || name.length > 16 || name.includes('#')) {
      setError('Use the full Riot ID: Name#TAG');
      return;
    }
    // Suggestions still on their way may be stale: only a settled list is picked from.
    const settled = list !== suggest.players || !suggest.pending;
    const exact = settled ? list.filter((p) => p.gameName.toLowerCase() === name.toLowerCase()) : [];
    const pick = (showList ? list[at] : undefined) ?? (!settled ? undefined : list.length === 1 ? list[0] : exact.length === 1 ? exact[0] : undefined);
    if (pick) {
      go(pick.gameName, pick.tagLine, pick.platform);
      return;
    }
    if (settled && list.length > 0) {
      if (showList) setError('Pick a player below, or add the tag (Name#TAG).');
      else setOpen(true);
      return;
    }
    const ctl = new AbortController();
    probe.current = ctl;
    setBusy(true);
    setError(null);
    try {
      const found = await probePlayers(name, platform, ctl.signal);
      if (ctl.signal.aborted) return;
      if (found.length === 1) go(found[0].gameName, found[0].tagLine, found[0].platform);
      else if (found.length > 1) {
        setProbed({ platform, players: found });
        setHi(null);
        setOpen(true);
      } else {
        setError(`Couldn't find "${name}". Add the tag (Name#TAG), or pick the player's region and try again.`);
      }
    } catch (err) {
      // fetch itself fails with a TypeError (offline, blocked): its text means nothing to a visitor.
      if (!ctl.signal.aborted) setError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'The player search failed. Try again in a moment.');
    } finally {
      if (probe.current === ctl) {
        probe.current = null;
        setBusy(false);
      }
    }
  };

  const lg = size === 'lg' || size === 'xl';
  const xl = size === 'xl';
  return (
    <div className={className}>
      {/* Tabbing out closes the list. */}
      <div
        ref={box}
        className="relative"
        onBlur={(e) => {
          if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
      <form
        onSubmit={submit}
        aria-busy={busy || undefined}
        className={cn(
          'flex items-center gap-1.5 border border-line-strong bg-canopy transition focus-within:border-lichen/45',
          xl ? 'flex-wrap rounded-xl p-1.5 sm:flex-nowrap' : lg ? 'rounded-lg p-1.5' : 'rounded-lg p-1',
        )}
      >
        <select
          aria-label="Region"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={cn(
            'shrink-0 appearance-none rounded-md bg-bark font-semibold text-moon',
            xl ? 'h-12 px-4 text-[15px] sm:h-[52px] short:h-11' : lg ? 'h-10 px-3 text-sm' : 'h-8 px-3 text-[13px]',
          )}
        >
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setHi(null);
            setProbed(null);
            stopProbe();
            if (error) setError(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Escape') {
              if (!showList) return;
              e.preventDefault();
              setOpen(false);
              setHi(null);
            } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length > 0) {
              e.preventDefault();
              if (!showList) {
                setOpen(true);
                return;
              }
              const i = e.key === 'ArrowDown' ? (at + 1) % list.length : at <= 0 ? list.length - 1 : at - 1;
              setHi(keyOf(list[i]));
              // Only for keys, so the list never jumps under the mouse.
              document.getElementById(`${listId}-${i}`)?.scrollIntoView({ block: 'nearest' });
            }
          }}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showList && at >= 0 ? `${listId}-${at}` : undefined}
          size={1}
          placeholder="Name or Name#TAG"
          aria-label="Riot ID"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-moon outline-none placeholder:text-fog',
            xl ? 'h-12 px-2 text-base sm:h-[52px] sm:text-[17px] short:h-11 short:text-base' : lg ? 'h-10 px-1 text-[15px]' : 'h-8 px-1 text-sm',
          )}
        />
        <button
          type="submit"
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-md bg-wisp font-semibold text-[#1b1306] transition-colors hover:bg-[#ecc57c]',
            xl ? 'h-12 w-full justify-center px-6 text-[15px] sm:h-[52px] sm:w-auto short:h-11' : lg ? 'h-10 px-5 text-sm' : 'h-8 px-3.5 text-[13px]',
          )}
        >
          <Search className={cn(xl ? 'size-5' : 'size-4', busy && 'animate-pulse-soft')} aria-hidden />
          <span className={lg ? '' : 'sr-only sm:not-sr-only'}>{busy ? 'Searching…' : 'Look up'}</span>
        </button>
      </form>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Players"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-auto rounded-lg border border-line-strong bg-canopy p-1 text-left shadow-xl"
        >
          {list.map((p, i) => (
            <li key={keyOf(p)} id={`${listId}-${i}`} role="option" aria-selected={i === at}>
              {/* Picked with the arrows from the field, so not a stop of its own for Tab. */}
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setHi(keyOf(p))}
                onClick={() => go(p.gameName, p.tagLine, p.platform)}
                className={cn('flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm', i === at ? 'bg-bark' : 'hover:bg-bark')}
              >
                <span className="min-w-0 truncate text-moon">
                  {p.gameName}
                  <span className="text-fog">#{p.tagLine}</span>
                </span>
                <span className="shrink-0 text-xs text-fog">
                  {platformLabel(p.platform)}
                  {rankLabel(p) && ` · ${rankLabel(p)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-bloom">{error}</p>
      )}
      {!error && recent.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-lichen">
          <span className="text-fog">Recent</span>
          {recent.map((r) => (
            <button
              key={`${r.gameName}#${r.tagLine}`}
              type="button"
              onClick={() => go(r.gameName, r.tagLine, r.platform)}
              className="rounded-full border border-line-strong px-2.5 py-1 hover:border-lichen/40 hover:text-moon"
            >
              {r.gameName}
              <span className="text-fog">#{r.tagLine}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RegionSelect({ value, allowAll = false }: { value: string; allowAll?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <Select
      label="Region"
      value={value}
      className={cn(pending && 'opacity-60')}
      onChange={(e) => {
        const q = new URLSearchParams(params.toString());
        q.set('region', e.target.value);
        if (e.target.value !== 'all') setPlatform(e.target.value);
        start(() => router.push(`${pathname}?${q.toString()}`, { scroll: false }));
      }}
    >
      {allowAll && <option value="all">All regions</option>}
      {PLATFORMS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.label})
        </option>
      ))}
    </Select>
  );
}

export function RememberPlayer({ gameName, tagLine, platform }: { gameName: string; tagLine: string; platform: string }) {
  useEffect(() => addRecent({ gameName, tagLine, platform }), [gameName, tagLine, platform]);
  return null;
}
