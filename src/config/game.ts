// Game calendar and set-specific rules. Champion, trait and item data is pulled live from CommunityDragon.
//
// Which patch is live is not decided here any more: the ranked games MetaForge collects carry Riot's game version and
// set number, and a new version on them is a new patch from its first game on (lib/patches.ts). This file names and
// dates the patches: the ones that shipped, and the ones on Riot's schedule (`tentative`), which take their place on
// the site only when their games arrive. A patch Riot ships without an entry here is named by its place in the set.

interface PatchWindow {
  /** Label players know the patch by, e.g. "18.3b". */
  label: string;
  /** UTC date the patch reached live servers (YYYY-MM-DD). */
  start: string;
  /** The hour it went live (UTC ISO time) when it is known; matches before it still belong to the previous patch. Defaults to 00:00 on `start`. */
  at?: string;
  /**
   * True for a date from Riot's schedule. Such a patch is never the live one by its date: it becomes live when ranked
   * games of a new game version are collected, from the first of them. Until then the timeline shows it as scheduled.
   */
  tentative?: boolean;
  /**
   * Riot's game version on this patch's games (major.minor, as in the match data), when it is known. Game versions rise
   * by one a patch, so one stated version names every other patch of the set by counting from it.
   */
  version?: string;
}

interface SetInfo {
  number: number;
  name: string;
  /** Riot's internal core name used in match data (tft_set_core_name). */
  mutator: string;
  start: string;
  /** Traits that are origins; the rest of the non-unique traits are classes. */
  origins: string[];
  patches: PatchWindow[];
}

const SETS: Record<number, SetInfo> = {
  18: {
    number: 18,
    name: 'Enchanted Wilds',
    mutator: 'TFTSet18',
    start: '2026-08-26',
    origins: [
      'Blackthorn', 'Blossom', 'Coven', 'Elderwood', 'Fae', 'Flora Fatalis', 'Inferno',
      'Lunar', 'Primal', 'Riftbeast', 'Rival', 'Solar', 'Sprykin',
    ],
    patches: [
      { label: '18.1', start: '2026-08-26' },
      { label: '18.2', start: '2026-09-10' },
      { label: '18.2b', start: '2026-09-14' },
      { label: '18.3', start: '2026-09-23' },
      { label: '18.3b', start: '2026-09-24' },
      // Riot's patch day is 2026-10-07 (Pacific time); the go-live hour is an estimate (10:00 PT). Set it to the hour your
      // matches switch to the new version if you need it exact.
      { label: '18.4', start: '2026-10-07', at: '2026-10-07T17:00:00Z' },
      // Riot dates the 18.4 B-patch October 7 (Pacific time); it rolled out on PC first. The go-live hour is an estimate
      // (about 4 PM PT, after the 18.4 launch). Set it to the hour your matches switch to the new version if you need it exact.
      { label: '18.4b', start: '2026-10-07', at: '2026-10-07T23:00:00Z' },
      // Riot dates 18.5 October 21 (Pacific time) and gives no hour; the go-live hour is an estimate (10:00 PT), as for 18.4.
      // Set it to the hour your matches switch to the new version if you need it exact.
      { label: '18.5', start: '2026-10-21', at: '2026-10-21T17:00:00Z' },
      // Riot's notes date the 18.5 B-patch October 22, again without an hour (estimated 10:00 PT).
      { label: '18.5b', start: '2026-10-22', at: '2026-10-22T17:00:00Z' },
      // A second 18.5 mid-patch update, announced on X October 26 for the next day; the hour is an estimate (10:00 PT).
      { label: '18.5c', start: '2026-10-27', at: '2026-10-27T17:00:00Z' },
      // Riot's schedule dates 18.6 November 4 (Pacific time) without an hour; the go-live hour is an estimate (10:00 PT,
      // 18:00 UTC since the clocks changed). Its B and C updates (November 6 and after) only fix bugs and the new client,
      // so their games stay under 18.6.
      // Its games carry game version 16.22: on November 15, 18.6 was the newest patch in Riot's notes and
      // CommunityDragon's files of the live game were at 16.22.
      { label: '18.6', start: '2026-11-04', at: '2026-11-04T18:00:00Z', version: '16.22' },
      // Riot's schedule names a November 11 patch 18.7, the last of Enchanted Wilds. It was not out on November 15
      // (Riot's list of patch notes ended at 18.6; CommunityDragon's live files were at game version 16.22, its PBE
      // files at 16.23). Scheduled, so it goes live here by itself with the first games of the next game version.
      { label: '18.7', start: '2026-11-11', tentative: true },
    ],
  },
  // Set 19, Prismatic Tour. Its patches are from Riot's patch schedule (read November 14): 19.1 on December 1, 19.2 on
  // December 15. Its name and its origins (the 14 bands with breakpoints) are from Riot's reveal of November 15, written
  // down in content/set19.ts; the names are checked against the game data when the PBE has it. Its patch notes are
  // added when Riot publishes them. MetaForge moves to it by itself when ranked games carry set number 19.
  19: {
    number: 19,
    name: 'Prismatic Tour',
    mutator: 'TFTSet19',
    start: '2026-12-01',
    origins: [
      'Beach Pop', 'Classical', 'EDM', 'Gu Feng', 'Heartsteel', 'Hyperpop', 'Illbeats',
      'Ionic Spark', 'Jazz', 'K/DA', 'Pentakill', 'R&B', 'Rock', 'True Damage',
    ],
    patches: [
      { label: '19.1', start: '2026-12-01', tentative: true },
      { label: '19.2', start: '2026-12-15', tentative: true },
    ],
  },
};

