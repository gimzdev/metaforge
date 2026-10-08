/**
 * Set 18 patch news summarized from Riot's notes; the patch calendar lives in src/config/game.ts.
 * Targets use in-game names so the page can attach the right icon and link.
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
  groups: ChangeGroup[];
  source: { label: string; url: string };
}

const PATCH_18_3_URL = 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-3/';
const PATCH_18_4_URL = 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-4/';

export const PATCH_NOTES: PatchNote[] = [
  {
    id: '18-4b',
    label: '18.4b',
    title: 'Heart of Steel pulled, three arenas off and a round of low-cost buffs',
    date: '2026-10-07',
    kind: 'mid-patch',
    summary:
      'A same-day B-patch, PC first with mobile to follow. It temporarily switches off Heart of Steel and three arenas, limits Coven Acolyte and Dark Ritual to one per lobby between them and Chosen of the Sun to one, buffs seven champions and retunes ten Augments and eight Wisps, including new costs for Search Party and Three Me.',
    groups: [
      {
        title: 'Temporarily disabled',
        type: 'augment',
        changes: [
          { target: 'Heart of Steel', kind: 'disabled', what: 'Augment disabled', note: 'Temporarily off to address a bug.' },
        ],
      },
      {
        title: 'Systems',
        type: 'other',
        changes: [
          { target: 'Choncc’s Splash Party', kind: 'disabled', what: 'Arena temporarily disabled to support performance' },
          { target: 'Night Versus Dawn', kind: 'disabled', what: 'Arena temporarily disabled to support performance' },
          { target: 'Bridge of Progress', kind: 'disabled', what: 'Arena temporarily disabled to support performance' },
          { target: 'Bug fix', kind: 'fix', what: 'Some champion abilities could disappear before dealing damage.' },
        ],
      },
      {
        title: 'Champions',
        type: 'unit',
        changes: [
          { target: 'Camille', kind: 'buff', what: 'Ability damage', from: '150/225/375 AD', to: '150/225/400 AD' },
          { target: 'Varus', kind: 'buff', what: 'Mana', from: '30/120', to: '20/110' },
          { target: 'Alistar', kind: 'buff', what: 'Heal', from: '200/260/320 AP', to: '230/300/400 AP' },
          { target: 'Alistar', kind: 'buff', what: 'Spell damage', from: '100/150/225 AP', to: '180/270/420 AP' },
          { target: 'Gromp', kind: 'buff', what: 'Splash damage (AP form)', from: '160/240/375 AP', to: '180/270/435 AP' },
          { target: 'Gromp', kind: 'buff', what: 'Base AD (AD form)', from: '45', to: '50' },
          { target: 'Gromp', kind: 'buff', what: 'Attack Speed (AD form)', from: '0.70', to: '0.75' },
          { target: 'Murkwolf', kind: 'buff', what: 'Empowered attack damage', from: '60/90/135 AD', to: '65/100/160 AD' },
          { target: 'Warwick', kind: 'buff', what: 'Spell damage', from: '215/325/500 AD', to: '230/345/535 AD' },
          { target: 'Warwick', kind: 'buff', what: 'Spell healing', from: '20%', to: '25%' },
          { target: 'Mama Beak', kind: 'buff', what: 'Base AD', from: '55', to: '60' },
          { target: 'Nidalee', kind: 'fix', what: 'Armor Penetration matches its tooltip, as per the 18.3 fix' },
        ],
      },
      {
        title: 'Wisps',
        type: 'other',
        changes: [
          { target: 'Abandon Ship', kind: 'change', what: 'Only appears in the first 2 seconds of the Planning Phase' },
          { target: 'Stat Booster Wisps', kind: 'nerf', what: 'Armor and Magic Resist', from: '10', to: '8' },
          { target: 'Stat Booster Wisps', kind: 'nerf', what: 'Attack Speed', from: '8%', to: '6%' },
          { target: 'Combust', kind: 'buff', what: 'Explosion damage', from: '12%', to: '15%' },
          { target: 'Healing Pool', kind: 'change', what: 'Requires at least 10 missing Health to appear' },
          { target: 'Mana-Rich Soil', kind: 'nerf', what: 'Mana reduction', from: '25/18%', to: '20/15%' },
          { target: 'Search Party', kind: 'buff', what: 'Cost', from: '3/1 gold', to: '1/0 gold' },
          { target: 'Thingamajig Wisps', kind: 'change', what: 'Less likely to grant Mana Regen Boosters' },
          { target: 'Three Me', kind: 'nerf', what: 'Cost', from: '9 gold', to: '10 gold' },
        ],
      },
      {
        title: 'Augments',
        type: 'augment',
        changes: [
          { target: 'Challenger’s Grace', kind: 'buff', what: 'Buff duration', from: '3s', to: '4s' },
          { target: 'Early Learnings', kind: 'nerf', what: 'Baseline AD/AP', from: '5%', to: '3%' },
          { target: 'Electrocharge I', kind: 'nerf', what: 'Damage by stage', from: '30/50/70/90', to: '25/40/60/80' },
          { target: 'Future Focused', kind: 'nerf', what: 'Gold', from: '8', to: '5' },
          { target: 'Giant and Mighty', kind: 'buff', what: 'Health', from: '200', to: '225' },
          { target: 'Group Hug I', kind: 'buff', what: 'Resists', from: '6', to: '7' },
          { target: 'Group Hug II', kind: 'buff', what: 'Resists', from: '9', to: '10' },
          { target: 'Heroic Grab Bag', kind: 'buff', what: 'Initial gold', from: '4', to: '6' },
          { target: 'Hold the Line', kind: 'buff', what: 'AD', from: '9%', to: '11%' },
          { target: 'Hold the Line', kind: 'buff', what: 'AP', from: '10%', to: '11%' },
          { target: 'Spirit of Redemption', kind: 'buff', what: 'Heal', from: '7.5%', to: '9%' },
        ],
      },
      {
        title: 'Augment fixes',
        type: 'augment',
        changes: [
          { target: 'Weight The Worth', kind: 'fix', what: 'No longer spawns copies of the Golden Egg.' },
          { target: 'Min-Max', kind: 'fix', what: 'No longer missing the Golden Magnetic Remover.' },
          { target: 'Coven Acolyte', kind: 'fix', what: 'Now correctly limited to 1 per lobby, shared with Dark Ritual.' },
          { target: 'Dark Ritual', kind: 'fix', what: 'Now correctly limited to 1 per lobby, shared with Coven Acolyte.' },
          { target: 'Chosen of the Sun', kind: 'fix', what: 'Now correctly limited to 1 per lobby.' },
        ],
      },
    ],
    source: { label: 'Official 18.4 patch notes (mid-patch update)', url: PATCH_18_4_URL },
  },
  {
    id: '18-4',
    label: '18.4',
    title: 'Four new Wisps, trait tuning and a wave of champion changes',
    date: '2026-10-07',
    kind: 'patch',
    summary:
      'Shorter combat phases, a trait pass (Blossom, Eclipse, Lunar, Riftbeast and Sprykin stronger; Executioner, Fae, Juggernaut and Coven trimmed), changes to 24 champions across all five tiers, Ashe and Draven refunding mana on a miss, Spirit Visage buffed and four new Wisps. Dark Ritual, Construct-A-Companion and Forge-A-Friend are back.',
    groups: [
      {
        title: 'Systems',
        type: 'other',
        changes: [
          { target: 'Combat phases', kind: 'change', what: 'Combat Arrival and Combat Departure phases', to: '1 second shorter each' },
          { target: 'Polymorph Wisps', kind: 'change', what: 'Only offered within the first 2 seconds of the Planning Phase' },
          { target: 'Wisps at low health', kind: 'change', what: 'No longer offered below 20 HP', note: 'All stat consumables, Golden Goose, Major Gambit and Barter.' },
        ],
      },
      {
        title: 'Traits',
        type: 'trait',
        changes: [
          { target: 'Blossom', kind: 'buff', what: 'AD/AP at 7 and 9', from: '45/50%', to: '50/55%' },
          { target: 'Coven', kind: 'nerf', what: '130 Cashout: 2 Components', from: '2x Components', to: '1x Component + 6 gold' },
          { target: 'Coven', kind: 'change', what: '130 Cashout: Elise and Cassiopeia', from: '1x Component + 2 Elise + 1 Cassio', to: '1x Component + 2* Elise' },
          { target: 'Coven', kind: 'change', what: '130 Cashout: random item', from: '1x Random Item', to: '1x Component + 2* Camille + 3g' },
          { target: 'Coven', kind: 'change', what: '130 Cashout: Caitlyn', from: '2 Caitlyn + 1x Component + 3g', to: '2 Caitlyn + 1x Component' },
          { target: 'Eclipse', kind: 'buff', what: 'Initial delay before execution', from: '10s', to: '8s' },
          { target: 'Elderwood', kind: 'nerf', what: 'Deepwood Protector mana at 7', from: '20/70', to: '20/60' },
          { target: 'Elderwood', kind: 'buff', what: 'Deepwood Protector resists at 7', from: '65', to: '70' },
          { target: 'Elderwood', kind: 'nerf', what: 'Health multiplier for Elderwood Plants starting up at 9', from: '155%', to: '140%' },
          { target: 'Executioner', kind: 'nerf', what: 'Bleed damage at 3/4', from: '30/40%', to: '25/35%' },
          { target: 'Fae', kind: 'nerf', what: 'AD/AP per Pixie', from: '5/8%', to: '4.5/7%' },
          { target: 'Juggernaut', kind: 'nerf', what: 'Durability', from: '20/33/45%', to: '20/30/42%' },
          { target: 'Lunar', kind: 'buff', what: 'Ability Power', from: '7/10/14/18%', to: '7/12/16/20%' },
          { target: 'Riftbeast', kind: 'buff', what: 'AD/AP/AS every 5 seconds at 7', from: '5%', to: '6%' },
          { target: 'Sprykin', kind: 'buff', what: 'Stats at 7', from: '45% HP + 45% AS', to: '55% HP + 55% AS' },
        ],
      },
      {
        title: 'Tier 1 champions',
        type: 'unit',
        changes: [
          { target: 'Camille', kind: 'buff', what: 'Damage', from: '150/225/375/640 AD', to: '150/225/400/665 AD' },
          { target: 'Kobuko', kind: 'buff', what: 'Heal', from: '265/315/460/575 AP', to: '285/335/480/595 AP' },
          { target: 'Rakan', kind: 'buff', what: 'Shield', from: '270/320/415/490', to: '290/340/435/510' },
          { target: 'Xayah', kind: 'buff', what: 'Ability damage', from: '68/102/155/165', to: '73/108/165/175' },
          { target: 'Varus', kind: 'buff', what: 'Attack Speed', from: '0.70', to: '0.75' },
          { target: 'Veigar', kind: 'nerf', what: 'Ability damage', from: '200/300/450/765', to: '190/285/430/725' },
          { target: 'Veigar', kind: 'nerf', what: 'Low-health ability damage', from: '300/450/675/1015', to: '285/430/640/1000' },
        ],
      },
      {
        title: 'Tier 2 champions',
        type: 'unit',
        changes: [
          { target: 'Gromp', kind: 'nerf', what: 'Mana (AD form)', from: '20/80', to: '0/70' },
          { target: 'Gromp', kind: 'buff', what: 'Splash damage (AP form)', from: '160/240/360/610 AP', to: '160/240/375/625 AP' },
          { target: 'Kayle', kind: 'buff', what: 'Ability damage', from: '62/92/105/115', to: '65/97/110/115' },
          { target: 'Shen', kind: 'buff', what: 'Shield', from: '350/430/550/700', to: '375/450/575/725' },
          { target: 'Shen', kind: 'buff', what: 'Ally shield', from: '200/275/375/475', to: '225/300/400/500' },
          { target: 'Teemo', kind: 'buff', what: 'AoE damage', from: '55/82/130/215', to: '55/82/155/240' },
        ],
      },
      {
        title: 'Tier 3 champions',
        type: 'unit',
        changes: [
          { target: 'Hecarim', kind: 'change', what: 'Mana', from: '30/110', to: '50/110' },
          { target: 'Mama Beak', kind: 'buff', what: 'Ability damage', from: '22/30/48 AD', to: '22/30/52 AD' },
          { target: 'Rammus', kind: 'nerf', what: 'Shield', from: '400/550/725 AP', to: '400/550/700 AP' },
          { target: 'Rengar', kind: 'buff', what: 'Ability damage', from: '255/385/615 AD', to: '255/385/650 AD' },
          { target: 'Tristana', kind: 'buff', what: 'Ability damage', from: '160/240/385 AD', to: '175/265/420 AD' },
        ],
      },
      {
        title: 'Tier 4 champions',
        type: 'unit',
        changes: [
          { target: 'Brambleback', kind: 'buff', what: 'Ability bonus AD', from: '80% AD', to: '100% AD' },
          { target: 'Brambleback', kind: 'nerf', what: 'Leap damage', from: '155/235 AD', to: '135/205 AD' },
          { target: 'Ezreal', kind: 'buff', what: 'Small cast damage', from: '250/375 AD', to: '270/405 AD' },
          { target: 'Nidalee', kind: 'buff', what: 'Small spear damage (AP form)', from: '170/255 AP', to: '185/275 AP' },
          { target: 'Nidalee', kind: 'nerf', what: 'Ability damage (AD form)', from: '210/315 AD', to: '200/300 AD' },
          { target: 'Sivir', kind: 'buff', what: 'Ability damage', from: '190/285 AD', to: '200/300 AD' },
        ],
      },
      {
        title: 'Tier 5 champions',
        type: 'unit',
        changes: [
          { target: 'Ashe', kind: 'buff', what: 'Now refunds 70% of her mana if the arrow hits 0 enemies' },
          { target: 'Ashe', kind: 'nerf', what: 'Starting mana', from: '20', to: '0', note: 'Her maximum stays at 80.' },
          { target: 'Ashe', kind: 'nerf', what: 'Percent health damage', from: '2/3%', to: '1.5%' },
          { target: 'Draven', kind: 'buff', what: 'Now refunds 50% of his mana if the axes hit 0 enemies' },
          { target: 'Draven', kind: 'buff', what: 'Bleed damage', from: '140/210 AD', to: '150/225 AD' },
          { target: 'Ivern', kind: 'nerf', what: 'Greenfather Hexes damage amp', from: '8/12%', to: '6/10%' },
          { target: 'Ivern', kind: 'nerf', what: 'Greenfather Hexes bonus % HP', from: '8/12%', to: '6/10%' },
          { target: 'Ivern', kind: 'buff', what: 'Greenfather Hexes resists', from: '8/12', to: '10/14' },
          { target: 'Kennen', kind: 'nerf', what: 'Shield', from: '250/350 AP', to: '230/300 AP' },
          { target: 'Lux', kind: 'change', what: 'Solar bonus now reads: deal 15% bonus damage, plus an additional 12% for each unique 3-star champion fielded' },
        ],
      },
      {
        title: 'Items',
        type: 'item',
        changes: [
          { target: 'Crownguard', kind: 'nerf', what: 'Bonus Ability Power when the shield expires', from: '25', to: '20' },
          { target: 'Spirit Visage', kind: 'buff', what: 'Durability', from: '8%', to: '10%' },
          { target: 'Radiant Spirit Visage', kind: 'buff', what: 'Durability', from: '15%', to: '18%' },
          { target: 'Elderwood Emblem', kind: 'nerf', what: 'Resists', from: '35', to: '25' },
        ],
      },
      {
        title: 'Augments',
        type: 'augment',
        changes: [
          { target: 'Construct-A-Companion', kind: 'new', what: 'Re-enabled' },
          { target: 'Dark Ritual', kind: 'new', what: 'Re-enabled' },
          { target: 'Forge-A-Friend', kind: 'new', what: 'Re-enabled' },
          { target: 'Dark Ritual', kind: 'nerf', what: 'AP per Cashout (2 to 6)', from: '15/50/75/125/200', to: '12/33/50/100/175' },
          { target: 'Bronze For Life II', kind: 'nerf', what: 'Armor and Magic Resist', from: '4', to: '3' },
          { target: 'Chosen of the Sun', kind: 'change', what: 'Tier', from: 'Gold', to: 'Silver' },
          { target: 'Component Quest', kind: 'nerf', what: 'Final gold gain', from: '5', to: '1' },
          { target: 'Dummify', kind: 'buff', what: 'Starting health', from: '1000', to: '1500' },
          { target: 'Explosive Growth+', kind: 'nerf', what: 'XP gained per round', from: '10', to: '9' },
          { target: 'Heart of Steel', kind: 'buff', what: 'Max Health gain', from: '16', to: '18' },
          { target: 'Investment Strategy I', kind: 'buff', what: 'Max Health per interest', from: '8', to: '9' },
          { target: 'Investment Strategy I', kind: 'buff', what: 'Initial gold', from: '4', to: '6' },
          { target: 'Investment Strategy II', kind: 'buff', what: 'Max Health per interest', from: '10', to: '12' },
          { target: 'Investment Strategy II', kind: 'buff', what: 'Gold granted', from: '8', to: '10' },
          { target: 'Level Up!', kind: 'buff', what: 'Instant XP', from: '6', to: '10' },
          { target: 'Luxury Sub', kind: 'buff', what: 'Gold granted', from: '3', to: '5' },
          { target: 'Makeshift Armor I', kind: 'disabled', what: 'Disabled on 2-1' },
          { target: 'Makeshift Armor II', kind: 'disabled', what: 'Disabled on 2-1' },
          { target: 'Min-Max', kind: 'buff', what: 'Now grants 4 gold' },
          { target: 'Omega Riftbeast', kind: 'buff', what: 'Alpha Riftbeasts gain 15% bonus HP and 12% bonus Attack Speed' },
          { target: 'Pandora’s Items II', kind: 'buff', what: 'Now grants 4 gold' },
          { target: 'Small Furry Friend', kind: 'buff', what: 'Effectiveness', from: '35%', to: '45%' },
          { target: 'Trait Ladder 4', kind: 'nerf', what: 'Trait cashout gold', from: '6', to: '5' },
          { target: 'Trait Ladder 6', kind: 'nerf', what: 'Trait cashout gold', from: '10', to: '7' },
          { target: 'Trait Ladder 6', kind: 'buff', what: 'Trait cashout cost', from: '3x3 costs', to: '2x3 costs' },
          { target: 'Trait Ladder 7', kind: 'nerf', what: 'Trait cashout', from: 'Component Anvil + 8 gold', to: 'Component Anvil + 2 gold' },
          { target: 'Trait Ladder 8', kind: 'nerf', what: 'Trait cashout', from: '2 Different Components + Reforger', to: '2 Different Components' },
          { target: 'Trait Ladder 9', kind: 'nerf', what: 'Trait cashout', from: '3x5 costs + 2 gold', to: '2x5 costs + 2 gold' },
          { target: 'Verticality II', kind: 'buff', what: 'AD/AP per ally', from: '2%', to: '2.5%' },
          { target: 'Verticality III', kind: 'buff', what: 'AD/AP per ally', from: '3.5%', to: '4%' },
        ],
      },
      {
        title: 'Wisps',
        type: 'other',
        changes: [
          { target: 'Drizzle', kind: 'new', what: 'After 8 seconds of combat your team gains 10 mana', note: 'Blossom upgrade: 15 mana. 0-cost Wisp for stages 4-1 to 5-7.' },
          { target: 'Grove Armor', kind: 'new', what: 'Your highest-health champion gains 15 Armor and 15 Magic Resist', note: 'Blossom upgrade: 25 each. 0-cost Wisp for stages 4-1 to 5-7.' },
          { target: 'Returning Friend', kind: 'new', what: 'Gain a temporary Training Dummy with two Giant’s Belts', note: 'Blossom upgrade: three belts. 0-cost Wisp for stages 4-1 to 5-7.' },
          { target: 'Room for a Shroom', kind: 'new', what: 'Gain 2 random mushrooms', note: 'Blossom upgrade: 3 mushrooms. 0-cost Wisp for stages 4-1 to 5-7.' },
          { target: 'Backrow Star', kind: 'buff', what: 'AS bonus', from: '85%', to: '100%', note: 'Blossom upgrade: 115% to 130%.' },
          { target: 'Forest Guide', kind: 'nerf', what: 'Cost', from: '5 gold', to: '6 gold', note: 'Blossom upgrade: 4 to 5 gold.' },
          { target: 'Giant’s Growth', kind: 'buff', what: 'HP increase', from: '750', to: '800', note: 'Blossom upgrade: 750 to 800.' },
          { target: 'Improved Reach', kind: 'buff', what: 'Cost', from: '2 gold', to: '1 gold', note: 'Blossom upgrade: 2 to 1 gold.' },
          { target: 'Killing Frenzy', kind: 'buff', what: 'AS on kill', from: '115%', to: '130%', note: 'Blossom upgrade: 140% to 160%.' },
          { target: 'Mana Potion', kind: 'nerf', what: 'Mana restored', from: '80', to: '70', note: 'Radiant: 90 to 80.' },
          { target: 'Mana Potion', kind: 'nerf', what: 'Starting mana', from: '20', to: '10', note: 'Radiant: 20 to 10.' },
          { target: 'Stealthy', kind: 'buff', what: 'Duration', from: '6 seconds', to: '8 seconds', note: 'Blossom upgrade: 10 to 12 seconds.' },
        ],
      },
      {
        title: 'Bug fixes',
        type: 'other',
        changes: [
          { target: 'Bug fix', kind: 'fix', what: 'Dead dashing champions are no longer valid combat targets.' },
          { target: 'Bug fix', kind: 'fix', what: 'Xayah’s 4-star ability damage was incorrect.' },
          { target: 'Bug fix', kind: 'fix', what: 'Weight The Worth can no longer grant bugged copies of Adaptors.' },
          { target: 'Bug fix', kind: 'fix', what: 'The unit granted by Late Bloomer can no longer combine with other units on the board after combat.' },
          { target: 'Bug fix', kind: 'fix', what: 'Polymorph no longer runs on ghost armies.' },
          { target: 'Bug fix', kind: 'fix', what: 'The Solar tooltip now highlights correctly at 7 3-stars.' },
          { target: 'Bug fix', kind: 'fix', what: 'Mogul’s Mail was missing a space in its name.' },
          { target: 'Bug fix', kind: 'fix', what: 'Ashe’s celebration animation now plays properly.' },
          { target: 'Bug fix', kind: 'fix', what: 'Blossom-upgraded Pocket Change no longer gives an extra 1 gold when it appears in the shop instead of when purchased.' },
          { target: 'Bug fix', kind: 'fix', what: 'Morgana’s withering zone is no longer oddly rotated if she is knocked up mid-cast.' },
          { target: 'Bug fix', kind: 'fix', what: 'Rare cases where Ezreal’s big cast would not prioritize the largest group are fixed.' },
          { target: 'Bug fix', kind: 'fix', what: 'Artifactinate no longer gives a Spatula when it breaks apart an Emblem built from a Frying Pan.' },
          { target: 'Bug fix', kind: 'fix', what: '3-star Gnar throwing CC-immune targets off the board no longer occasionally destroys them for good.' },
          { target: 'Bug fix', kind: 'fix', what: 'Strongest targeting now breaks ties more consistently.' },
          { target: 'Bug fix', kind: 'fix', what: '“Unstoppable” is no longer capitalized on various tooltips.' },
          { target: 'Bug fix', kind: 'fix', what: 'The carousel tether VFX is easier to see.' },
          { target: 'Bug fix', kind: 'fix', what: 'Bramble Vest’s max health increase is now additive with other max health increases instead of multiplicative.' },
          { target: 'Bug fix', kind: 'fix', what: 'Ezreal’s tooltip now calls the ability “Forest’s Flurry”.' },
          { target: 'Bug fix', kind: 'fix', what: 'Loot orbs sometimes did not land where they were meant to.' },
          { target: 'Bug fix', kind: 'fix', what: 'Scuttle Crab now shows the range extension laser with the increased range.' },
          { target: 'Bug fix', kind: 'fix', what: 'The Indomitable no longer fails to trigger for the rest of combat if the target dies while the hook is in flight.' },
          { target: 'Bug fix', kind: 'fix', what: 'Warmog’s Armor has its apostrophe.' },
          { target: 'Bug fix', kind: 'fix', what: 'The Stealthy Wisp now says it affects your 3 strongest Assassins or Fighters.' },
          { target: 'Bug fix', kind: 'fix', what: 'Kha’Zix no longer targets an enemy that has no open adjacent hex for him to jump to.' },
          { target: 'Bug fix', kind: 'fix', what: 'Improved logic for acquiring 2- and 3-star champions when the bench is full.' },
          { target: 'Bug fix', kind: 'fix', what: 'Various bugs with Ghost Armies and missing stats, items and traits are fixed.' },
          { target: 'Bug fix', kind: 'fix', what: 'Auto-deploying Elderwood champions could cause the summons to fail to appear.' },
          { target: 'Bug fix', kind: 'fix', what: 'Various bugs with Thief’s Gloves and edge cases are fixed.' },
          { target: 'Bug fix', kind: 'fix', what: 'Legion of Threes no longer appears in Emblem Ensemble.' },
          { target: 'Bug fix', kind: 'fix', what: 'Blossom Polymorph Wisps no longer prioritize fielded champions over benched ones.' },
          { target: 'Bug fix', kind: 'fix', what: 'Heart of Steel can now stack even if the item is equipped mid-combat.' },
          { target: 'Bug fix', kind: 'fix', what: 'URF and Trait Tree are now mutually exclusive.' },
          { target: 'Bug fix', kind: 'fix', what: 'Ashe’s ability trail VFX no longer goes missing on occasion.' },
          { target: 'Bug fix', kind: 'fix', what: 'The opponent’s Empowered Hexes render more consistently.' },
          { target: 'Bug fix', kind: 'fix', what: 'A champion can no longer be barred from being sold when it sat in the previous slot of a recently starred-up champion.' },
          { target: 'Bug fix', kind: 'fix', what: 'Sivir would occasionally go missing on ghost army boards.' },
          { target: 'Bug fix', kind: 'fix', what: 'Units with Thief’s Gloves can no longer obtain 5 items in rare situations.' },
          { target: 'Bug fix', kind: 'fix', what: 'Buying a unit at the same time as LeBlanc prints a different unit while the bench is full no longer creates an invisible copy.' },
          { target: 'Bug fix', kind: 'fix', what: 'Arachnophobia: ranged champions no longer prioritize Elise over other magic tanks at the start of a combat round.' },
          { target: 'Bug fix', kind: 'fix', what: 'A Recurve Bow obtained from PvE loot orbs could not always be equipped onto a champion.' },
          { target: 'Bug fix', kind: 'fix', what: 'Combat could fail to resolve if a 3-star Draven cast before a 3-star Ivern.' },
          { target: 'Bug fix', kind: 'fix', what: 'The BFF’s and the Rider’s health bars no longer appear together after being transported to different boards.' },
          { target: 'Bug fix', kind: 'fix', what: 'Adaptors failed to gain the bonus from the Double Trouble augment.' },
          { target: 'Bug fix', kind: 'fix', what: 'The Eclipse trait no longer becomes a white box on the end-of-game trait tracker.' },
          { target: 'Bug fix', kind: 'fix', what: 'Karma is highlighted again when hovered during the Planning Phase.' },
          { target: 'Bug fix', kind: 'fix', what: 'Selling a unit during a match no longer leaves a unit drop VFX behind.' },
          { target: 'Bug fix', kind: 'fix', what: 'Fixed various server crashes, cleaned up lingering orb VFX during scouting and fixed fielding a champion at the last second failing under high network latency.' },
        ],
      },
    ],
    source: { label: 'Official 18.4 patch notes', url: PATCH_18_4_URL },
  },
  {
    id: '18-3b',
    label: '18.3b',
    title: 'Kha’Zix and Blackthorn trimmed, 18.2b changes restored',
    date: '2026-09-24',
    kind: 'mid-patch',
    summary:
      'A mid-patch update that answers meta shifts the main patch missed and restores several 18.2b balance changes that were unintentionally rolled back in 18.3. A hotfix on September 28 switched off the Major Polymorph Wisp.',
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
          { target: 'LeBlanc', kind: 'nerf', what: 'Clone chance', from: '10/15/40%', to: '10/15/30%', note: 'More ability damage to compensate.' },
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
    { name: 'The Carousel', body: 'The pre-Set 17 Carousel is back, with better odds of higher-cost champions.' },
  ],
  origins: ['Blackthorn', 'Blossom', 'Coven', 'Elderwood', 'Fae', 'Flora Fatalis', 'Inferno', 'Lunar', 'Primal', 'Riftbeast', 'Rival', 'Solar', 'Sprykin'],
  classes: ['Adaptor', 'Brawler', 'Defender', 'Executioner', 'Hunter', 'Invoker', 'Juggernaut', 'Rapidfire', 'Ravager', 'Spellweaver', 'Summoner', 'Vanguard'],
  source: { label: 'Official Set 18 overview', url: 'https://teamfighttactics.leagueoflegends.com/en-us/set-overview/tft-set-18-enchanted-wilds/' },
};

interface EsportsEvent {
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
