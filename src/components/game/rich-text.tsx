import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import type { RichText as Rich } from '@/lib/static/types';

const STYLE: Record<string, string> = {
  magic: 'text-[#8cb8ff]',
  physical: 'text-[#ffa878]',
  true: 'text-moon font-semibold',
  bonus: 'text-firefly',
  heal: 'text-fern',
  shield: 'text-[#d6e7ee]',
  rules: 'text-fog italic',
  keyword: 'text-wisp',
  label: 'font-semibold text-moon',
};

const ICON: Record<string, string> = {
  AP: 'text-[#8cb8ff] border-[#8cb8ff]/30',
  AD: 'text-[#ffa878] border-[#ffa878]/30',
  Health: 'text-fern border-fern/30',
  Armor: 'text-firefly border-firefly/30',
  MR: 'text-dusk border-dusk/30',
  AS: 'text-[#ffd27a] border-[#ffd27a]/30',
  Mana: 'text-[#7fd6ff] border-[#7fd6ff]/30',
};

export function RichText({ value, className }: { value: Rich; className?: string }) {
  if (!value?.length) return null;
  return (
    <span className={cn('leading-relaxed', className)}>
      {value.map((seg, i) => {
        if (seg.k === 'n') return <br key={i} />;
        if (seg.k === 'i') {
          return (
            <span
              key={i}
              className={cn(
                'mx-0.5 inline-flex h-[1.35em] items-center rounded border px-1 align-[0.05em] text-[0.75em] font-semibold',
                ICON[seg.v ?? ''] ?? 'border-line-strong text-lichen',
              )}
            >
              {seg.v}
            </span>
          );
        }
        if (seg.k === 'v') {
          // Values the game data doesn't publish are left out (older caches may still carry them).
          if (!seg.v) return null;
          return (
            <span key={i} className={cn('num font-semibold', (seg.s && STYLE[seg.s]) || 'text-moon')}>
              {seg.v}
            </span>
          );
        }
        return (
          <Fragment key={i}>{seg.s ? <span className={STYLE[seg.s]}>{seg.v}</span> : seg.v}</Fragment>
        );
      })}
    </span>
  );
}
