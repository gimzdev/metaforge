'use client';

import { usePathname } from 'next/navigation';
import { brand } from '@/lib/brand';
import { cn } from '@/lib/utils';

/** Pages that open on a framed picture of their own (banner or champion splash). */
const FRAMED = /^\/(guides|leaderboard|units|items|traits|comps)(\/|$)/;

/**
 * Your bg.jpg (the Piltover skyline from v1) behind every page.
 *
 * Home gets it full strength behind the masthead. Every other page gets a
 * quieter horizon: the skyline sits under the header, darkened on the left
 * where page titles are, and melts into the page (a mask, not a hard edge)
 * well before the data starts, so tables and cards stay on clean ink. Pages
 * that open on a framed picture of their own get the skyline out of focus,
 * as ambient light behind the frame rather than a second picture.
 * A light film grain keeps the flat ink from looking plastic.
 */
export function SiteBackdrop() {
  const path = usePathname();
  const home = path === '/';
  const framed = FRAMED.test(path);
  const art = brand.background;
  return (
    <>
      {art &&
        (home ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] overflow-hidden sm:h-[820px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art} alt="" className="h-full w-full object-cover object-[38%_30%] opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-r from-night/95 via-night/60 to-night/10" />
            <div className="absolute inset-0 bg-gradient-to-b from-night/25 via-night/10 to-night" />
          </div>
        ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_30%,transparent)] sm:h-[680px]"
          >
            {/* Darkened with brightness rather than opacity so the art keeps its contrast instead of turning muddy. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={art}
              alt=""
              className={cn(
                'h-full w-full object-cover object-[55%_0%]',
                framed ? 'scale-105 blur-[5px] brightness-55 contrast-110' : 'brightness-62 contrast-112',
              )}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-night/85 via-night/40 to-night/5" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-night/35" />
          </div>
        ))}
      <div aria-hidden className="grain pointer-events-none fixed inset-0 -z-10 opacity-[0.035]" />
    </>
  );
}
