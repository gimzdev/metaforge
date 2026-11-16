/* ── Set 19: Prismatic Tour, as Riot showed it on November 15, 2026 ─────────────────────────────
   Riot's Dev Drop video is the source. The roster, the traits and the unlock quests are written down from it and
   were checked against tactics.tools' listing of the same reveal on November 15. Riot gave no numbers yet (stats,
   ability values, what each breakpoint grants): they come with the PBE, and then from the game data like every set. */

export const SET19 = {
  number: 19,
  name: 'Prismatic Tour',
  /** The day everything below was read. */
  read: '2026-11-15',
  intro:
    'A music set: 94 champions play in 14 bands, 14 classes and 19 traits that belong to a single champion. Unlocks return, and five bands reach their Prismatic tier through a quest.',
  dates: [
    { label: 'Revealed', date: 'November 15', detail: 'Riot’s Dev Drop video, a day after the set cinematic.' },
    { label: 'On the PBE', date: 'November 17', detail: 'Announced with the reveal, for the afternoon, Pacific time.' },
    { label: 'Live', date: 'December 1', detail: 'With patch 19.1, on Riot’s patch schedule (Pacific time). The reveal names Wednesday, December 2.' },
  ],
  mechanics: [
    {
      name: 'Unlocks',
      body: '36 of the 94 champions are not in the shop when a game starts. Each has a quest, and completing it adds the champion to your shops. The quests go from the 1-cost Kobuko to the four 7-costs.',
    },
    {
      name: 'Bands and solo artists',
      body: 'Origins are bands and genres. 14 of them have breakpoints, and 19 traits belong to a single champion, such as Disco for Nunu & Willump or Tango for Twisted Fate.',
    },
    {
      name: 'K/DA counts star levels',
      body: 'K/DA counts the total star level of its champions, not how many are on the board: 3, 5, 7, 10, 13, 15 and 21.',
    },
    {
      name: 'True Damage has two sides',
      body: 'A streak trait you flip like a record: the A-side pays for winning fights, the B-side for losing them.',
    },
    {
      name: 'Prismatic quests',
      body: 'Prismatic tiers no longer come from emblems. Pentakill, Ionic Spark, K/DA, Heartsteel and True Damage each have a quest that unlocks theirs.',
    },
    {
      name: 'Music that follows the board',
      body: 'Each band on your board adds its track to the music, and a higher trait tier plays a fuller version of it.',
    },
  ],
  sources: [
    { label: 'TFT Dev Drop: Prismatic Tour (Riot Games)', url: 'https://www.youtube.com/watch?v=ehNDT_IYjSQ' },
    { label: 'Riot’s first look at Set 19, November 2', url: 'https://teamfighttactics.leagueoflegends.com/en-us/news/dev/new-client-set-19-tease-and-compensation-rewards/' },
    { label: 'Riot’s patch schedule', url: 'https://support.riotgames.com/en-us/tft/events/patch-schedule-teamfight-tactics' },
  ],
} as const;

export interface Set19Champion {
  name: string;
  cost: 1 | 2 | 3 | 4 | 5 | 7;
  traits: string[];
  /** The quest that adds the champion to the shop, in short. Champions without one are in the shop from the start. */
  unlock?: string;
}

const c = (name: string, cost: Set19Champion['cost'], traits: string, unlock?: string): Set19Champion => ({ name, cost, traits: traits.split(', '), ...(unlock ? { unlock } : {}) });

