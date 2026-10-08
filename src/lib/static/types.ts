// Normalized game data. The server keeps it all; pages get the "lite" part (no descriptions) and browsers fetch the
// descriptions once, cached (see /api/static). References between entities use lowercase keys.

export type TraitStyle = 'inactive' | 'bronze' | 'silver' | 'gold' | 'prismatic' | 'unique';

/** One run of formatted text: t text, v value, n line break, i stat icon; s is the style. */
export interface RichSeg {
  k: 't' | 'v' | 'n' | 'i';
  v?: string;
  s?: string;
}
export type RichText = RichSeg[];

export type ItemCategory = 'component' | 'completed' | 'emblem' | 'artifact' | 'radiant' | 'support' | 'consumable' | 'special';

export interface ChampionLite {
  key: string;
  slug: string;
  name: string;
  cost: number;
  traits: string[];
  /** Where the champion wants to stand: 0 front line to 3 back line. */
  row: number;
  /** Square HUD portrait (small sizes) and square splash crop (large portraits). */
  icon: string | null;
  tile: string | null;
}

export interface TraitLite {
  key: string;
  slug: string;
  name: string;
  icon: string | null;
  kind: 'origin' | 'class' | 'unique' | 'trait';
  effects: Array<{ minUnits: number; style: TraitStyle }>;
  champions: string[];
}

export interface ItemLite {
  key: string;
  slug: string;
  name: string;
  icon: string | null;
  category: ItemCategory;
  composition: string[];
  /** Traits an emblem grants. */
  traits: string[];
  unique: boolean;
}

export interface AugmentLite {
  key: string;
  name: string;
  icon: string | null;
  tier: 'silver' | 'gold' | 'prismatic' | 'unknown';
}

export interface StaticLite {
  set: { number: number; name: string };
  champions: ChampionLite[];
  traits: TraitLite[];
  items: ItemLite[];
  augments: AugmentLite[];
  /** Other ids the same item goes by in match data (lowercase id → catalog key). */
  itemAliases: Record<string, string>;
}

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

export interface Champion extends ChampionLite {
  baseName: string;
  role: string | null;
  /** Wide splash art (page backdrops). */
  splash: string | null;
  ability: { name: string; icon: string | null; desc: RichText };
  stats: ChampionStats;
}

export interface Trait extends TraitLite {
  desc: RichText;
  effects: Array<{ minUnits: number; style: TraitStyle; desc: RichText }>;
}

export interface Item extends ItemLite {
  desc: RichText;
}

export interface Augment extends AugmentLite {
  desc: RichText;
}

export interface StaticData extends StaticLite {
  source: 'cdragon' | 'file' | 'cache';
  champions: Champion[];
  traits: Trait[];
  items: Item[];
  augments: Augment[];
}

/** Descriptions, loaded by browsers on demand. */
export interface StaticText {
  abilities: Record<string, { name: string; desc: RichText }>;
  traits: Record<string, { desc: RichText; effects: RichText[] }>;
  items: Record<string, RichText>;
  augments: Record<string, RichText>;
}

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  component: 'Components', completed: 'Completed', emblem: 'Emblems', artifact: 'Artifacts',
  radiant: 'Radiant', support: 'Support', consumable: 'Consumables', special: 'Special',
};
