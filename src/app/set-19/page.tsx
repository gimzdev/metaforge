import type { Metadata } from 'next';
import { ExternalLink } from '@/components/icons';
import { PageHeader } from '@/components/ui';
import { SET19, SET19_BANDS, SET19_CHAMPIONS, SET19_CLASSES, SET19_COSTS, SET19_SOLO, set19Members, type Set19Trait } from '@/content/set19';

// Written from Riot's reveal (content/set19.ts), not from the game data: the page is the same for every visitor.
export const metadata: Metadata = {
  title: `Set ${SET19.number}: ${SET19.name}`,
  description: `TFT Set ${SET19.number}, ${SET19.name}: the 94 champions by cost, the bands and classes with their breakpoints, the 36 unlock quests and the dates, from Riot’s reveal of November 15, 2026.`,
  alternates: { canonical: '/set-19' },
};

const H2 = 'font-sans text-[17px] font-semibold tracking-normal text-moon';
const costColor = (cost: number) => `var(--color-cost-${cost <= 5 ? cost : 6})`;

function Traits({ title, note, traits }: { title: string; note: string; traits: readonly Set19Trait[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className={H2}>{title}</h2>
        <p className="mt-1 text-sm text-lichen">{note}</p>
      </div>
      <ul className="surface divide-y divide-line overflow-hidden rounded-xl">
        {traits.map((trait) => (
          <li key={trait.name} className="grid grid-cols-1 gap-x-6 gap-y-1 px-5 py-3.5 md:grid-cols-[10rem_12.5rem_minmax(0,1fr)] md:items-baseline">
            <div>
              <span className="text-[15px] font-semibold text-moon">{trait.name}</span>
              {trait.note && <span className="block text-[13px] leading-snug text-fog">{trait.note}</span>}
            </div>
            <div className="text-sm tabular-nums text-wisp">{trait.breakpoints.join(' / ')}</div>
            <div className="text-sm leading-relaxed text-lichen">
              {set19Members(trait.name).map((x, i) => (
                <span key={x.name}>
                  {i > 0 && ', '}
                  <span style={{ color: costColor(x.cost) }}>{x.name.replace(/ \(.+\)$/, '')}</span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Set19Page() {
  const unlocks = SET19_CHAMPIONS.filter((x) => x.unlock).length;
  return (
    <div className="space-y-12">
      <PageHeader title={`Set ${SET19.number}: ${SET19.name}`} description={SET19.intro} />

      <section aria-label="Dates" className="grid gap-3 sm:grid-cols-3">
        {SET19.dates.map((d) => (
          <div key={d.label} className="surface rounded-xl p-5">
            <div className="eyebrow text-fog">{d.label}</div>
            <div className="mt-2 text-[1.35rem] leading-tight text-moon">{d.date}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-lichen">{d.detail}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className={H2}>What is new</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SET19.mechanics.map((m) => (
            <div key={m.name} className="surface rounded-xl p-5">
              <h3 className="text-[15px] font-semibold">{m.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-lichen">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className={H2}>Champions</h2>
          <p className="mt-1 text-sm text-lichen">
            {SET19_CHAMPIONS.length} champions. {unlocks} of them are unlocked by a quest, written under their traits.
          </p>
        </div>
        {SET19_COSTS.map((cost) => {
          const list = SET19_CHAMPIONS.filter((x) => x.cost === cost);
          return (
            <div key={cost}>
              <h3 className="eyebrow" style={{ color: costColor(cost) }}>
                {cost}-cost <span className="text-fog">· {list.length}</span>
              </h3>
              <ul className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map((x) => (
                  <li key={x.name} className="surface rounded-lg px-3.5 py-2.5" style={{ borderLeftColor: costColor(cost), borderLeftWidth: 2 }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-semibold text-moon">{x.name}</span>
                      {x.unlock && <span className="eyebrow shrink-0 text-wisp">Unlock</span>}
                    </div>
                    <div className="mt-0.5 text-sm text-lichen">{x.traits.join(' · ')}</div>
                    {x.unlock && <div className="mt-1 text-[13px] leading-snug text-fog">{x.unlock}</div>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <Traits title="Bands" note="The 14 origins with breakpoints. Champions are coloured by cost." traits={SET19_BANDS} />
      <Traits title="Classes" note="The 14 classes." traits={SET19_CLASSES} />

      <section className="space-y-4">
        <div>
          <h2 className={H2}>Solo traits</h2>
          <p className="mt-1 text-sm text-lichen">The {SET19_SOLO.length} traits that belong to a single champion.</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SET19_SOLO.map((s) => (
            <li key={s.trait} className="surface flex items-baseline justify-between gap-3 rounded-lg px-3.5 py-2.5">
              <span className="text-[15px] font-semibold text-moon">{s.trait}</span>
              <span className="text-right text-sm text-lichen">{s.champion}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 border-t hairline pt-8">
        <h2 className={H2}>What is not known yet</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-lichen">
          Riot has shown names, costs, traits and quests, without numbers: champion stats, ability values, what each
          breakpoint grants and how much each quest asks for come with the PBE. MetaForge reads them from the game data
          then, and its tier lists move to Set {SET19.number} with the first ranked games on it.
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {SET19.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-wisp hover:underline">
                {s.label}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-fog">Read on November 15, 2026. The roster and the traits were checked against tactics.tools’ listing of the reveal.</p>
      </section>
    </div>
  );
}