export const SET19_CHAMPIONS: Set19Champion[] = [
  c('Elise', 1, 'Ionic Spark, Frontman'),
  c('Gnar', 1, 'Pentakill, Trickshot'),
  c('Katarina', 1, 'Classical, Slayer'),
  c('Kayn', 1, 'Heartsteel, Slayer'),
  c('Kennen', 1, 'True Damage, Bodyguard'),
  c('Kobuko', 1, 'Hyperpop, Frontman', 'Star up Ziggs and give him items'),
  c('Lillia', 1, 'K/DA, Bodyguard'),
  c('Neeko', 1, 'K/DA, Encore, Prodigy'),
  c('Olaf', 1, 'Pentakill, Rock, Juggernaut'),
  c('Sett', 1, 'Heartsteel, Frontman'),
  c('Taric', 1, 'Beach Pop, Juggernaut'),
  c('Varus', 1, 'Rock, Encore'),
  c('Yunara', 1, 'Ionic Spark, Swiftstriker'),
  c('Ziggs', 1, 'Hyperpop, Arcanist, Swiftstriker'),
  c('Zoe', 1, 'Beach Pop, Arcanist'),

  c('Annie', 2, 'Ionic Spark, Arcanist, Juggernaut'),
  c('Ashe', 2, 'Beach Pop, Swiftstriker', 'Give items to a Beach Pop champion'),
  c('Camille', 2, 'Rock, Slayer'),
  c('Ezreal', 2, 'Heartsteel, Encore'),
  c('Gragas', 2, 'K/DA, Juggernaut'),
  c('Illaoi', 2, 'Illbeats, Frontman'),
  c('Jax', 2, 'EDM, Bodyguard, Swiftstriker'),
  c('Karthus', 2, 'Pentakill, Arcanist'),
  c('Lucian', 2, 'Jazz, Hitmaker, Encore'),
  c('Lulu', 2, 'Hyperpop, Choreographer', 'Hyperpop champions cast enough times with the trait active'),
  c('Lux', 2, 'Ionic Spark, Prodigy'),
  c('Nasus', 2, 'Classical, Bodyguard', 'Give items to a Classical champion'),
  c('Qiyana', 2, 'True Damage, Renegade'),
  c('Renata Glasc', 2, 'Classical, Choreographer', 'Give items to a Classical or Choreographer champion'),
  c('Renekton', 2, 'Beach Pop, Frontman'),
  c('Samira', 2, 'Classical, Renegade, Trickshot', 'Give items to a Classical, Renegade or Trickshot champion'),
  c('Seraphine', 2, 'Indie', 'Reroll enough times before the Stage 2 carousel'),
  c('Tristana', 2, 'Hyperpop, Hitmaker', 'Get enough kills with Hyperpop active'),

  c('Amumu', 3, 'Emo'),
  c('Bard', 3, 'Jazz, Swiftstriker'),
  c('Braum', 3, 'Illbeats, Juggernaut'),
  c('Briar', 3, 'Ionic Spark, Slayer'),
  c('Draven', 3, 'Illbeats, Trickshot'),
  c('Ekko', 3, 'True Damage, Juggernaut, Prodigy'),
  c('Evelynn', 3, 'K/DA, Renegade', 'Field enough K/DA or Renegade champions'),
  c('Galio', 3, 'Jazz, Frontman', 'Have enough Bodyguard, Juggernaut or Frontman traits active, at level 7'),
  c('K’Sante', 3, 'Heartsteel, Bodyguard'),
  c('Kai’Sa', 3, 'K/DA, Trickshot'),
  c('Malzahar', 3, 'Composer, Prodigy'),
  c('Senna', 3, 'True Damage, Hitmaker'),
  c('Swain', 3, 'Rock, Arcanist, Frontman'),
  c('Syndra', 3, 'Beach Pop, Choreographer', 'Field enough star levels of Beach Pop or Choreographer champions'),
  c('Tibbers', 3, 'Ionic Spark, Bodyguard', 'Star up Annie and give her items'),
  c('Viego', 3, 'Pentakill, Choreographer, Slayer'),

  c('Ahri', 4, 'K/DA, Choreographer'),
  c('Alistar', 4, 'Country', 'Put a Chain Vest on a caster or a marksman, at level 7'),
  c('Alune', 4, 'Heartsteel, Manager, Prodigy', 'Field enough different Heartsteel or Prodigy champions, at level 7'),
  c('Aurora', 4, 'Ionic Spark, Renegade'),
  c('Garen', 4, 'Synthwave, Choreographer'),
  c('Graves', 4, 'Beach Pop, Renegade'),
  c('Jhin', 4, 'Classical, Encore'),
  c('Jinx', 4, 'Ionic Spark, Hitmaker', 'Give items to an Ionic Spark or Hitmaker champion, at level 7'),
  c('Kayle', 4, 'Pentakill, Swiftstriker', 'Field enough different Pentakill or Swiftstriker champions, at level 7'),
  c('Leona', 4, 'K/DA, Bodyguard, Manager'),
  c('Locke', 4, 'Rock, Swiftstriker'),
  c('Mel', 4, 'R&B, Arcanist'),
  c('Shyvana', 4, 'Ionic Spark, Frontman'),
  c('Thresh', 4, 'Classical, Frontman', 'Keep enemies Captivated by Classical long enough'),
  c('Vayne', 4, 'Rock, Trickshot', 'Field Rock for enough fights, at level 7'),
  c('Wukong', 4, 'Gu Feng', 'Allies deal enough damage while you field Xayah'),
  c('Xayah', 4, 'Gu Feng, Hitmaker'),
  c('Yasuo', 4, 'True Damage, Slayer', 'Field enough star levels of True Damage and Slayer champions, at level 7'),
  c('Yone', 4, 'Heartsteel, Slayer'),
  c('Yorick', 4, 'Pentakill, Juggernaut'),
  c('Yuumi', 4, 'Illbeats, Encore'),
  c('Zac', 4, 'Beach Pop, Juggernaut', 'Field enough different Beach Pop or Juggernaut champions, at level 7'),

  c('Akali (K/DA)', 5, 'K/DA', 'Field enough K/DA star levels, while True Damage Akali is locked'),
  c('Akali (True Damage)', 5, 'True Damage, Freestyle', 'Earn enough True Damage Bling, while K/DA Akali is locked'),
  c('Aphelios', 5, 'Heartsteel', 'Star up Alune or Yone'),
  c('Dr. Mundo', 5, 'Record Mogul, Manager'),
  c('Gwen', 5, 'Ionic Spark, Melodic Heart', 'Have Ionic Spark fans cheer enough times'),
  c('Janna', 5, 'Gu Feng, Windblessed, Prodigy', 'Earn enough interest while you field Xayah'),
  c('Lee Sin', 5, 'Gu Feng', 'Deal enough damage to players while you field Xayah'),
  c('Miss Fortune', 5, '8-Bit, Hitmaker'),
  c('Mordekaiser', 5, 'Pentakill', 'Field enough Pentakill star levels'),
  c('Nidalee', 5, 'Mariachi, Choreographer'),
  c('Nunu & Willump', 5, 'Disco, Frontman'),
  c('Pyke', 5, 'Rock, Renegade', 'Hold enough gold at the end of a fight, at level 7'),
  c('Rell', 5, 'R&B, Beat Master'),
  c('Taliyah', 5, 'Beach Pop, Encore', 'Start a champion of each cost in a Beach Pop hex'),
  c('Teemo', 5, 'Hyperpop, Hype Man', 'Collect enough Hyperpop Hype'),
  c('Twisted Fate', 5, 'Tango, Trickshot'),
  c('Vi', 5, 'EDM, Juggernaut'),
  c('Vladimir', 5, 'Classical, Arcanist', 'Field only a set number of champions in the two front rows, at level 8'),
  c('Zeri', 5, 'Goth, Swiftstriker'),

  c('Baron Nashor', 7, 'One Monster Band', 'Collect all of Malzahar’s instruments and deal enough damage with him'),
  c('Rakan', 7, 'Boy Band', 'Win or lose enough fights in a row, at level 8 or higher'),
  c('Smeech', 7, 'Jazz, Slayer', 'Have enough non-unique traits active, at level 9'),
  c('Sona', 7, 'Producer, Collab', 'Inspire Collab champions enough times, at level 10'),
];

