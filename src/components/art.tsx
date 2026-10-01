import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/*
 * Pictures through Next's image optimizer, so each screen gets a copy sized for it as AVIF or WebP:
 * the artwork in public/assets/app (see lib/site.ts) and the champion splash art behind page headers.
 * The URLs are built here instead of with next/image, which would ship its client code with every
 * page. Widths and quality must match `images` in next.config.ts.
 */
const WIDTHS = [640, 828, 1080, 1440, 1920, 2560, 3840];
const optimized = (src: string, w: number, q = 75) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
const svg = (src: string) => /\.svg($|\?)/i.test(src);
/** Remote art the optimizer takes (images.remotePatterns): champion art on CommunityDragon. */
const REMOTE = 'https://raw.communitydragon.org/latest/game/assets/characters/';

/**
 * Champion art (portraits, tiles, abilities): through the optimizer at the size it is shown, since
 * CommunityDragon only has 128 and 256px PNGs. Other game art (items, traits, augments) loads as it is.
 */
export function championArt(url: string, px = 128) {
  if (!url.startsWith(REMOTE)) return { src: url };
  const [one, two] = px <= 32 ? [64, 64] : px <= 64 ? [64, 128] : [128, 256];
  return { src: optimized(url, two, 90), srcSet: one === two ? undefined : `${optimized(url, one, 90)} 1x, ${optimized(url, two, 90)} 2x` };
}

/** src and srcSet for the logo (shown up to 64px wide, at 1x and 2x). */
export function logoArt(src: string) {
  return svg(src) ? { src } : { src: optimized(src, 128), srcSet: `${optimized(src, 64)} 1x, ${optimized(src, 128)} 2x` };
}

/** src, srcSet and sizes for a banner as wide as the page (champion splash art, which is dimmed there). */
export function bannerArt(src: string) {
  if (svg(src) || (/^https?:/.test(src) && !src.startsWith(REMOTE))) return { src };
  const widths = [640, 1080, 1440];
  return { src: optimized(src, 1440), srcSet: widths.map((w) => `${optimized(src, w)} ${w}w`).join(', '), sizes: '(min-width: 1400px) 1400px, 100vw' };
}

/** A picture filling its positioned parent. */
export function Art({
  src,
  sizes = '100vw',
  className,
  style,
  lead = false,
  lazy = false,
}: {
  src: string;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  /** The page's main picture: fetched first. */
  lead?: boolean;
  lazy?: boolean;
}) {
  const plain = svg(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={plain ? src : optimized(src, WIDTHS[WIDTHS.length - 1])}
      srcSet={plain ? undefined : WIDTHS.map((w) => `${optimized(src, w)} ${w}w`).join(', ')}
      sizes={plain ? undefined : sizes}
      alt=""
      aria-hidden
      loading={lazy ? 'lazy' : undefined}
      fetchPriority={lead ? 'high' : undefined}
      decoding="async"
      className={cn('absolute inset-0 h-full w-full', className)}
      style={style}
    />
  );
}
