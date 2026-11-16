'use client';
import { track } from '@vercel/analytics';
import type { ReactNode } from 'react';

/** A link to another site, counted as an anonymous event (simulate_click) when it is followed. */
export function TrackedLink({ href, event, data, className, title, children }: { href: string; event: 'simulate_click'; data?: Record<string, string>; className?: string; title?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" title={title} className={className} onClick={() => track(event, data)}>
      {children}
    </a>
  );
}
