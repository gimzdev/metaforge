'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-canopy px-3 text-[13px] font-medium text-moon transition-colors hover:border-lichen/45"
    >
      <RefreshCw className={cn('size-4', pending && 'animate-spin')} aria-hidden />
      Refresh
    </button>
  );
}
