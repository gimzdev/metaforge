'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Heart, X } from '@/components/icons';
import { PATREON } from '@/lib/site';
import { cn } from '@/lib/utils';

/** "Not now" hides every note on this device for four months; the header and footer links stay. */
const KEY = 'metaforge:support-hidden';
const QUIET = 120 * 864e5;

/** A quiet note asking for support on Patreon, where MetaForge has just been useful (the meta report, the home page). */
export function SupportNote({ children, className }: { children: ReactNode; className?: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      const at = Number(window.localStorage.getItem(KEY));
      if (at && Date.now() - at < QUIET) setHidden(true);
    } catch {
      // Storage blocked: the note stays.
    }
  }, []);
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Storage blocked: hidden until the next visit.
    }
  };
  return (
    <aside
      aria-label="Support MetaForge"
      className={cn('flex items-start gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3.5 text-sm leading-relaxed text-lichen sm:px-5', className)}
    >
      <Heart className="mt-0.5 size-4 shrink-0 text-wisp" fill="currentColor" />
      <p className="min-w-0 flex-1 text-pretty">
        {children}{' '}
        <a
          href={PATREON}
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap font-medium text-moon underline decoration-wisp/50 underline-offset-4 hover:decoration-wisp"
        >
          Support on Patreon
        </a>
      </p>
      <button
        type="button"
        onClick={hide}
        title="Not now"
        aria-label="Hide this note"
        className="-mr-1.5 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fog hover:bg-white/[0.05] hover:text-moon"
      >
        <X className="size-3.5" />
      </button>
    </aside>
  );
}
