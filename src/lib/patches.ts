// Which patch and which set are live, read from the collected games instead of a date in the code.
//
// Every stored ranked match carries Riot's game version ("… Version 16.22.725.1234 … <Releases/16.22>") and its set
// number. A game version not seen before is a new patch, from its first game on, server by server (a patch reaches
// the regions over several hours); ranked games on a newer set number move the whole site to that set. The names come
// from the calendar in config/game.ts (Riot's schedule) or, for a patch it does not list, from its place in the set,
// which is how Riot numbers them. What was seen is remembered in the store's key-value table, past the days matches
// are kept. A hotfix or B-patch keeps the game's major.minor version, so its games stay with their patch.
//
// Only ranked games the site stores count (Riot's live servers; no test server reaches the match API), so a patch is
// never named before it is played. One game is enough: from that game on its numbers are the new patch's.
import { getSetInfo, patchState, pinnedSetNumber, setPatchState, type PatchState } from '@/config/game';
import { singleton } from '@/lib/cache';
import { shared, STATS_TAG } from '@/lib/shared-cache';
import { getStore } from '@/lib/store';
import type { VersionRow } from '@/lib/store/types';

const KV_KEY = 'patch_versions';
/** Fallback age of the shared copy of what was seen, in seconds; every collection run that stores matches refreshes it. */
const SHARED_FOR = 6 * 3600;

interface Remembered {
  set: number;
  key: string;
  label: string;
  /** First game seen; null when the calendar's date stands (the version already live when this was first looked at). */
  start: number | null;
  byPlatform: Record<string, number> | null;
  matches: number;
}

/** Riot's game version as major.minor ("16.23"), or null when the text has none. */
export function versionKey(gameVersion: string | null | undefined): string | null {
  const text = String(gameVersion ?? '');
  const m = /<Releases\/(\d+)\.(\d+)>/.exec(text) ?? /(\d+)\.(\d+)/.exec(text);
  return m ? `${Number(m[1])}.${Number(m[2])}` : null;
}

interface Group {
  set: number;
  key: string;
  first: number;
  byPlatform: Record<string, number>;
  matches: number;
}

function group(rows: VersionRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = versionKey(r.gameVersion);
    if (!key || !Number.isFinite(r.first) || r.matches <= 0) continue;
    const id = `${r.setNumber}|${key}`;
    const g = groups.get(id) ?? { set: r.setNumber, key, first: r.first, byPlatform: {}, matches: 0 };
    g.first = Math.min(g.first, r.first);
    g.byPlatform[r.platform] = Math.min(g.byPlatform[r.platform] ?? Number.POSITIVE_INFINITY, r.first);
    g.matches += r.matches;
    groups.set(id, g);
  }
  return [...groups.values()].sort((a, b) => a.set - b.set || a.first - b.first);
}

const calendarStart = (set: number, label: string) => {
  const p = getSetInfo(set).patches.find((x) => x.label === label);
  return p ? Date.parse(p.at ?? `${p.start}T00:00:00Z`) : Number.NaN;
};
const startOf = (r: Remembered) => r.start ?? calendarStart(r.set, r.label);

/** The next patch number of a set: "18.6" then "18.7" (`steps` further on); a set's first patch is ".1". */
function nextNumber(set: number, last: string | null, steps = 1): string {
  const m = last ? /^(\d+)\.(\d+)/.exec(last) : null;
  return m && Number(m[1]) === set ? `${set}.${Number(m[2]) + steps}` : `${set}.${steps}`;
}

/** The name of a game version seen for the first time, or null for one that cannot be placed (older than what is known). */
function nameFor(g: Group, known: Remembered[]): { label: string; dated: boolean } | null {
  const info = getSetInfo(g.set);
  // A patch the calendar dates keeps the calendar's date; any other starts with its first game.
  const named = (label: string) => ({ label, dated: info.patches.some((p) => p.label === label && !p.tentative) });
  // 1. A game version that is itself "<set>.<n>" is the patch number.
  if (g.key.split('.')[0] === String(g.set)) return named(g.key);
  // A lettered mid-patch is not a new game version: only the numbered ones are counted.
  const numbered = info.patches.filter((p) => !/[a-z]$/.test(p.label));
  // 2. Counted from a patch whose game version the calendar states: Riot raises the minor version by one a patch.
  const [major, minor] = g.key.split('.').map(Number);
  for (let i = numbered.length - 1; i >= 0; i--) {
    const [aMajor, aMinor] = (numbered[i].version ?? '').split('.').map(Number);
    if (aMajor !== major || !Number.isInteger(aMinor)) continue;
    const at = i + (minor - aMinor);
    if (at < 0) return null;
    return named(at < numbered.length ? numbered[at].label : nextNumber(g.set, numbered[numbered.length - 1].label, at - numbered.length + 1));
  }
  // 3. By order. The first version seen for a set is the patch its calendar had reached (nothing tells when that began),
  // or the first one on Riot's schedule; a later one is the next name on the schedule, else the next number.
  const ofSet = known.filter((k) => k.set === g.set).sort((a, b) => startOf(a) - startOf(b));
  const last = ofSet.at(-1);
  if (!last) {
    const reached = numbered.filter((p) => !p.tentative && Date.parse(p.at ?? `${p.start}T00:00:00Z`) <= g.first).at(-1);
    return reached ? { label: reached.label, dated: true } : named(numbered.find((p) => p.tentative)?.label ?? nextNumber(g.set, null));
  }
  if (g.first <= startOf(last)) return null;
  const order = numbered.map((p) => p.label);
  const at = order.indexOf(last.label.replace(/[a-z]+$/, ''));
  return named((at >= 0 ? order[at + 1] : undefined) ?? nextNumber(g.set, last.label));
}