/** The set MetaForge starts from. TFT_SET=<number> sets another one; newer sets are followed from the games (see below). */
const DEFAULT_SET = 18;

/** Board-building rules for the current set (team builder). Trait names are display names as they appear in-game. */
export const SET_RULES = {
  /** Champions with this trait count each of their other traits twice. */
  doubleTraitHolder: 'Avatar',
  /** Only one distinct champion with this trait can be fielded (one Lux form). */
  exclusiveTrait: 'Avatar',
  /** Extra trait credit granted by a champion with a given trait. */
  bonusTraitCredit: [{ holder: 'Apex Predator', trait: 'Riftbeast', total: 2 }],
  /** Champions that occupy more than one team slot. */
  extraSlots: [{ holder: 'Apex Predator', slots: 2 }],
} as const;

export const QUEUES: Record<number, string> = {
  1090: 'Normal', 1100: 'Ranked', 1130: 'Hyper Roll', 1160: 'Double Up', 1210: "Choncc's Treasure",
  1220: "Tocker's Trials", 6000: 'Revival', 6100: 'Revival', 6110: 'Revival', 6120: "Pengu's Party",
};

export const RANKED_QUEUE = 1100;

const DAY = 86_400_000;

export function getSetInfo(setNumber: number): SetInfo {
  const start = new Date(Date.now() - 60 * DAY).toISOString().slice(0, 10);
  const info = SETS[setNumber] ?? { number: setNumber, name: `Set ${setNumber}`, mutator: `TFTSet${setNumber}`, start, origins: [], patches: [] };
  // A set starts with its first game. When ranked games of it were collected before the date written here (Riot's
  // dates are Pacific time, and a patch reaches Oceania hours earlier), the first game seen is its start: boards and
  // LP history are read from that day on, not from the scheduled date.
  let first = Number.POSITIVE_INFINITY;
  for (const p of patchState()?.seen ?? []) if (p.set === setNumber && p.start !== null && p.start < first) first = p.start;
  return first < Date.parse(`${info.start}T00:00:00Z`) ? { ...info, start: new Date(first).toISOString().slice(0, 10) } : info;
}

/** False while a set has no name here (it then goes by its number alone: "Set 20"). */
export const setNamed = (info: Pick<SetInfo, 'number' | 'name'>) => Boolean(info.name) && info.name !== `Set ${info.number}`;
/** "Set 18: Enchanted Wilds", or "Set 20" while a set has no name here. */
export const setTitle = (info: Pick<SetInfo, 'number' | 'name'>, separator = ': ') => (setNamed(info) ? `Set ${info.number}${separator}${info.name}` : `Set ${info.number}`);

/* ── What the collected games say (written by lib/patches.ts, read here without waiting) ───────── */

/** A patch seen on ranked games: a game version (major.minor) and the name it goes by. */
export interface SeenPatch {
  set: number;
  label: string;
  /** Riot's game version on those games, e.g. "16.23". */
  key: string;
  /** Its first game (epoch ms); null for the patch the calendar had already dated when its games were first looked at. */
  start: number | null;
  /** Its first game on each server: a patch reaches the regions over several hours. */
  byPlatform: Record<string, number> | null;
}

export interface PatchState {
  /** The newest set ranked games are played on (never below TFT_SET). */
  liveSet: number;
  seen: SeenPatch[];
}

