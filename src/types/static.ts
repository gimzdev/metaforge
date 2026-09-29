/** Normalized game data shared by the server and the browser. */

export type TraitStyle = 'inactive' | 'bronze' | 'silver' | 'gold' | 'prismatic' | 'unique';

/** One run of formatted text in a game description. */
export interface RichSeg {
  /** t = text, v = variable value, n = line break, i = stat icon label */
  k: 't' | 'v' | 'n' | 'i';
  /** Text, resolved value, or label */
  v?: string;
  /** Unresolved variable name (value unknown in the source data) */
  u?: string;
  /** Style: magic | physical | true | bonus | heal | shield | rules | keyword | label */
  s?: string;
}
export type RichText = RichSeg[];

export interface ChampionStats {
  hp: number | null;
  mana: number | null;
  initialMana: number | null;
  damage: number | null;
  armor: number | null;
  magicResist: number | null;
  attackSpeed: number | null;
  critChance: number | null;
  range: number | null;
}

export interface Champion {
  id: string;
  key: string;
  slug: string;
  name: string;
  baseName: string;
  cost: number;
  traits: string[];
  role: string | null;
  /** Square HUD portrait (small sizes) */
  icon: string | null;
  /** Square crop of the splash art (large portraits) */
  tile: string | null;
  /** Wide splash art (page backdrops) */
  splash: string | null;
  ability: { name: string; icon: string | null; desc: RichText };
  stats: ChampionStats;
}

export interface TraitEffect {
  minUnits: number;
  maxUnits: number;
  style: TraitStyle;
  desc: RichText;
}

export interface Trait {
  id: string;
  key: string;
  slug: string;
  name: string;
  icon: string | null;
  desc: RichText;
  effects: TraitEffect[];
  champions: string[];
  kind: 'origin' | 'class' | 'unique' | 'trait';
}

export type ItemCategory =
  | 'component'
  | 'completed'
  | 'emblem'
  | 'artifact'
  | 'radiant'
  | 'support'
  | 'consumable'
  | 'special';

export interface Item {
  id: string;
  key: string;
  slug: string;
  name: string;
  icon: string | null;
  desc: RichText;
  composition: string[];
  category: ItemCategory;
  traits: string[];
  unique: boolean;
}

export interface Augment {
  id: string;
  key: string;
  slug: string;
  name: string;
  icon: string | null;
  desc: RichText;
  tier: 'silver' | 'gold' | 'prismatic' | 'unknown';
}

export interface StaticData {
  set: { number: number; mutator: string; name: string; sourceName: string };
  source: 'cdragon' | 'file' | 'cache';
  fetchedAt: string;
  champions: Champion[];
  traits: Trait[];
  items: Item[];
  augments: Augment[];
  /**
   * Other ids the same item goes by (lowercase id -> catalog key). Set 18 mirrors
   * most items under a "DA_" id; both ids count as the one item in stats.
   */
  itemAliases?: Record<string, string>;
}

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  component: 'Components',
  completed: 'Completed',
  emblem: 'Emblems',
  artifact: 'Artifacts',
  radiant: 'Radiant',
  support: 'Support',
  consumable: 'Consumables',
  special: 'Special',
};