function toState(known: Remembered[]): PatchState {
  const pinned = pinnedSetNumber();
  return {
    liveSet: Math.max(pinned, ...known.map((k) => k.set)),
    seen: known.filter((k) => k.set >= pinned).map((k) => ({ set: k.set, label: k.label, key: k.key, start: k.start, byPlatform: k.byPlatform })),
  };
}

const valid = (r: Remembered) => Boolean(r) && Number.isInteger(r.set) && typeof r.key === 'string' && typeof r.label === 'string';

/**
 * Read the game versions of the stored ranked matches, name the new ones and remember them. Runs after every
 * collection run and before the stats are rebuilt from new matches, so a new patch's games are never counted
 * under the old one.
 */
export async function syncPatchState(): Promise<PatchState> {
  const store = getStore();
  const [rows, saved] = await Promise.all([store.versions(pinnedSetNumber()), store.getKv<Remembered[]>(KV_KEY).catch(() => null)]);
  const known = Array.isArray(saved) ? saved.filter(valid) : [];
  let changed = false;
  for (const g of group(rows)) {
    const have = known.find((k) => k.set === g.set && k.key === g.key);
    if (have) {
      // An earlier first game (a server that got the patch sooner, an older match looked up) moves the start back.
      if (have.start !== null) {
        const byPlatform = { ...(have.byPlatform ?? {}) };
        for (const [p, t] of Object.entries(g.byPlatform)) if (!(byPlatform[p] <= t)) byPlatform[p] = t;
        const start = Math.min(have.start, g.first);
        if (start !== have.start || JSON.stringify(byPlatform) !== JSON.stringify(have.byPlatform ?? {})) {
          Object.assign(have, { start, byPlatform });
          changed = true;
        }
      }
      if (g.matches > have.matches) {
        have.matches = g.matches;
        changed = true;
      }
      continue;
    }
    const name = nameFor(g, known);
    // Never two game versions under one name: the calendar is then missing a patch, and guessing would misdate both.
    if (!name || known.some((k) => k.set === g.set && k.label === name.label)) continue;
    known.push({ set: g.set, key: g.key, label: name.label, start: name.dated ? null : g.first, byPlatform: name.dated ? null : g.byPlatform, matches: g.matches });
    changed = true;
  }
  if (changed) await store.setKv(KV_KEY, known);
  const state = toState(known);
  setPatchState(state);
  return state;
}

// What pages read: the remembered versions through the shared cache (one small read per collection run for all
// servers, never a scan of the matches). An empty memory is filled from the stored matches once.
async function readState(_pinned: number): Promise<PatchState> {
  const saved = await getStore().getKv<Remembered[]>(KV_KEY);
  if (Array.isArray(saved) && saved.some(valid)) return toState(saved.filter(valid));
  return syncPatchState();
}
const sharedState = shared(readState, ['patch-state'], { tags: [STATS_TAG], revalidate: SHARED_FOR });

const memo = () => singleton('patch-state-memo', () => ({ next: 0, pending: null as Promise<void> | null }));

/**
 * Make sure this server knows the live set and patches: one read of the shared cache every 30 seconds at most. It
 * never throws, and a page never waits long for it: a server that already knows a state goes on with it while the
 * newer one is read, and a new server waits two seconds at most (then it starts from the pinned set and the calendar).
 */
export function ensurePatchState(): Promise<void> {
  const m = memo();
  if (Date.now() >= m.next && !m.pending) {
    m.next = Date.now() + 30_000;
    m.pending = sharedState(pinnedSetNumber())
      .then((state) => {
        // A fresher copy this server computed itself (a rebuild from new matches) is not replaced by an older cached one.
        const mine = patchState();
        if (!mine || state.seen.length >= mine.seen.length || state.liveSet > mine.liveSet) setPatchState(state);
      })
      .catch((error) => {
        // The store does not answer: ask again in five minutes, not with every page.
        m.next = Date.now() + 300_000;
        console.warn('[metaforge] patch state not read:', error instanceof Error ? error.message : error);
      })
      .finally(() => {
        m.pending = null;
      });
  }
  if (patchState() || !m.pending) return Promise.resolve();
  return Promise.race([m.pending, new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
}
