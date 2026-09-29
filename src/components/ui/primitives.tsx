import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
  flush = false,
  as: Tag = 'section',
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** No body padding (tables and lists that run edge to edge). */
  flush?: boolean;
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  return (
    <Tag className={cn('surface rounded-xl', className)}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-b hairline px-4 py-3 sm:px-5">
          {title && <h2 className="font-sans text-[15px] font-semibold tracking-tight text-moon">{title}</h2>}
          {aside && <div className="flex items-center gap-2 text-sm text-lichen">{aside}</div>}
        </header>
      )}
      <div className={cn(flush ? 'overflow-hidden rounded-b-xl' : 'p-4 sm:p-5', bodyClassName)}>{children}</div>
    </Tag>
  );
}

export function Select({
  className,
  children,
  label,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      {label && <span className="sr-only">{label}</span>}
      <select
        aria-label={label}
        className="h-9 appearance-none rounded-lg border border-line-strong bg-canopy pl-3 pr-8 text-[13px] font-medium text-moon outline-none transition hover:border-lichen/35 focus-visible:border-wisp"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-lichen" aria-hidden />
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-canopy p-0.5 scroll-thin', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]',
              active ? 'bg-bark text-moon' : 'text-lichen hover:text-moon',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="num text-[11px] text-fog">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
  title,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-wisp/60 bg-wisp/10 text-wisp'
          : 'border-line-strong text-lichen hover:border-lichen/40 hover:text-moon',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  hint,
  className,
  valueClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-xs text-lichen">{label}</div>
      <div className={cn('num mt-1 font-display text-[1.6rem] leading-none text-moon', valueClassName)}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-fog">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse-soft rounded-lg bg-bark/70', className)} />;
}

/**
 * Page title row: a small label, a serif title and an optional description,
 * with controls on the right. With `art` (e.g. your v1 learn_banner.jpg) the
 * header sits on that picture.
 */
export function PageHeader({
  title,
  description,
  children,
  eyebrow,
  art,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  eyebrow?: ReactNode;
  art?: string;
}) {
  const body = (
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-3 text-wisp">{eyebrow}</div>}
        <h1 className="text-[2.1rem] leading-[1.08] text-moon sm:text-[2.6rem]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-lichen">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
  if (!art) return <div className="mb-8">{body}</div>;
  return (
    <div className="relative mb-8 overflow-hidden rounded-xl border border-line px-5 pb-7 pt-16 sm:px-8 sm:pb-9 sm:pt-24">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-night via-night/80 to-night/20" aria-hidden />
      {body}
    </div>
  );
}
