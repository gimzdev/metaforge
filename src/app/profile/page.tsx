import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LogIn, TriangleAlert } from '@/components/icons';
import { PlayerSearch } from '@/components/player/player-search';
import { buttonClass, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { getActivePlatform } from '@/lib/riot/api';
import { param, type SearchParams } from '@/lib/search-params';
import { brand } from '@/lib/site';
import { riotIdToSlug } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your profile' };

const ERRORS: Record<string, string> = {
  signin_unavailable: 'Riot Sign-On is not configured on this server.',
  signin_cancelled: 'Sign-in was cancelled.',
  signin_state: 'The sign-in request expired or was tampered with. Please try again.',
  signin_token: 'Riot did not accept the sign-in. Please try again.',
  signin_failed: 'Something went wrong while signing in. Please try again.',
};

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const error = param(sp, 'error');

  if (session && !error) {
    let platform = 'na1';
    if (env.riotApiKey) {
      try {
        platform = (await getActivePlatform(session.puuid)) ?? 'na1';
      } catch {
        /* fall back to NA; the player page corrects the region */
      }
    }
    redirect(`/player/${platform}/${riotIdToSlug(session.gameName, session.tagLine)}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      <PageHeader
        title="Your profile"
        art={brand.learn}
        description="Sign in with your Riot account to jump straight to your own games, or look up any player by Riot ID."
      />
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-bloom/30 bg-bloom/10 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-bloom" aria-hidden />
          <span className="text-moon">{ERRORS[error] ?? 'Sign-in failed.'}</span>
        </div>
      )}
      <div className="surface rounded-xl p-6">
        {env.rsoEnabled ? (
          <>
            <h2 className="text-lg font-semibold">Sign in with Riot</h2>
            <p className="mt-1 text-sm text-lichen">MetaForge only receives your Riot ID. No password or game data access.</p>
            <a href="/api/auth/login" className={buttonClass('primary', 'md', 'mt-5')}>
              <LogIn className="size-4" aria-hidden />
              Sign in with Riot
            </a>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Sign-in isn&apos;t set up here</h2>
            <p className="mt-1 text-sm text-lichen">
              This server has no Riot Sign-On client configured. You can still look up any player below.
            </p>
          </>
        )}
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Look up a player</h2>
        <PlayerSearch size="lg" />
      </div>
    </div>
  );
}
