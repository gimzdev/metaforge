/**
 * Patch and set news for Set 18: Enchanted Wilds, summarized from Riot's
 * official patch notes (linked on every entry). Update this file when a new
 * patch lands; the patch calendar itself lives in src/config/game.ts.
 *
 * Every change is one line: who it hits, which way it goes, what changed and,
 * when there are numbers, the old and new values. Targets are written the way
 * the game names them, so the page can put the right icon and link next to them.
 */

/** buff and nerf are from the player's point of view; change is a sideways adjustment. */
export type ChangeKind = 'buff' | 'nerf' | 'change' | 'revert' | 'disabled' | 'new' | 'fix';

export interface Change {
  /** Champion, trait, item or augment as named in game, or a system ("Leveling"). */
  target: string;
  kind: ChangeKind;
  /** What changed, e.g. "Ability damage". */
  what: string;
  from?: string;
  to?: string;
  /** Extra context shown under the line. */
  note?: string;
}

export interface ChangeGroup {
  title: string;
  /** Which catalog the targets are looked up in for icons and links. */
  type: 'unit' | 'trait' | 'item' | 'augment' | 'other';
  changes: Change[];
}

export interface PatchNote {
  id: string;
  label: string;
  title: string;
  /** UTC date the change went live (YYYY-MM-DD) */
  date: string;
  kind: 'launch' | 'patch' | 'mid-patch' | 'hotfix';
  summary: string;
  /** Three or four headline changes, used on the home page. */
  highlights: string[];
  groups: ChangeGroup[];
  source: { label: string; url: string };
}

const PATCH_18_3_URL = 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-3/';

