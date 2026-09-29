'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Endless CSS marquee that eases down to a crawl while hovered or focused
 * (instead of stopping dead), so you can still read and click an entry.
 */
export function MarqueeTrack({ children, duration, slow = 0.22 }: { children: ReactNode; duration: number; slow?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const easeTo = (target: number) => {
    const el = ref.current;
    if (!el || typeof el.getAnimations !== 'function') return;
    const animations = el.getAnimations();
    if (!animations.length) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const from = animations[0].playbackRate;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const rate = from + (target - from) * (1 - (1 - t) ** 3);
      for (const a of animations) {
        if (typeof a.updatePlaybackRate === 'function') a.updatePlaybackRate(rate);
        else a.playbackRate = rate;
      }
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  };

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <div
      ref={ref}
      onPointerEnter={() => easeTo(slow)}
      onPointerLeave={() => easeTo(1)}
      onFocusCapture={() => easeTo(slow)}
      onBlurCapture={() => easeTo(1)}
      className="marquee-track flex w-max animate-marquee"
      style={{ animationDuration: `${duration}s` }}
    >
      {children}
    </div>
  );
}
