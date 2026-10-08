import Link from 'next/link';
import type { ComponentProps, ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from '@/components/icons';
import { Art } from '@/components/art';
import { HeroArt } from '@/components/ui-client';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-wisp text-[#1b1306] font-semibold hover:bg-[#ecc57c] active:translate-y-px',
  secondary: 'text-moon font-medium border border-line-strong bg-canopy hover:border-lichen/45',
  ghost: 'text-lichen font-medium hover:text-moon hover:bg-white/[0.04]',
  quiet: 'text-lichen font-medium hover:text-wisp',
};

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-5 text-[15px] gap-2.5 rounded-lg',
};

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none select-none',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName = 'p-4 sm:p-5',
  flush = false,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn('surface rounded-xl', className)}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-b hairline px-4 py-3 sm:px-5">
          {title && <h2 className="font-sans text-[15px] font-semibold tracking-tight text-moon">{title}</h2>}
          {aside && <div className="flex items-center gap-2 text-sm text-lichen">{aside}</div>}
        </header>
      )}
      <div className={flush ? 'overflow-hidden rounded-b-xl' : bodyClassName}>{children}</div>
    </section>
  );
}

/** Page title row: serif title, optional description, controls on the right; with `art` it sits on that picture. */
export function PageHeader({
  title,
  description,
  children,
  art,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  art?: string;
}) {
  const body = (
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[2.1rem] leading-[1.08] text-moon sm:text-[2.6rem]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-lichen">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
  if (!art) return <div className="mb-8">{body}</div>;
  return (
    <div className="relative mb-8 overflow-hidden rounded-xl border border-line px-5 pb-7 pt-16 sm:px-8 sm:pb-9 sm:pt-24">
      <Art src={art} sizes="(min-width: 1400px) 1400px, 100vw" lead className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-night via-night/80 to-night/20" aria-hidden />
      {body}
    </div>
  );
}

export function DetailHero({
  backdrop,
  icon,
  kicker,
  title,
  children,
  aside,
}: {
  /** Banner picture: one URL, or several to try in order. */
  backdrop?: string | null | Array<string | null>;
  icon?: ReactNode;
  kicker?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border hairline bg-canopy">
      <HeroArt sources={[backdrop].flat().filter((u): u is string => Boolean(u))} className="absolute inset-0 h-full w-full object-cover object-[center_22%] opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-r from-canopy via-canopy/90 to-canopy/30" aria-hidden />
      <div className="relative flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="min-w-0">
            {kicker && <div className="flex flex-wrap items-center gap-2 text-sm text-lichen">{kicker}</div>}
            <h1 className="mt-1.5 text-[2.2rem] leading-[1.05] tracking-[-0.02em] sm:text-[3.2rem]">{title}</h1>
            {children && <div className="mt-3">{children}</div>}
          </div>
        </div>
        {aside && <div className="flex flex-col gap-3 lg:items-end">{aside}</div>}
      </div>
    </section>
  );
}

export function Select({ className, children, label, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
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
    <div role="tablist" className={cn('inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-canopy p-0.5 scroll-thin', className)}>
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

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        active ? 'border-wisp/60 bg-wisp/10 text-wisp' : 'border-line-strong text-lichen hover:border-lichen/40 hover:text-moon',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse-soft bg-bark/70', !/\brounded/.test(className) && 'rounded-lg', className)} />;
}
