import type { ReactNode } from 'react';

/** Page header for champion, item, trait and comp pages. */
export function DetailHero({
  backdrop,
  icon,
  kicker,
  title,
  children,
  aside,
}: {
  backdrop?: string | null;
  icon?: ReactNode;
  kicker?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border hairline bg-canopy">
      {backdrop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backdrop}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-[center_22%] opacity-40"
        />
      )}
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
