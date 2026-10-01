/**
 * Game calendar and set-specific rules.
 *
 * Everything that changes when Riot ships a patch or a new set lives here, so
 * keeping MetaForge current is a one-file edit. Champion, trait and item data
 * itself is pulled live from CommunityDragon and never needs manual updates.
 */

interface PatchWindow {
  /** Label players know the patch by, e.g. "18.3b". */
  label: string;
  /** UTC date the patch reached live servers (YYYY-MM-DD). */
  start: string;
  /** True for scheduled dates that have not been confirmed by patch notes yet. */
  tentative?: boolean;
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
      { label: '18.4', start: '2026-10-07', tentative: true },
      { label: '18.5', start: '2026-10-21', tentative: true },
      { label: '18.6', start: '2026-11-04', tentative: true },
      { label: '18.6b', start: '2026-11-11', tentative: true },
    ],
  },
};

/** The set MetaForge targets. Override with TFT_SET=<number> if CDragon moves ahead. */
const DEFAULT_SET = 18;

/**
 * Board-building rules for the current set, used by the team builder. Trait
 * names are display names as they appear in-game.
 */
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
  1090: 'Normal',
  1100: 'Ranked',
  1130: 'Hyper Roll',
  1160: 'Double Up',
  1210: "Choncc's Treasure",
  1220: "Tocker's Trials",
  6000: 'Revival',
  6100: 'Revival',
  6110: 'Revival',
  6120: "Pengu's Party",
};

export const RANKED_QUEUE = 1100;

const DAY = 86_400_000;

export function getSetInfo(setNumber: number): SetInfo {
  return (
    SETS[setNumber] ?? {
      number: setNumber,
      name: `Set ${setNumber}`,
      mutator: `TFTSet${setNumber}`,
      start: new Date(Date.now() - 60 * DAY).toISOString().slice(0, 10),
      origins: [],
      patches: [],
    }
  );
}

export function configuredSetNumber(): number {
  const fromEnv = Number(process.env.TFT_SET);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_SET;
}

export interface ResolvedPatch {
  label: string;
  start: number;
  end: number;
  tentative: boolean;
}

/** Patch windows that have started, oldest first, each ending where the next begins. */
export function patchWindows(setNumber: number, now = Date.now()): ResolvedPatch[] {
  const info = getSetInfo(setNumber);
  const started = info.patches
    .map((p) => ({ ...p, t: Date.parse(`${p.start}T00:00:00Z`) }))
    .filter((p) => Number.isFinite(p.t) && p.t <= now)
    .sort((a, b) => a.t - b.t);
  return started.map((p, i) => ({
    label: p.label,
    start: p.t,
    end: i + 1 < started.length ? started[i + 1].t : Number.POSITIVE_INFINITY,
    tentative: Boolean(p.tentative),
  }));
}

export function currentPatch(setNumber: number, now = Date.now()): ResolvedPatch | null {
  const windows = patchWindows(setNumber, now);
  return windows.length ? windows[windows.length - 1] : null;
}

