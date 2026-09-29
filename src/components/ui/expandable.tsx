'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Collapsed-by-default section built on <details>. Opens by itself when the
 * page is loaded with a #hash that points inside it (e.g. /guides#set-mechanics).
 */
export function Expandable({
  id,
  title,
  hint,
  children,
}: {
  id?: string;
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openForHash = () => {
      const el = ref.current;
      const hash = window.location.hash.slice(1);
      if (!el || !hash) return;
      const target = document.getElementById(decodeURIComponent(hash));
      if (target && (target === el || el.contains(target))) {
        el.open = true;
        requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
      }
    };
    openForHash();
    window.addEventListener('hashchange', openForHash);
    return () => window.removeEventListener('hashchange', openForHash);
  }, []);
  return (
    <details ref={ref} id={id} className="group scroll-mt-28 rounded-xl border border-line bg-night/90">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-display text-[1.35rem] leading-tight text-moon">{title}</span>
          {hint && <span className="mt-1 block text-sm text-lichen">{hint}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-fog transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-10 border-t border-line px-5 py-6 sm:px-6">{children}</div>
    </details>
  );
}
