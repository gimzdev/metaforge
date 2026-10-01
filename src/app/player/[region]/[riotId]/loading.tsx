import { Skeleton } from '@/components/ui';

/** Shown while Riot answers the account, rank and match lookups. */
export default function LoadingPlayer() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading player">
      <div className="flex items-center gap-5">
        <Skeleton className="size-24 rounded-xl" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-64" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
