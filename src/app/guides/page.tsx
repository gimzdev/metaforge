import type { Metadata } from 'next';
import Link from 'next/link';
import { Coins, Compass, Gauge, LayoutGrid, Shuffle, Swords } from '@/components/icons';
import { ItemIcon } from '@/components/game/entities';
import { PageHeader } from '@/components/ui';
import { Expandable } from '@/components/ui-client';
import { SET_OVERVIEW } from '@/content/news';
import { brand } from '@/lib/site';
import { getStaticData } from '@/lib/static/load';
import type { Item } from '@/lib/static/types';
import { getMeta } from '@/lib/stats/service';
import { itemMinSample } from '@/lib/stats/tiers';
import { cn, fmt, placementTone, toneText } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Guides',
  description: 'TFT fundamentals, the full item recipe chart for the current set, emblems, and how Enchanted Wilds mechanics work.',
  alternates: { canonical: '/guides' },
};

const FUNDAMENTALS = [
  {
    icon: Coins,
    title: 'Economy',
    body: 'Every 10 gold you hold at the start of a round earns 1 more, up to 5 at 50 gold. Win and loss streaks pay extra, so commit to one or the other early instead of trading rounds evenly.',
  },
  {
    icon: Gauge,
    title: 'Leveling',
    body: 'Each level adds a unit slot and raises the odds of higher-cost champions. Level on the standard beats when your board is weak, and push levels when you are healthy and rich to find your 4 and 5-costs first.',
  },
  {
    icon: Shuffle,
    title: 'Rolling',
    body: 'A refresh costs 2 gold. Reroll comps roll at the level where their core cost is most likely (about 6 for 2-costs, 7 for 3-costs); fast-8 and fast-9 plans save gold and roll once they arrive.',
  },
  {
    icon: LayoutGrid,
    title: 'Positioning',
    body: 'Tanks in front, carries in a back corner behind a tank. Scout the lobby: move your carry away from enemy assassins and hooks, and spread out against area damage.',
  },
  {
    icon: Swords,
    title: 'Items',
    body: 'Slam good items early to save health, then move them to your carry later. Components that fit many champions keep you flexible; use the chart below to plan what to build.',
  },
  {
    icon: Compass,
    title: 'Pivoting',
    body: 'Play what the game gives you. Your items, your augments and what other players are contesting should decide your final comp more than a plan made in stage 1.',
  },
];

const recipeKey = (a: string, b: string) => [a, b].sort().join('+');
// The usual chart order: the eight stat components, then Frying Pan and Spatula last.
const ORDER = ['bfsword', 'recurvebow', 'needlesslylargerod', 'tearofthegoddess', 'chainvest', 'negatroncloak', 'giantsbelt', 'sparringgloves', 'fryingpan', 'spatula'];
const H2 = 'font-sans text-[17px] font-semibold tracking-normal text-moon';

function Avg({ avg, className }: { avg?: number; className: string }) {
  if (avg === undefined) return null;
  return (
    <span title="Average placement" className={cn('num font-semibold', className, toneText[placementTone(avg)])}>
      {fmt.place(avg)}
    </span>
  );
}

