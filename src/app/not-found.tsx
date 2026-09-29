import Link from 'next/link';
import { PlayerSearch } from '@/components/player/player-search';
import { buttonClass } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-16 text-center">
      <div className="font-display text-8xl font-light italic text-wisp">404</div>
      <div>
        <h1 className="text-3xl">This path leads deeper into the woods</h1>
        <p className="mt-2 text-[15px] text-lichen">The page you asked for doesn&apos;t exist, or it rotated out with an older set.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonClass('primary', 'md')}>
          Home
        </Link>
        <Link href="/meta" className={buttonClass('secondary', 'md')}>
          Meta report
        </Link>
      </div>
      <PlayerSearch className="text-left" />
    </div>
  );
}
