/** Stats API shapes, shared by the server engine and the browser. */

export interface Scope {
  /** "all" or a platform id such as "na1" */
  region: string;
  /** "all" or a patch label such as "18.3b" */
  patch: string;
}

export type Filter =
  | { k: 'unit'; id: string; stars?: number[]; items?: string[]; minItems?: number; not?: boolean }
  | { k: 'item'; id: string; min?: number; not?: boolean }
  | { k: 'trait'; id: string; min?: number; max?: number; not?: boolean }
  | { k: 'aug'; id: string; not?: boolean }
  | { k: 'level'; min?: number; max?: number; not?: boolean };

export interface Summary {
  boards: number;
  total: number;
  avg: number;
  top4: number;
  win: number;
  placements: number[];
}

export interface StatRow {
  /** Entity key (lowercase api name). Trait rows are "key:tier". */
  id: string;
  n: number;
  freq: number;
  avg: number;
  delta: number;
  top4: number;
  win: number;
  /** Trait breakpoint index (1-based) for trait rows */
  tier?: number;
  /** Average copies per board that has the item */
  copies?: number;
}

export interface CompUnit {
  id: string;
  freq: number;
  star: number;
  items: string[];
}

export interface CompRow {
  id: string;
  name: string;
  trait: string | null;
  carry: string | null;
  n: number;
  freq: number;
  avg: number;
  top4: number;
  win: number;
  level: number;
  placements: number[];
  units: CompUnit[];
  /** Active traits of the typical board: breakpoint reached (1-based), units counted, share of boards with it. */
  traits: Array<{ id: string; tier: number; count?: number; freq: number }>;
}

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface TieredRow extends StatRow {
  score: number;
  grade: Tier | null;
}

export interface TieredComp extends CompRow {
  score: number;
  grade: Tier | null;
}

export interface ExplorerResult {
  scope: Scope;
  summary: Summary;
  baseline: Summary;
  units: StatRow[];
  items: StatRow[];
  traits: StatRow[];
  augments: StatRow[];
  levels: StatRow[];
  comps: CompRow[];
  /** Items held by each champion the filters ask for (champion key → rows). */
  held?: Record<string, StatRow[]>;
  /** Champions holding each item the filters ask for (item key → rows). */
  holders?: Record<string, StatRow[]>;
  meta: DatasetMeta;
}

export interface DatasetMeta {
  source: string;
  error: string | null;
  total: number;
  builtAt: number;
  hasAugments: boolean;
  newest: number | null;
  oldest: number | null;
  patches: Array<{ label: string; boards: number; tentative: boolean }>;
  regions: Array<{ id: string; boards: number }>;
  currentPatch: string | null;
}

export const ALL = 'all';

/** A champion at one star level that places well above others of its cost and star level. */
export interface TopUnit {
  id: string;
  star: number;
  n: number;
  avg: number;
  top4: number;
  win: number;
  /** Average place of the other champions with the same cost and star level. */
  peerAvg: number;
}
