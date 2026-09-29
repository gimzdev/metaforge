import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Section opener: numbered label, serif title, optional link on the right, hairline underneath. */
export function SectionHead({
  label,
  title,
  action,
  id,
}: {
  label: string;
  title: ReactNode;
  action?: { href: string; label: string };
  id?: string;
}) {
  return (
    <div id={id} className="mb-7 flex scroll-mt-32 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
      <div className="min-w-0">
        <div className="eyebrow text-wisp">{label}</div>
        <h2 className="mt-2.5 text-[1.85rem] leading-[1.1] text-moon sm:text-[2.15rem]">{title}</h2>
      </div>
      {action && <TextLink href={action.href}>{action.label}</TextLink>}
    </div>
  );
}

/** Understated link with an arrow that nudges on hover. */
export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-center gap-1.5 text-sm font-medium text-moon transition-colors hover:text-wisp',
        className,
      )}
    >
      <span className="underline decoration-line-strong underline-offset-[6px] transition-colors group-hover:decoration-wisp">
        {children}
      </span>
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** One column of the tools row: number, title, a line of copy and a live detail. */
export function ToolColumn({
  n,
  href,
  title,
  description,
  detail,
}: {
  n: string;
  href: string;
  title: string;
  description: string;
  detail?: ReactNode;
}) {
  return (
    <Link href={href} className="group flex flex-col gap-3 py-6 md:px-8 md:py-2 md:first:pl-0 md:last:pr-0">
      <span className="num font-display text-sm italic text-fog">{n}</span>
      <span className="flex items-center justify-between gap-3">
        <span className="font-display text-[1.6rem] leading-tight text-moon transition-colors group-hover:text-wisp">
          {title}
        </span>
        <ArrowUpRight
          className="size-5 shrink-0 text-fog transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-wisp"
          aria-hidden
        />
      </span>
      <span className="max-w-sm text-[15px] leading-relaxed text-lichen">{description}</span>
      {detail && <span className="num text-[13px] text-fog">{detail}</span>}
    </Link>
  );
}

/** Large picture tile with the title set over the art (Guides, Ladder). */
export function ImageTile({
  href,
  art,
  label,
  title,
  description,
  position = 'center',
}: {
  href: string;
  art: string;
  label: string;
  title: string;
  description: string;
  position?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative isolate flex min-h-[300px] flex-col justify-end overflow-hidden rounded-xl border border-line p-6 sm:min-h-[340px] sm:p-8"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art}
        alt=""
        aria-hidden
        loading="lazy"
        className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        style={{ objectPosition: position }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night via-night/70 to-night/5" aria-hidden />
      <span className="eyebrow text-wisp">{label}</span>
      <span className="mt-2 flex items-end justify-between gap-4">
        <span>
          <span className="block font-display text-[2rem] leading-tight text-moon">{title}</span>
          <span className="mt-2 block max-w-md text-[15px] leading-relaxed text-moon/75">{description}</span>
        </span>
        <ArrowUpRight
          className="mb-1 size-6 shrink-0 text-moon/70 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-wisp"
          aria-hidden
        />
      </span>
    </Link>
  );
}