export const PATCH_NOTES: PatchNote[] = [
  {
    id: '18-3b',
    label: '18.3b',
    title: 'Kha’Zix and Blackthorn trimmed, 18.2b changes restored',
    date: '2026-09-24',
    kind: 'mid-patch',
    summary:
      'A mid-patch update that answers meta shifts the main patch missed and restores several 18.2b balance changes that were unintentionally rolled back in 18.3. A hotfix on September 28 switched off the Major Polymorph Wisp.',
    highlights: [
      'Kha’Zix ability damage down to 265/370/535 AP (isolated targets 285/410/605)',
      'Blackthorn AP sacrifice damage amp 14% to 12%',
      'Camille, LeBlanc, Teemo, Ashe and Draven 18.2b nerfs are back in',
      'Major Polymorph Wisp disabled until 18.4',
    ],
    groups: [
      {
        title: 'Traits',
        type: 'trait',
        changes: [{ target: 'Blackthorn', kind: 'nerf', what: 'AP sacrifice base damage amp', from: '14%', to: '12%' }],
      },
      {
        title: 'Champions',
        type: 'unit',
        changes: [
          { target: 'Kha’Zix', kind: 'nerf', what: 'Ability damage', from: '285/400/580', to: '265/370/535 AP' },
          { target: 'Kha’Zix', kind: 'nerf', what: 'Damage to isolated targets', from: '310/445/660', to: '285/410/605 AP' },
          { target: 'Brambleback', kind: 'buff', what: 'Casts its ability slightly faster' },
        ],
      },
      {
        title: 'Restored from 18.2b',
        type: 'unit',
        changes: [
          { target: 'Camille', kind: 'nerf', what: 'Damage', from: '160/240/410/700', to: '150/225/375/640 AD' },
          { target: 'LeBlanc', kind: 'nerf', what: 'Clone chance', from: '10/15/40%', to: '10/15/30%' },
          { target: 'Teemo', kind: 'nerf', what: 'Small shroom damage', from: '60/90/135', to: '55/82/130 AP' },
          { target: 'Ashe', kind: 'nerf', what: 'Trail duration', from: '4 seconds', to: '3 seconds' },
          { target: 'Ashe', kind: 'buff', what: 'Trail damage over time', from: '5/8', to: '9/14 AD' },
          { target: 'Draven', kind: 'nerf', what: 'Bounty goals', note: 'Six 4-cost casts instead of five, 60 attacks instead of 50, 10,000 damage instead of 8,000 and 8 kills instead of 6.' },
          { target: 'Draven', kind: 'nerf', what: 'Reward for 8 casts', from: '10 rerolls', to: '6 rerolls' },
        ],
      },
      {
        title: 'Systems',
        type: 'other',
        changes: [
          {
            target: 'Targeting',
            kind: 'revert',
            what: 'An 18.2 champion targeting change is back to Set 17 behavior while early-combat melee targeting is investigated',
          },
        ],
      },
      {
        title: 'Temporarily disabled',
        type: 'augment',
        changes: [
          { target: 'Challenger’s Grace', kind: 'disabled', what: 'Augment disabled' },
          { target: 'Dark Ritual', kind: 'disabled', what: 'Augment disabled' },
          { target: 'Infinity Protection', kind: 'disabled', what: 'Augment disabled' },
          { target: 'Nesting Dolls', kind: 'disabled', what: 'Augment disabled' },
          {
            target: 'Major Polymorph Wisp',
            kind: 'disabled',
            what: 'Off until patch 18.4',
            note: 'Hotfix on September 28, after an exploit let players two-star 5-costs far too early.',
          },
        ],
      },
    ],
    source: { label: 'Official 18.3 patch notes (mid-patch updates)', url: PATCH_18_3_URL },
  },
  {
    id: '18-3',
    label: '18.3',
    title: 'Reroll buffs, capped trait ceilings and stronger combat augments',
    date: '2026-09-23',
    kind: 'patch',
    summary:
      'A focused patch: small, targeted champion and trait changes that lower power ceilings or raise power floors, plus broad buffs to combat augments. Wolf Bros return as a level 6 reroll option.',
    highlights: [
      'Coven earns more Essence per loss: 22/28/35/60',
      'Top breakpoints of Hunter, Defender, Invoker and Inferno trimmed',
      'Warwick, Murkwolf, Gromp, Alistar, Karma, Azir, Cassiopeia and Rammus buffed',
      'Combat augments broadly buffed; Early Learnings and Electrocharge I toned down',
    ],
    groups: [
      {
        title: 'Traits',
        type: 'trait',
        changes: [
          { target: 'Coven', kind: 'buff', what: 'Essence per loss', from: '18/25/32/60', to: '22/28/35/60' },
          { target: 'Defender', kind: 'nerf', what: 'Resists', from: '25/60/120', to: '25/60/115' },
          { target: 'Hunter', kind: 'nerf', what: 'Bonus AD', from: '20/30/45/65%', to: '20/30/40/60%' },
          { target: 'Inferno', kind: 'nerf', what: 'Burn, % of max Health', from: '1/1/3.5/4.5%', to: '1/1/3/4%' },
          { target: 'Invoker', kind: 'nerf', what: 'Mana regen', from: '3/4/6/9', to: '3/4/6/8' },
          {
            target: 'Blossom',
            kind: 'nerf',
            what: 'Charms toned down across the board',
            note: 'For example Combust 22% to 18%, Mana-Rich Soil 25% to 20%, Stand Alone 22% to 20% and Hugify 600 to 500 Health.',
          },
        ],
      },
      {
        title: 'Champions',
        type: 'unit',
        changes: [
          { target: 'Alistar', kind: 'buff', what: 'Heal', from: '200/260/320', to: '230/300/400 AP' },
          { target: 'Alistar', kind: 'buff', what: 'Damage', from: '100/150/225', to: '180/270/420 AP' },
          { target: 'Azir', kind: 'buff', what: 'Soldier damage', to: '46/69/110 AP' },
          { target: 'Cassiopeia', kind: 'buff', what: 'Ability damage', to: '425/630/1020 AP' },
          { target: 'Gromp', kind: 'buff', what: 'Damage over time', to: '175/265/410 AP' },
          { target: 'Karma', kind: 'buff', what: 'Explosion damage', from: '120/180/270/460', to: '125/185/300/515 AP' },
          { target: 'Lillia', kind: 'buff', what: 'Heal', from: '325/475', to: '350/525 AP' },
          { target: 'Lux (Solar)', kind: 'buff', what: 'Bonus per three-star', from: '+12%', to: '+15%' },
          { target: 'Murkwolf', kind: 'buff', what: 'Empowered attack', to: '65/100/160 AD' },
          {
            target: 'Nidalee',
            kind: 'nerf',
            what: 'AD form damage',
            from: '225/340',
            to: '210/315 AD',
            note: 'Also fixes a bug that gave 60% Armor Penetration instead of 40%.',
          },
          { target: 'Nidalee', kind: 'change', what: 'AP form third attack', to: '330/500% AP' },
          { target: 'Ornn', kind: 'nerf', what: 'Three-star Forge Power bonus', from: '+100%', to: '+85%' },
          { target: 'Ornn', kind: 'buff', what: 'Second Artifact threshold', from: '155,000', to: '140,000 Forge Power' },
          { target: 'Rammus', kind: 'buff', what: 'Shield', to: '400/550/725' },
          { target: 'Taric', kind: 'change', what: 'Passive shield 75/150, heal 275/450 AP' },
          { target: 'Veigar', kind: 'nerf', what: 'AP per kill', from: '3%', to: '2%' },
          { target: 'Veigar', kind: 'buff', what: 'Base damage', to: '200/300/450/765 AP' },
          { target: 'Warwick', kind: 'buff', what: 'Damage', to: '230/345/535 AD' },
          { target: 'Warwick', kind: 'buff', what: 'Healing', from: '20%', to: '25%' },
        ],
      },
      {
        title: 'Items and emblems',
        type: 'item',
        changes: [
          { target: 'Brawler Emblem', kind: 'buff', what: 'Max Health', from: '2%', to: '2.5%' },
          { target: 'Eternal Pact', kind: 'nerf', what: 'Tank mana', from: '15', to: '10' },
          { target: 'Hunter Emblem', kind: 'nerf', what: 'AD per takedown', from: '18%', to: '15%' },
          { target: 'Invoker Emblem', kind: 'nerf', what: 'Mana regen', from: '3', to: '2' },
          { target: 'Juggernaut Emblem', kind: 'nerf', what: 'Mana on death', from: '15', to: '10' },
          { target: 'Statikk Shiv', kind: 'buff', what: 'AP', from: '15%', to: '25%' },
          { target: 'The Collector', kind: 'nerf', what: 'AD', from: '40%', to: '35%' },
        ],
      },
      {
        title: 'Wisps',
        type: 'other',
        changes: [
          { target: 'Stat Booster Wisps', kind: 'nerf', what: 'Armor and Magic Resist', from: '10', to: '8' },
          { target: 'Stat Booster Wisps', kind: 'nerf', what: 'Attack Speed', from: '8%', to: '6%' },
          { target: 'Blood and Iron', kind: 'nerf', what: 'Cost', from: '3 gold', to: '4 gold' },
          { target: 'Three Me', kind: 'nerf', what: 'Cost', from: '9 gold', to: '10 gold' },
          { target: 'Combust', kind: 'nerf', what: 'Strength', from: '18%', to: '15%' },
          { target: 'Mana-Rich Soil', kind: 'nerf', what: 'Strength', from: '18%', to: '15%' },
        ],
      },
      {
        title: 'Augments',
        type: 'augment',
        changes: [
          { target: 'Giant and Mighty', kind: 'buff', what: 'Health', to: '225' },
          { target: 'Group Hug I', kind: 'buff', what: 'Resists', to: '7' },
          { target: 'Group Hug II', kind: 'buff', what: 'Resists', to: '10' },
          { target: 'Hold the Line', kind: 'buff', what: 'AD and AP', to: '11%' },
          { target: 'Jeweled Lotus I', kind: 'buff', what: 'Crit chance', to: '15%' },
          { target: 'Early Learnings', kind: 'nerf', what: 'Baseline AD and AP', from: '5%', to: '3%' },
          { target: 'Electrocharge I', kind: 'nerf', what: 'Damage', to: '25/40/60/80' },
          { target: 'Item Extraction', kind: 'change', what: 'Extracts 3 times instead of 4 and grants an extra Azir' },
          { target: 'Verticality', kind: 'change', what: 'Only offered with at least 4 units of a trait' },
          { target: 'Upward Mobility', kind: 'change', what: 'Rerolls on level 2 instead of 1' },
          {
            target: 'We Stick Together',
            kind: 'fix',
            what: 'No more duplicate emblems',
            note: 'It also no longer hands out emblems for tiny traits, Juggernaut, Brawler or Defender.',
          },
        ],
      },
    ],
    source: { label: 'Official 18.3 patch notes', url: PATCH_18_3_URL },
  },
  {
    id: '18-2',
    label: '18.2',
    title: 'Cheaper Wisps and a faster level 8',
    date: '2026-09-10',
    kind: 'patch',
    summary:
      'The first balance patch of the set made combat Wisps cheaper, shortened the road to level 8 and pushed Blackthorn and the legendary units up. The 18.2b mid-patch on September 14 walked back cheaper XP for levels 9 and 10 to cool off fast-9 play.',
    highlights: [
      'Combat Wisps cheaper: Barrier 3 gold, Combust 3, Lightning Storm 3',
      'Blackthorn health scaling 175/350/600',
      'Ivern, Ashe and Lux buffed',
      '18.2b reverted cheaper XP for levels 9 and 10',
    ],
    groups: [
      {
        title: 'Systems',
        type: 'other',
        changes: [
          { target: 'Leveling', kind: 'change', what: 'Leveling from 7 to 8 costs less, so level 8 comes sooner' },
          {
            target: 'Leveling',
            kind: 'revert',
            what: '18.2b: XP for levels 9 and 10 is back to its launch cost',
            note: 'September 14. The cheaper 7 to 8 step stayed.',
          },
        ],
      },
      {
        title: 'Wisps',
        type: 'other',
        changes: [
          { target: 'Barrier', kind: 'buff', what: 'Cost', from: '4 gold', to: '3 gold' },
          { target: 'Combust', kind: 'buff', what: 'Cost', from: '5 gold', to: '3 gold' },
          { target: 'Lightning Storm', kind: 'buff', what: 'Cost', from: '5 gold', to: '3 gold' },
          { target: 'Cutpurse', kind: 'buff', what: 'Cost', from: '3 gold', to: '2 gold' },
        ],
      },
      {
        title: 'Traits',
        type: 'trait',
        changes: [
          {
            target: 'Blackthorn',
            kind: 'buff',
            what: 'Health',
            from: '175/300/550',
            to: '175/350/600',
            note: 'Makes the 4 and 6 breakpoints worth playing.',
          },
          { target: 'Solar', kind: 'buff', what: 'Starting bonus', from: '7%', to: '8%' },
          { target: 'Solar', kind: 'nerf', what: 'Late-game three-star Attack Speed', from: '18%', to: '15%' },
        ],
      },
      {
        title: 'Champions',
        type: 'unit',
        changes: [
          { target: 'Ashe', kind: 'buff', what: 'Arrow damage', to: '465/700 AD' },
          { target: 'Ivern', kind: 'buff', what: 'Starting hexes', from: '2', to: '3' },
          {
            target: 'LeBlanc',
            kind: 'nerf',
            what: 'Clone chance',
            from: '10/15/40%',
            to: '10/15/30%',
            note: 'More ability damage to compensate.',
          },
          { target: 'Lux', kind: 'buff', what: 'Ability damage', to: '375/565 AP' },
          { target: 'Sentinel', kind: 'change', what: 'Now targets the largest enemy line' },
          { target: 'Sentinel', kind: 'nerf', what: 'Shield', from: '400/500', to: '350/450 AP' },
        ],
      },
      {
        title: 'Items',
        type: 'item',
        changes: [
          { target: 'Bloodthirster', kind: 'buff', what: 'Shield triggers at', from: '40% Health', to: '50% Health' },
          { target: 'Edge of Night', kind: 'change', what: 'Triggers at', from: '60% Health', to: '40% Health' },
          { target: 'Hand of Justice', kind: 'buff', what: 'Omnivamp', from: '12%', to: '15%' },
        ],
      },
      {
        title: 'Augments',
        type: 'augment',
        changes: [
          { target: 'Consuming Flora', kind: 'nerf', what: 'Bonus', from: '200%', to: '150%', note: 'Also limited to one player per lobby.' },
          { target: 'Dark Ritual', kind: 'change', what: 'Limited to one player per lobby' },
          { target: 'Coven Acolyte', kind: 'change', what: 'Limited to one player per lobby' },
        ],
      },
    ],
    source: {
      label: 'Official 18.2 patch notes',
      url: 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-2/',
    },
  },
  {
    id: '18-1',
    label: '18.1',
    title: 'Enchanted Wilds arrives',
    date: '2026-08-26',
    kind: 'launch',
    summary:
      'Set 18 launched as the first TFT set running on Unreal Engine, bringing Wisps, the return of the classic Carousel, playable jungle monsters and Lux as a shape-shifting Avatar. Set 17: Space Gods stayed playable alongside it for a limited time.',
    highlights: [
      'Wisps: one-time shop effects in every other shop',
      'The classic Carousel returns',
      'Riftbeasts and the Elder Dragon are playable',
      'First set on Unreal Engine',
    ],
    groups: [
      {
        title: 'New in this set',
        type: 'other',
        changes: [
          {
            target: 'Wisps',
            kind: 'new',
            what: 'One-time effects in the rightmost shop slot of every other shop',
            note: 'Buy one per round during planning. Seven kinds: Champion, Combat, Misc, Shop, Gold/XP, Risky and Item.',
          },
          { target: 'Carousel', kind: 'new', what: 'The pre-Set 17 Carousel is back, with better odds of higher-cost champions' },
          { target: 'Riftbeasts', kind: 'new', what: 'Jungle monsters and the Elder Dragon are playable units' },
          { target: 'Lux, the Avatar', kind: 'new', what: 'A 5-cost in nine origin forms whose chosen trait counts twice' },
          { target: 'Opening encounters', kind: 'change', what: 'Refreshed with lower-variance options' },
          { target: 'Targeting', kind: 'change', what: 'Units no longer lose their target after crowd control' },
        ],
      },
      {
        title: 'Engine',
        type: 'other',
        changes: [
          {
            target: 'Unreal Engine',
            kind: 'new',
            what: 'The game runs on Unreal Engine from this set on',
            note: 'The PC client stays on the old platform until a dedicated TFT client ships four patches in.',
          },
          {
            target: 'Launch week',
            kind: 'fix',
            what: 'Mid-patch updates from August 27 to September 1 fixed more than 40 bugs, memory leaks and performance problems',
          },
        ],
      },
    ],
    source: {
      label: 'Official 18.1 patch notes',
      url: 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-1',
    },
  },
];

