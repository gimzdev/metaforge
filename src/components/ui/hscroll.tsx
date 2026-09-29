'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A row that scrolls sideways when it does not fit (phones): the current item
 * (aria-current) starts centred, and the edge with more to see fades out.
 */
export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const current = box.querySelector<HTMLElement>('[aria-current]');
    if (current && box.scrollWidth > box.clientWidth) {
      const a = current.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      box.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
    }
    const update = () =>
      setEdge({ left: box.scrollLeft > 4, right: box.scrollLeft + box.clientWidth < box.scrollWidth - 4 });
    update();
    box.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => {
      box.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);
  const mask =
    edge.left && edge.right
      ? '[mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)]'
      : edge.right
        ? '[mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]'
        : edge.left
          ? '[mask-image:linear-gradient(to_right,transparent,black_48px)]'
          : '';
  return (
    <div ref={ref} className={cn('overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', mask, className)}>
      {children}
    </div>
  );
}