export default async function GuidesPage() {
  const data = await getStaticData();
  const meta = await getMeta({}).catch(() => null);
  const itemAvg = new Map<string, number>();
  if (meta && meta.meta.total > 0) {
    const minN = itemMinSample(meta.minN);
    for (const r of meta.items) if (r.n >= minN) itemAvg.set(r.id, r.avg);
  }

  const rankOf = (key: string) => {
    const i = ORDER.findIndex((o) => key.replace(/[^a-z]/g, '').endsWith(o));
    return i < 0 ? ORDER.length - 2.5 : i;
  };
  const components = data.items
    .filter((i) => i.category === 'component')
    .sort((a, b) => rankOf(a.key) - rankOf(b.key) || a.name.localeCompare(b.name));
  const componentKeys = new Set(components.map((c) => c.key));
  const recipes = new Map<string, Item>();
  for (const item of data.items) {
    const [a, b] = item.composition;
    if (item.composition.length !== 2 || !componentKeys.has(a) || !componentKeys.has(b)) continue;
    if (item.category !== 'completed' && item.category !== 'emblem') continue;
    const key = recipeKey(a, b);
    // Prefer the completed item if an emblem shares the recipe.
    if (recipes.get(key)?.category !== 'completed') recipes.set(key, item);
  }
  // Hide components that combine into nothing this set (e.g. a Frying Pan without recipes).
  const used = new Set<string>();
  for (const key of recipes.keys()) key.split('+').forEach((k) => used.add(k));
  const chartComponents = components.filter((c) => used.has(c.key));
  const emblems = data.items.filter((i) => i.category === 'emblem').sort((a, b) => a.name.localeCompare(b.name));
  const byKey = new Map(data.items.map((i) => [i.key, i]));
  const special = (e: Item) => e.composition.map((c) => byKey.get(c)?.name.toLowerCase() ?? c);
  const spatula = emblems.filter((e) => e.composition.length === 2 && special(e).some((n) => n.includes('spatula')));
  const pan = emblems.filter((e) => e.composition.length === 2 && special(e).some((n) => n.includes('pan')) && !spatula.includes(e));
  const otherEmblems = emblems.filter((e) => !spatula.includes(e) && !pan.includes(e));
  const partner = (e: Item, base: string) => e.composition.find((c) => !(byKey.get(c)?.name.toLowerCase() ?? '').includes(base)) ?? e.composition[1];

  return (
    <div className="space-y-12">
      <PageHeader title="Guides" art={brand.learn} />

      <Expandable id="fundamentals" title="Fundamentals" hint={`Economy, leveling, positioning, how ${data.set.name} works and how to read the stats.`}>
        <section className="space-y-4">
          <h2 className={H2}>Fundamentals</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FUNDAMENTALS.map((f) => (
              <div key={f.title} className="surface rounded-xl p-5">
                <f.icon className="size-5 text-wisp" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-lichen">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="set-mechanics" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className={H2}>{data.set.name} mechanics</h2>
            <p className="mt-1 text-sm text-lichen">{SET_OVERVIEW.intro}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {SET_OVERVIEW.mechanics.map((m) => (
              <div key={m.name} className="surface rounded-xl p-5">
                <h3 className="text-[15px] font-semibold">{m.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-lichen">{m.body}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-lichen">
            The{' '}
            <Link href="/builder" className="font-medium text-wisp hover:underline">team builder</Link>{' '}
            follows these rules: the Avatar&apos;s doubled trait, one Avatar per board, and the Elder Dragon&apos;s two
            slots and Riftbeast bonus.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={H2}>Reading MetaForge stats</h2>
          <div className="grid gap-5 text-sm leading-relaxed text-lichen md:grid-cols-2">
            <p>
              <span className="font-semibold text-moon">Average place</span> is the mean final placement, from 1 to 8. A random
              board averages 4.50, so anything under 4.2 is doing well.{' '}
              <span className="font-semibold text-moon">Top 4</span> and <span className="font-semibold text-moon">win</span>{' '}
              rates show consistency and ceiling.
            </p>
            <p>
              <span className="font-semibold text-moon">Δ</span> compares a row with the boards it was picked from, so an item
              with Δ −0.30 on a champion means that champion places 0.3 better with it. Rows built from fewer games are faded.
            </p>
            <p>
              <span className="font-semibold text-moon">Grades</span> use a shrunk average that pulls small samples toward 4.50,
              so a comp with 15 games can&apos;t outrank one with 1,500 on luck alone.
            </p>
            <p>All numbers come from the final boards of ranked games, grouped by patch using Riot&apos;s release dates.</p>
          </div>
        </section>
      </Expandable>

      <div className="grid grid-cols-1 items-start gap-10 xl:grid-cols-[auto_minmax(0,1fr)]">
        {chartComponents.length > 0 && (
          <section className="min-w-0 space-y-4">
            <h2 className="text-center text-[1.6rem] leading-tight">Item recipes</h2>
            <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-xl border hairline scroll-thin">
              <table className="table-fixed border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 size-[72px] bg-canopy" aria-label="Component" />
                    {chartComponents.map((c) => (
                      <th key={c.key} className="size-[72px] border-l hairline bg-canopy text-center align-middle">
                        <span className="inline-flex"><ItemIcon id={c.key} px={40} /></span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartComponents.map((row) => (
                    <tr key={row.key} className="border-t hairline">
                      <th className="sticky left-0 z-10 size-[72px] bg-canopy text-center align-middle">
                        <span className="inline-flex"><ItemIcon id={row.key} px={40} /></span>
                      </th>
                      {chartComponents.map((col) => {
                        const item = recipes.get(recipeKey(row.key, col.key));
                        return (
                          <td key={col.key} className={cn('size-[72px] border-l hairline text-center align-middle', row.key === col.key && 'bg-white/[0.025]')}>
                            {item && (
                              <span className="inline-flex flex-col items-center gap-1">
                                <ItemIcon id={item.key} px={40} />
                                <Avg avg={itemAvg.get(item.key)} className="text-[10px]" />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {emblems.length > 0 && (
          <section className="min-w-0 space-y-4">
            <h2 className="text-center text-[1.6rem] leading-tight">Emblems</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: 'Spatula', list: spatula, base: 'spatula', icon: components.find((c) => /spatula/i.test(c.name)) },
                { title: 'Frying Pan', list: pan, base: 'pan', icon: components.find((c) => /pan/i.test(c.name)) },
              ]
                .filter((g) => g.list.length > 0)
                .map((g) => (
                  <div key={g.title} className="surface overflow-hidden rounded-xl">
                    <div className="flex justify-center border-b hairline py-3">
                      {g.icon && <ItemIcon id={g.icon.key} px={32} link={false} />}
                      <h3 className="sr-only">{g.title} emblems</h3>
                    </div>
                    <ul>
                      {g.list.map((e) => (
                        <li key={e.key} className="border-t hairline first:border-t-0">
                          <Link href={`/items/${e.slug}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                            <ItemIcon id={e.key} px={32} link={false} />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name.replace(/\s*emblem$/i, '')}</span>
                            <Avg avg={itemAvg.get(e.key)} className="text-xs" />
                            <span className="flex items-center gap-1 text-xs text-fog">
                              + <ItemIcon id={partner(e, g.base)} px={24} link={false} hover={false} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
            {otherEmblems.length > 0 && (
              <div className="surface mx-auto w-full max-w-lg overflow-hidden rounded-xl">
                <h3 className="eyebrow flex h-14 items-center justify-center border-b hairline text-fog">Not craftable</h3>
                <ul className="grid grid-cols-1 gap-x-2 p-2 min-[420px]:grid-cols-2">
                  {otherEmblems.map((e) => (
                    <li key={e.key}>
                      <Link href={`/items/${e.slug}`} className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.03]">
                        <ItemIcon id={e.key} px={28} link={false} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name.replace(/\s*emblem$/i, '')}</span>
                        <Avg avg={itemAvg.get(e.key)} className="text-xs" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
