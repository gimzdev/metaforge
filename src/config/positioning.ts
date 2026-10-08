// What players know about where each Set 18 (Enchanted Wilds) champion stands, and what the game data does not say.
// CommunityDragon gives range and durability, which place most units well; the entries below are the exceptions: champions
// that jump, that must be cornered, that stand alone in front, or that need a bodyguard. Keyed by the champion's base name
// without punctuation (Kha'Zix → khazix). Edit this file when the meta shifts or the next set ships.

export type Role = 'tank' | 'fighter' | 'assassin' | 'caster' | 'ranged' | 'support';

export interface PositionSpec {
  role?: Role;
  /** How the unit carries: 'corner' sits in a back corner, 'flank' on a side in the middle rows, 'tank' is a tank holding items. */
  carry?: 'corner' | 'flank' | 'tank';
  /** Alone in the front row; the rest of the front line stands one row behind. */
  solo?: boolean;
  /** Front line centre / outer edge. */
  center?: boolean;
  edge?: boolean;
  /** Stands in the front row right beside the main tank: the tank on the inner hex (3rd or 5th), the unit one hex outward (2nd or 6th). */
  withTank?: boolean;
  /** Stands next to this champion (a bodyguard, or the partner the unit pairs with). */
  nextTo?: string;
  /** Preferred rows, front (0) to back (3), when the unit is not a corner or flank carry. */
  rows?: number[];
  /** A one-line positioning tip shown under the board when the champion is on it. */
  note?: string;
}

export const norm = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export const POSITION_SPECS: Record<string, PositionSpec> = {
  // ── Back-line carries: corner, behind the wall ──
  ashe: { role: 'ranged', carry: 'corner', note: 'Ashe: back corner, on the side away from the enemy’s biggest line so her arrow runs through it.' },
  draven: { role: 'ranged', carry: 'corner', note: 'Draven: back corner behind the wall; his bleeds only pay off while he stays alive.' },
  aphelios: { role: 'ranged', carry: 'corner' },
  sivir: { role: 'ranged', carry: 'corner' },
  caitlyn: { role: 'ranged', carry: 'corner' },
  varus: { role: 'ranged', carry: 'corner' },
  xayah: { role: 'ranged', carry: 'corner' },
  tristana: { role: 'ranged', carry: 'corner' },
  kogmaw: { role: 'ranged', carry: 'corner' },
  yunara: { role: 'ranged', carry: 'corner' },
  kayle: { role: 'ranged', carry: 'corner' },
  ezreal: { role: 'ranged', carry: 'corner' },
  teemo: { role: 'ranged', carry: 'corner' },
  cinderling: { role: 'ranged' },
  // ── Casters ──
  ahri: { role: 'caster', rows: [3], note: 'Ahri: centre of the back row; her spell hunts the biggest cluster, so keep the wall in front.' },
  morgana: { role: 'caster', rows: [2] },
  veigar: { role: 'caster', carry: 'corner' },
  azir: { role: 'caster', carry: 'corner', note: 'Azir: back row, soldiers need room; keep him off the front-line side.' },
  leblanc: { role: 'caster', carry: 'corner' },
  cassiopeia: { role: 'caster', carry: 'corner' },
  zyra: { role: 'caster', carry: 'corner', note: 'Zyra: back row; her plants add durability, so don’t let the enemy reach them.' },
  soraka: { role: 'caster', carry: 'corner', note: 'Soraka: back row lined up behind your main tank so her heals and hits land on it.' },
  karma: { role: 'support' },
  mamabeak: { role: 'support' },
  lillia: { role: 'tank' },
  pebbles: { role: 'caster' },
  alune: { role: 'caster', carry: 'corner', rows: [3], note: 'Alune: deep in the back row; her moon phases buff the whole team, so protect her first.' },
  lux: { role: 'caster', rows: [3] },
  ivern: { role: 'support', rows: [2], note: 'Ivern: middle of the board; his grown hexes buff whoever stands on them, so keep your carries inside them.' },
  nidalee: { role: 'assassin', carry: 'flank', note: 'Nidalee: weak side of the board, one hex in from the edge, away from the enemy’s strongest front line.' },
  // ── Assassins and flank carries ──
  khazix: { role: 'assassin', carry: 'flank', withTank: true, note: 'Kha’Zix: front row, always beside your main tank: Kha’Zix on the 2nd hex with the tank on the 3rd, or the tank on the 5th with Kha’Zix on the 6th.' },
  rengar: { role: 'assassin', carry: 'flank', rows: [1], note: 'Rengar: front-line flank; he leaps to the weakest enemy, so give him room to jump.' },
  masteryi: { role: 'assassin', carry: 'flank', note: 'Master Yi: middle rows on a flank, with Hecarim beside him against assassins.' },
  akali: { role: 'assassin', carry: 'flank', note: 'Akali: weak-side flank in the middle rows, away from your tanks, so her resets can reach the back line.' },
  kennen: { role: 'caster', rows: [2] },
  // ── Front line ──
  malphite: { role: 'tank', carry: 'tank', solo: true, note: 'Malphite: alone in the front row, centred. He gains armor and magic resist for each enemy targeting him.' },
  elderdragon: { role: 'caster', carry: 'tank', rows: [2], note: 'Elder Dragon: third row, centred; it takes two slots.' },
  maokai: { role: 'tank', carry: 'tank', note: 'Maokai: central tank; he grows as enemies die around him.' },
  sentinel: { role: 'tank', carry: 'tank' },
  rammus: { role: 'tank', nextTo: 'fiddlesticks' },
  fiddlesticks: { role: 'tank', edge: true, note: 'Fiddlesticks: outer edge of the front row with Rammus right beside him, so the enemy’s focus splits between the two.' },
  hecarim: { role: 'fighter', nextTo: 'khazix', note: 'Hecarim: right next to your assassin carry (Kha’Zix, Master Yi); he screens it from enemy dives.' },
  taric: { role: 'tank' },
  gnar: { role: 'fighter', rows: [2] },
  // ── Tanks with no special rule ──
  leona: { role: 'tank' }, ornn: { role: 'tank' }, alistar: { role: 'tank' }, sejuani: { role: 'tank' }, shen: { role: 'tank' },
  vi: { role: 'tank' }, amumu: { role: 'tank' }, kobuko: { role: 'tank' }, reksai: { role: 'tank' },
  scuttlecrab: { role: 'tank' }, krug: { role: 'tank' }, gromp: { role: 'tank' }, elise: { role: 'tank' }, rakan: { role: 'tank' },
  yorick: { role: 'tank' }, sett: { role: 'fighter' }, diana: { role: 'fighter' }, warwick: { role: 'fighter' },
  camille: { role: 'fighter' }, brambleback: { role: 'fighter' }, murkwolf: { role: 'fighter' },
};