export const SET_OVERVIEW = {
  title: 'Enchanted Wilds at a glance',
  intro:
    'A shifting forest where rival clans fight for territory and magical Wisps empower whoever earns their trust. 65 champions, 13 origins, 12 classes and 11 one-unit traits.',
  mechanics: [
    {
      name: 'Wisps',
      body: 'One-time effects sold in the rightmost shop slot of every other shop, one per round. They range from combat power and economy to items and risky gambles, and later in the game every other Wisp offered is a combat one.',
    },
    {
      name: 'Lux, the Avatar',
      body: 'A 5-cost who comes in nine origin forms. Her chosen trait counts twice, you can field only one Avatar, and only one player per lobby can own an Avatar of a given trait.',
    },
    {
      name: 'Riftbeasts and the Elder Dragon',
      body: 'Jungle monsters are playable. The Elder Dragon takes two team slots and adds two to Riftbeast, and the top Riftbeast breakpoint raises your maximum team size.',
    },
    {
      name: 'The Carousel',
      body: 'The pre-Set 17 Carousel is back, with better odds of higher-cost champions.',
    },
  ],
  origins: ['Blackthorn', 'Blossom', 'Coven', 'Elderwood', 'Fae', 'Flora Fatalis', 'Inferno', 'Lunar', 'Primal', 'Riftbeast', 'Rival', 'Solar', 'Sprykin'],
  classes: ['Adaptor', 'Brawler', 'Defender', 'Executioner', 'Hunter', 'Invoker', 'Juggernaut', 'Rapidfire', 'Ravager', 'Spellweaver', 'Summoner', 'Vanguard'],
  source: {
    label: 'Official Set 18 overview',
    url: 'https://teamfighttactics.leagueoflegends.com/en-us/set-overview/tft-set-18-enchanted-wilds/',
  },
};

