'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { APEX_SCORE, fromScore, isApex, ladderScore, rankLabel, tierColor } from '@/lib/rank';
import type { LpPoint } from '@/lib/store/types';
import { cn } from '@/lib/utils';

const H_MIN = 200;
const PAD = { top: 14, right: 16, bottom: 26, left: 92 };
const DIVS = ['IV', 'III', 'II', 'I'];
const LADDER = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond'];

/** A ladder score as the axis reads it: a division below Master, LP above it. */
function scoreLabel(s: number) {
  if (s >= APEX_SCORE) return s === APEX_SCORE ? 'Master' : `${s - APEX_SCORE} LP`;
  return `${LADDER[Math.floor(s / 400)]} ${DIVS[Math.floor((s % 400) / 100)]}`;
}

const rankText = (p: LpPoint) => `${rankLabel(p.tier, p.division)} · ${p.lp} LP`;

/** Typical LP for each place (1st to 8th): real gains and losses swing with hidden rating, so estimates are rough. */
const DELTA = [45, 35, 25, 15, -15, -25, -35, -45];
const ESTIMATE = 20;

type Pt = LpPoint & { s: number; est?: boolean; place?: number };

/**
 * Tracked ranks, preceded by an estimate over the last ESTIMATE ranked games before tracking: walking back from the first
 * tracked rank through each game's placement (games: [minutes since 1970, place]).
 */
