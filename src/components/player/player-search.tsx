'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { PLATFORMS } from '@/lib/riot/regions';
import { usePrefs } from '@/lib/prefs';
import { cn, parseRiotId, riotIdToSlug } from '@/lib/utils';

export function PlayerSearch({ size = 'md', className, autoFocus }: { size?: 'md' | 'lg' | 'xl'; className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const { platform, setPlatform, recent } = usePrefs();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = (gameName: string, tagLine: string, region: string) => {
    router.push(`/player/${region}/${riotIdToSlug(gameName, tagLine)}`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = parseRiotId(value);
    if (!id) {
      setError('Use the full Riot ID: Name#TAG');
      return;
    }
    setError(null);
    go(id.gameName, id.tagLine, platform);
  };

  const lg = size === 'lg' || size === 'xl';
  const xl = size === 'xl';
  return (
    <div className={className}>
      <form
        onSubmit={submit}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-line-strong bg-canopy p-1 transition focus-within:border-lichen/45',
          lg && 'p-1.5',
          xl && 'flex-wrap rounded-xl p-1.5 sm:flex-nowrap',
        )}
      >
        <select
          aria-label="Region"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={cn(
            'shrink-0 appearance-none rounded-md bg-bark px-3 font-semibold text-moon outline-none',
            xl ? 'h-12 px-4 text-[15px] sm:h-[52px]' : lg ? 'h-10 text-sm' : 'h-8 text-[13px]',
          )}
        >
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          size={1}
          placeholder="Name#TAG"
          aria-label="Riot ID"
          aria-invalid={Boolean(error)}
          className={cn(
            'min-w-0 flex-1 bg-transparent px-1 text-moon outline-none placeholder:text-fog',
            xl ? 'h-12 px-2 text-base sm:h-[52px] sm:text-[17px]' : lg ? 'h-10 text-[15px]' : 'h-8 text-sm',
          )}
        />
        <button
          type="submit"
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-md bg-wisp font-semibold text-[#1b1306] transition-colors hover:bg-[#ecc57c]',
            xl ? 'h-12 w-full justify-center px-6 text-[15px] sm:h-[52px] sm:w-auto' : lg ? 'h-10 px-5 text-sm' : 'h-8 px-3.5 text-[13px]',
          )}
        >
          <Search className={xl ? 'size-5' : 'size-4'} aria-hidden />
          <span className={lg ? '' : 'sr-only sm:not-sr-only'}>Look up</span>
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-bloom">{error}</p>}
      {!error && recent.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-lichen">
          <span className="text-fog">Recent</span>
          {recent.map((r) => (
            <button
              key={`${r.gameName}#${r.tagLine}`}
              type="button"
              onClick={() => go(r.gameName, r.tagLine, r.platform)}
              className="rounded-full border border-line-strong px-2.5 py-1 hover:border-lichen/40 hover:text-moon"
            >
              {r.gameName}
              <span className="text-fog">#{r.tagLine}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