export interface EsportsEvent {
  name: string;
  dates: string;
  /** Last day of the event (UTC), to mark finished events */
  ends: string;
  detail: string;
}

export const ESPORTS: EsportsEvent[] = [
  { name: 'Riftbeast Cup', dates: 'Sep 4–6', ends: '2026-09-06', detail: 'TFT Pro Circuit cup in every region, $30,200 per region.' },
  { name: 'Elderwood Cup', dates: 'Sep 18–20', ends: '2026-09-20', detail: 'Pro Circuit cup with paired regions facing off, $30,200 per region.' },
  { name: 'Tactician’s Trials 1', dates: 'Sep 19–20, 25–27', ends: '2026-09-27', detail: 'Open qualifier in Americas, EMEA and APAC starting from 256 players, $12,500 per event.' },
  { name: 'Blossom Cup', dates: 'Oct 2–4', ends: '2026-10-04', detail: 'Final Pro Circuit cup of the set, $30,200 per region.' },
  { name: 'Tactician’s Trials 2', dates: 'Oct 10–11, 16–18', ends: '2026-10-18', detail: 'Second open qualifier, $12,500 per event.' },
  { name: 'Tactician’s Superbrawl', dates: 'Nov 6–8', ends: '2026-11-08', detail: '4v4 team tournament; qualification snapshot on November 2.' },
  { name: 'Regional Finals and Tactician’s Crown', dates: 'After the cups', ends: '2026-12-31', detail: '64 players per regional final ($50,000 each), then 40 players worldwide compete for $470,000 at the Crown.' },
];

export const ESPORTS_SOURCE = {
  label: 'Compete in Enchanted Wilds',
  url: 'https://teamfighttactics.leagueoflegends.com/en-us/news/esports/compete-in-enchanted-wilds/',
};

export const OFFICIAL_LINKS = [
  { label: 'TFT patch notes', url: 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/' },
  { label: 'Set 18 overview', url: SET_OVERVIEW.source.url },
  { label: 'Unreal Engine migration FAQ', url: 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/faq-tft-unreal-migration/' },
  { label: 'Esports calendar', url: ESPORTS_SOURCE.url },
];

export function latestPatchNote(): PatchNote {
  return PATCH_NOTES[0];
}
