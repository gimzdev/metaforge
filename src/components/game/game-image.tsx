import type { CSSProperties } from 'react';
import { championArt } from '@/components/art';
import { cdn } from '@/lib/static';
import { cn } from '@/lib/utils';

const initialsOf = (alt: string) =>
  alt
    .replace(/\(.*\)/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

/** Game art; without a picture, or when it fails (a layout script marks the wrapper data-broken), a monogram. Stateless. */
export function GameImage({
  src,
  alt,
  className,
  imgClassName,
  eager,
  style,
  contain = false,
  px,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  style?: CSSProperties;
  contain?: boolean;
  /** Max shown CSS width, so champion art is fetched no bigger than needed. */
  px?: number;
}) {
  const url = cdn(src);
  if (!url) return <span role="img" aria-label={alt} style={style} className={cn('gi gi-empty', className)} data-initials={initialsOf(alt)} />;
  return (
    <span key={url} className={cn('gi block overflow-hidden', className)} style={style} data-initials={initialsOf(alt)}>
      <img
        {...championArt(url, px)}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className={cn('h-full w-full', contain ? 'object-contain' : 'object-cover', imgClassName)}
      />
    </span>
  );
}