export interface Set19Trait {
  name: string;
  /** The numbers of the trait's breakpoints, as shown in the reveal. */
  breakpoints: number[];
  note?: string;
}

const t = (name: string, breakpoints: number[], note?: string): Set19Trait => ({ name, breakpoints, ...(note ? { note } : {}) });

/** The 14 bands and genres with breakpoints. */
export const SET19_BANDS: Set19Trait[] = [
  t('Beach Pop', [3, 5, 7]),
  t('Classical', [2, 4, 6]),
  t('EDM', [2]),
  t('Gu Feng', [2, 3, 4]),
  t('Heartsteel', [1, 3, 5, 7], 'Prismatic quest'),
  t('Hyperpop', [2, 3, 4, 5]),
  t('Illbeats', [2, 3, 4]),
  t('Ionic Spark', [3, 5, 7, 10], 'Prismatic quest'),
  t('Jazz', [2, 3, 4]),
  t('K/DA', [3, 5, 7, 10, 13, 15, 21], 'Star levels. Prismatic quest'),
  t('Pentakill', [3, 5, 7], 'Prismatic quest'),
  t('R&B', [1, 2]),
  t('Rock', [3, 4, 5, 7]),
  t('True Damage', [3, 5], 'A-side or B-side. Prismatic quest'),
];

/** The 14 classes. */
export const SET19_CLASSES: Set19Trait[] = [
  t('Arcanist', [2, 4, 6]),
  t('Bodyguard', [2, 4, 6]),
  t('Choreographer', [2, 3, 4, 5]),
  t('Collab', [3, 5]),
  t('Encore', [2, 4]),
  t('Frontman', [2, 4, 6]),
  t('Hitmaker', [2, 4]),
  t('Juggernaut', [2, 4, 6]),
  t('Manager', [2, 3, 4]),
  t('Prodigy', [2, 3, 4, 5]),
  t('Renegade', [2, 3, 4, 5]),
  t('Slayer', [2, 4, 6]),
  t('Swiftstriker', [2, 3, 4, 5]),
  t('Trickshot', [2, 3, 4]),
];

const multi = new Set([...SET19_BANDS, ...SET19_CLASSES].map((x) => x.name));

/** The champions of a trait, in the roster's order (by cost, then by name). */
export const set19Members = (trait: string) => SET19_CHAMPIONS.filter((x) => x.traits.includes(trait));

/** The 19 traits that belong to a single champion, with that champion. */
export const SET19_SOLO: { trait: string; champion: string }[] = SET19_CHAMPIONS.flatMap((x) =>
  x.traits.filter((name) => !multi.has(name)).map((trait) => ({ trait, champion: x.name })),
).sort((a, b) => a.trait.localeCompare(b.trait));

export const SET19_COSTS = [1, 2, 3, 4, 5, 7] as const;
