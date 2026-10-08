'use client';

import { Hexagon } from '@/components/icons';
import { cn } from '@/lib/utils';

/** The hex toggle used on comp lines and panel headers. */
export function BoardButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Usually inside a card that links to the comp page.
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={open}
      aria-label={open ? 'Hide board' : 'Show board'}
      title={open ? 'Hide the recommended board' : 'Show the recommended board'}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
        open ? 'border-wisp/50 bg-wisp/10 text-wisp' : 'border-line text-fog hover:border-lichen/50 hover:text-moon',
      )}
    >
      <Hexagon className="size-4" aria-hidden />
      <span className="hidden sm:inline">Board</span>
    </button>
  );
}