function buildSeries(points: LpPoint[], games: Array<[number, number]>): Pt[] {
  const real = points.flatMap((p) => {
    const s = ladderScore(p.tier, p.division, p.lp);
    return s === null ? [] : [{ ...p, s }];
  });
  const anchor = real[0];
  if (!anchor) return real;
  const before = [...new Map(games.map(([m, place]) => [m * 60_000, place])).entries()]
    .filter(([at]) => at < anchor.at - 60_000)
    .sort((a, b) => b[0] - a[0])
    .slice(0, ESTIMATE);
  if (!before.length) return real;
  const apex = isApex(anchor.tier) ? anchor.tier : 'MASTER';
  const est: Pt[] = [];
  let s = anchor.s;
  for (const [at, place] of before) {
    est.push({ at, s, est: true, place, ...fromScore(s, apex) });
    s = Math.max(0, s - DELTA[place - 1]);
  }
  est.push({ at: before.at(-1)![0] - 600_000, s, est: true, ...fromScore(s, apex) });
  return [...est.reverse(), ...real];
}
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** The player's LP over the current set, from the ranks MetaForge has seen (profile views and collection runs). */
export function LpCurve({ points, games, setNumber }: { points: LpPoint[]; games: Array<[number, number]>; setNumber: number }) {
  const series = useMemo(() => buildSeries(points, games), [points, games]);
  const estimated = series.filter((p) => p.est).length;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.max(H_MIN, Math.round(e.contentRect.height)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dates in the reader's own format once mounted; the server render (and the first client one) use ISO dates.
  const date = (t: number) => (size ? day(t) : new Date(t).toISOString().slice(0, 10));
  const first = series[0];
  const last = series.at(-1);
  const peak = series.reduce<(typeof series)[number] | undefined>((m, p) => (!m || p.s > m.s ? p : m), undefined);
  const change = first && last ? last.s - first.s : 0;

  // Scales: time from the first point to now; score padded and snapped to whole divisions.
  const chart = useMemo(() => {
    if (!size || !series.length) return null;
    const now = Date.now();
    const t0 = series[0].at;
    const t1 = Math.max(now, t0 + 3_600_000);
    const lo = Math.min(...series.map((p) => p.s));
    const hi = Math.max(...series.map((p) => p.s));
    const step = hi - lo > 1600 ? 400 : hi - lo > 700 ? 200 : 100;
    const y0 = Math.max(0, Math.floor((lo - 40) / step) * step);
    const y1 = Math.ceil((hi + 40) / step) * step;
    const w = size.w - PAD.left - PAD.right;
    const h = size.h - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * w;
    const y = (s: number) => PAD.top + (1 - (s - y0) / (y1 - y0)) * h;
    const grid = Array.from({ length: Math.round((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step);
    // Day labels: as many as fit, but never the same day twice.
    const n = Math.max(2, Math.min(6, Math.floor(w / 110), Math.floor((t1 - t0) / 86_400_000) + 1));
    const ticks = Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / (n - 1));
    const xy = series.map((p) => [x(p.at), y(p.s)] as const);
    const path = (pts: ReadonlyArray<readonly [number, number]>) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
    const line = path(xy);
    // The estimate runs up to the first tracked point; the tracked line starts there.
    const estLine = estimated ? path(xy.slice(0, estimated + 1)) : '';
    const realLine = path(xy.slice(estimated));
    const end = xy.at(-1)!;
    return { x, y, grid, ticks, xy, line, estLine, realLine, end, right: PAD.left + w, bottom: PAD.top + h, w, h };
  }, [size, series, estimated]);

  const pick = (clientX: number) => {
    if (!chart || !box.current) return;
    const left = box.current.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < chart.xy.length; i++) if (Math.abs(chart.xy[i][0] - (clientX - left)) < Math.abs(chart.xy[best][0] - (clientX - left))) best = i;
    setHover(best);
  };
  const tip = hover !== null && chart ? { p: series[hover], prev: series[hover - 1], at: chart.xy[hover] } : null;

  const label = 'font-sans text-xs font-medium uppercase tracking-wider text-fog';
  const stat = (name: string, value: string, sub: string, color?: string, tone = 'text-moon') => (
    <div key={name} className="min-w-0">
      <dt className="text-xs text-lichen">{name}</dt>
      <dd className={cn('num mt-1 truncate text-sm font-semibold', tone)} style={color ? { color } : undefined}>
        {value}
      </dd>
      <dd className="num text-xs text-fog">{sub}</dd>
    </div>
  );
  const summary = last
    ? `LP in Set ${setNumber}: ${series.length > 1 ? `from ${rankText(first!)} on ${date(first!.at)} to ` : ''}${rankText(last)}${peak && series.length > 1 ? `, peak ${rankText(peak)}` : ''}.`
    : `No LP history for Set ${setNumber} yet.`;

  return (
    <section aria-label={`LP in Set ${setNumber}`} className="surface flex min-h-[19rem] flex-col rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <h2 className={label}>LP · Set {setNumber}</h2>
        {last && (
          <dl className="grid grid-cols-3 gap-x-6 sm:flex sm:gap-x-10">
            {stat('Now', rankLabel(last.tier, last.division), `${last.lp} LP`, tierColor(last.tier))}
            {series.length > 1 && peak && stat('Peak', rankLabel(peak.tier, peak.division), `${peak.lp} LP`)}
            {series.length > 1 &&
              stat(
                'Change',
                `${change > 0 ? '+' : change < 0 ? '−' : '±'}${Math.abs(change)} LP`,
                `since ${date(first!.at)}`,
                undefined,
                change > 0 ? 'text-good' : change < 0 ? 'text-bloom' : 'text-moon',
              )}
          </dl>
        )}
      </div>

      <div
        ref={box}
        role="img"
        aria-label={summary}
        className="relative mt-4 min-h-[200px] flex-1"
        onPointerMove={(e) => e.pointerType !== 'touch' && pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {chart && (
          <svg width={size!.w} height={size!.h} className="absolute inset-0 overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="lp-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--color-wisp)" stopOpacity="0.18" />
                <stop offset="1" stopColor="var(--color-wisp)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {chart.grid.map((s) => {
              const tierStart = s % 400 === 0 || s === APEX_SCORE;
              const tier = s >= APEX_SCORE ? 'MASTER' : LADDER[Math.floor(s / 400)]?.toUpperCase();
              return (
                <g key={s}>
                  <line x1={PAD.left} x2={PAD.left + chart.w} y1={chart.y(s)} y2={chart.y(s)} stroke={tierStart ? 'var(--color-line-strong)' : 'var(--color-line)'} />
                  <circle cx={10} cy={chart.y(s)} r={3} fill={tierColor(tier)} opacity={tierStart ? 1 : 0.45} />
                  <text x={18} y={chart.y(s)} dy="0.32em" className="num fill-fog text-[11px]">
                    {scoreLabel(s)}
                  </text>
                </g>
              );
            })}
            {chart.ticks.map((t, i) => (
              <text key={t} x={chart.x(t)} y={chart.bottom + 18} textAnchor={i === 0 ? 'start' : i === chart.ticks.length - 1 ? 'end' : 'middle'} className="fill-fog text-[11px]">
                {i === chart.ticks.length - 1 ? 'Now' : day(t)}
              </text>
            ))}
            {series.length > 1 && <path d={`${chart.line}L${chart.end[0]},${chart.bottom}L${chart.xy[0][0]},${chart.bottom}Z`} fill="url(#lp-fill)" />}
            {chart.estLine && <path d={chart.estLine} fill="none" stroke="var(--color-wisp)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {series.length - estimated > 1 && <path d={chart.realLine} fill="none" stroke="var(--color-wisp)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {/* The last rank seen holds until now. */}
            <line x1={chart.end[0]} x2={chart.right} y1={chart.end[1]} y2={chart.end[1]} stroke="var(--color-wisp)" strokeWidth={2} strokeDasharray="3 4" opacity={0.6} />
            {(series.length - estimated <= 40 ? chart.xy.slice(estimated) : [chart.end]).map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={series.length - estimated <= 40 ? 3.5 : 4.5} fill="var(--color-wisp)" stroke="var(--color-canopy)" strokeWidth={2} />
            ))}
            {tip && (
              <g>
                <line x1={tip.at[0]} x2={tip.at[0]} y1={PAD.top} y2={chart.bottom} stroke="var(--color-line-strong)" />
                <circle cx={tip.at[0]} cy={tip.at[1]} r={5} fill="var(--color-wisp)" stroke="var(--color-canopy)" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {tip && chart && (
          <div
            className="pointer-events-none absolute z-10 w-max -translate-y-full rounded-lg border border-line-strong bg-night/95 px-3 py-2 text-xs shadow-xl"
            style={{ left: Math.min(Math.max(tip.at[0] - 80, 0), size!.w - 170), top: Math.max(tip.at[1] - 12, 64) }}
          >
            <div className="text-fog">{new Date(tip.p.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })}</div>
            <div className="num mt-0.5 font-semibold" style={{ color: tierColor(tip.p.tier) }}>
              {rankText(tip.p)}
            </div>
            {tip.prev && (
              <div className={cn('num mt-0.5', tip.p.s >= tip.prev.s ? 'text-good' : 'text-bloom')}>
                {tip.p.s >= tip.prev.s ? '+' : '−'}
                {Math.abs(tip.p.s - tip.prev.s)} LP
              </div>
            )}
          </div>
        )}
        {!series.length && size && (
          <p className="absolute inset-x-0 bottom-10 mx-auto max-w-md px-4 text-center text-sm text-lichen">No ranked games this set yet.</p>
        )}
      </div>
      <table className="sr-only">
        <caption>LP history</caption>
        <tbody>
          {series.slice(-50).map((p) => (
            <tr key={p.at}>
              <td>{new Date(p.at).toISOString().slice(0, 13)}:00</td>
              <td>{rankText(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
