import { cn, deltaTone, fmt, placementTone, toneText } from '@/lib/utils';
import type { Tier } from '@/lib/stats/types';

export function AvgPlace({ value, className }: { value: number; className?: string }) {
  return <span className={cn('num font-semibold', toneText[placementTone(value)], className)}>{fmt.place(value)}</span>;
}

export function Delta({ value, className }: { value: number; className?: string }) {
  return <span className={cn('num text-[13px]', deltaTone(value), className)}>{fmt.delta(value)}</span>;
}

export function Pct({ value, className, digits = 1 }: { value: number; className?: string; digits?: number }) {
  return <span className={cn('num', className)}>{fmt.pct(value, digits)}</span>;
}

const PLACE_COLOR = [
  'var(--color-firefly)',
  'var(--color-good)',
  'var(--color-good)',
  'var(--color-good)',
  'var(--color-fog)',
  'var(--color-fog)',
  'var(--color-fog)',
  'var(--color-bloom)',
];

/** Eight bars: share of 1st…8th finishes. */
export function PlacementBars({
  placements,
  className,
  height = 36,
  labels = false,
}: {
  placements: number[];
  className?: string;
  height?: number;
  labels?: boolean;
}) {
  const total = placements.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...placements, 1);
  return (
    <div className={cn('flex items-end gap-[3px]', className)} aria-label="Placement distribution">
      {placements.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-end" style={{ height }}>
            <div
              title={`${fmt.ordinal(i + 1)}: ${fmt.pct(v / total)}`}
              className="w-full rounded-t-[3px] opacity-90"
              style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: PLACE_COLOR[i] }}
            />
          </div>
          {labels && <span className="num text-[10px] text-fog">{i + 1}</span>}
        </div>
      ))}
    </div>
  );
}

export function FreqBar({ value, max = 1, className }: { value: number; max?: number; className?: string }) {
  const width = Math.max(2, Math.min(100, (value / (max || 1)) * 100));
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="num w-12 text-right">{fmt.pct(value, value < 0.1 ? 1 : 0)}</span>
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-bark sm:block">
        <span className="block h-full rounded-full bg-lichen/60" style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

const GRADE_STYLE: Record<Tier, string> = {
  S: 'bg-tier-s text-night',
  A: 'bg-tier-a text-night',
  B: 'bg-tier-b text-night',
  C: 'bg-tier-c text-night',
  D: 'bg-tier-d text-night',
};

export function GradeBadge({ grade, className }: { grade: Tier | null; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-md font-display text-[17px] font-semibold',
        grade ? GRADE_STYLE[grade] : 'bg-bark text-fog',
        className,
      )}
      title={grade ? `${grade} tier` : 'Not enough games yet'}
    >
      {grade ?? '–'}
    </span>
  );
}