const bag = () => ((globalThis as { __metaforge?: Record<string, unknown> }).__metaforge ??= {});
export const patchState = (): PatchState | null => (bag()['patch-state'] as PatchState | undefined) ?? null;
export function setPatchState(state: PatchState | null) {
  bag()['patch-state'] = state ?? undefined;
}

/** The set from TFT_SET (the installer's MF_SET), or the app's default: the oldest set whose ranked games are stored. */
export function pinnedSetNumber(): number {
  const fromEnv = Number(process.env.TFT_SET);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_SET;
}

/** The set ranked games are played on: the pinned one, or the newer set the collected games have moved to. */
export function liveSetNumber(): number {
  return Math.max(pinnedSetNumber(), patchState()?.liveSet ?? 0);
}

/**
 * The set MetaForge shows: the live set (no edit and no deploy needed). On the day a set launches its games can arrive
 * before CommunityDragon has its champions and items: until then this is still the set of the game data in use
 * (lib/static/load.ts), so every page, title and number stays about one and the same set.
 */
export function configuredSetNumber(): number {
  const loaded = (bag()['static-data'] as { data?: { set?: { number?: number } } | null } | undefined)?.data?.set?.number;
  return typeof loaded === 'number' && loaded >= pinnedSetNumber() ? loaded : liveSetNumber();
}

/** The calendar's dated patches from the pinned set on, as text: part of the cache key of everything cut by patch. */
export function calendarSignature(setNumber: number): string {
  return getSetInfo(setNumber)
    .patches.filter((p) => !p.tentative)
    .map((p) => `${p.label}@${p.at ?? p.start}`)
    .join(',');
}

export interface ResolvedPatch {
  label: string;
  start: number;
  end: number;
  tentative: boolean;
  /** First game per server for a patch dated by its games; a server not listed has not played it yet. */
  byPlatform?: Record<string, number> | null;
}

const startOf = (p: PatchWindow) => Date.parse(p.at ?? `${p.start}T00:00:00Z`);

/**
 * Patch windows that have started, oldest first, each ending where the next begins. A patch that shipped is dated by
 * the calendar; a scheduled one and one the calendar does not know start with their first game.
 */
export function patchWindows(setNumber: number, now = Date.now()): ResolvedPatch[] {
  const info = getSetInfo(setNumber);
  const seen = new Map((patchState()?.seen ?? []).filter((p) => p.set === setNumber).map((p) => [p.label, p]));
  const started: Array<{ label: string; t: number; byPlatform: Record<string, number> | null }> = [];
  for (const p of info.patches) {
    const hit = seen.get(p.label);
    seen.delete(p.label);
    if (p.tentative) {
      if (hit && hit.start !== null) started.push({ label: p.label, t: hit.start, byPlatform: hit.byPlatform });
    } else {
      const t = startOf(p);
      if (Number.isFinite(t) && t <= now) started.push({ label: p.label, t, byPlatform: null });
    }
  }
  for (const p of seen.values()) if (p.start !== null) started.push({ label: p.label, t: p.start, byPlatform: p.byPlatform });
  started.sort((a, b) => a.t - b.t);
  const end = (i: number) => (i + 1 < started.length ? started[i + 1].t : Number.POSITIVE_INFINITY);
  return started.map((p, i) => ({ label: p.label, start: p.t, end: end(i), tentative: false, byPlatform: p.byPlatform }));
}

export function currentPatch(setNumber: number, now = Date.now()): ResolvedPatch | null {
  const windows = patchWindows(setNumber, now);
  return windows.length ? windows[windows.length - 1] : null;
}

export interface TimelinePatch {
  label: string;
  /** UTC day (YYYY-MM-DD): the day it went live, or the day Riot's schedule gives. */
  date: string;
  state: 'past' | 'live' | 'scheduled';
}

/**
 * The set's patches for the timeline: those that went live, then those still only on Riot's schedule. The newest one
 * that went live is the live patch, unless ranked play has moved on to a later set.
 */
export function patchTimeline(setNumber: number, now = Date.now()): TimelinePatch[] {
  const windows = patchWindows(setNumber, now);
  const started = new Set(windows.map((w) => w.label));
  const current = setNumber >= liveSetNumber();
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const out: TimelinePatch[] = windows.map((w, i) => ({ label: w.label, date: day(w.start), state: current && i === windows.length - 1 ? 'live' : 'past' }));
  if (current) for (const p of getSetInfo(setNumber).patches) if (!started.has(p.label) && p.tentative) out.push({ label: p.label, date: p.start, state: 'scheduled' });
  return out;
}
