'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** Image from CommunityDragon with a graceful monogram fallback. */
export function GameImage({
  src,
  alt,
  className,
  imgClassName,
  eager,
  style,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  style?: CSSProperties;
}) {
  // Remember which src failed, so a new src gets a fresh attempt automatically.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src) && failedSrc === src;
  const ref = useRef<HTMLImageElement>(null);
  // An image can fail before React hydrates and attaches onError; catch that case too.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailedSrc(src ?? null);
  }, [src]);
  const initials = alt
    .replace(/\(.*\)/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        style={style}
        className={cn(
          'grid place-items-center bg-bark font-sans text-[0.62em] font-semibold text-lichen select-none',
          className,
        )}
      >
        {initials || '?'}
      </span>
    );
  }
  return (
    <span className={cn('block overflow-hidden', className)} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onError={() => setFailedSrc(src ?? null)}
        className={cn('h-full w-full object-cover', imgClassName)}
      />
    </span>
  );
}
