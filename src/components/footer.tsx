import Link from 'next/link';
import { Wordmark } from '@/components/logo';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-md">
          <Wordmark />
          <p className="mt-4 text-xs leading-relaxed text-fog">
            MetaForge isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone
            officially involved in producing or managing Riot Games properties. Riot Games and all associated properties
            are trademarks or registered trademarks of Riot Games, Inc.
          </p>
        </div>
        <nav className="grid content-start gap-2 text-sm" aria-label="Tools">
          <span className="eyebrow mb-1 text-fog">Tools</span>
          <Link className="text-lichen hover:text-moon" href="/meta">Meta report</Link>
          <Link className="text-lichen hover:text-moon" href="/explorer">Explorer</Link>
          <Link className="text-lichen hover:text-moon" href="/builder">Team builder</Link>
        </nav>
        <nav className="grid content-start gap-2 text-sm" aria-label="More">
          <span className="eyebrow mb-1 text-fog">More</span>
          <Link className="text-lichen hover:text-moon" href="/news">Patch notes</Link>
          <Link className="text-lichen hover:text-moon" href="/leaderboard">Ladder</Link>
          <Link className="text-lichen hover:text-moon" href="/guides">Guides</Link>
          <span className="text-fog">
            Game data by{' '}
            <a className="text-lichen hover:text-moon" href="https://www.communitydragon.org" target="_blank" rel="noreferrer">
              CommunityDragon
            </a>
          </span>
        </nav>
      </div>
    </footer>
  );
}
