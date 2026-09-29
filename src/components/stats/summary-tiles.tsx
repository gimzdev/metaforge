import { cn, fmt, placementTone, toneText } from '@/lib/utils';
import type { Summary } from '@/lib/stats/types';
import { PlacementBars } from './bits';

/** Headline numbers for a set of boards. */
export function SummaryTiles({
  summary,
  playRate,
  playLabel = 'Play rate',
  className,
}: {
  summary: Summary;
  playRate?: number;
  playLabel?: string;
  className?: string;
}) {
  const tiles: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Average place', value: fmt.place(summary.avg), tone: toneText[placementTone(summary.avg)] },
    { label: 'Top 4 rate', value: fmt.pct(summary.top4) },
    { label: 'Win rate', value: fmt.pct(summary.win) },
  ];
  if (playRate !== undefined) tiles.push({ label: playLabel, value: fmt.pct(playRate, playRate < 0.1 ? 1 : 0) });
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-xl border hairline bg-lichen/10 md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)]',
        className,
      )}
    >
      {tiles.map((t) => (
        <div key={t.label} className="bg-canopy px-4 py-3.5">
          <div className="text-xs text-lichen">{t.label}</div>
          <div className={cn('num mt-1 font-display text-[1.6rem] leading-none', t.tone)}>{t.value}</div>
        </div>
      ))}
      {playRate === undefined && (
        <div className="bg-canopy px-4 py-3.5">
          <div className="text-xs text-lichen">Games</div>
          <div className="num mt-1 font-display text-[1.6rem] leading-none">{fmt.int(summary.boards)}</div>
        </div>
      )}
      <div className="col-span-2 bg-canopy px-4 py-3 md:col-span-1">
        <div className="flex justify-between text-xs text-lichen">
          <span>Placements</span>
          {playRate !== undefined && <span className="num text-fog">{fmt.int(summary.boards)} games</span>}
        </div>
        <PlacementBars placements={summary.placements} height={30} labels className="mt-1.5" />
      </div>
    </div>
  );
}
