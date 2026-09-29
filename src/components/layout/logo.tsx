import { brand } from '@/lib/brand';
import { cn } from '@/lib/utils';

/** Built-in MetaForge mark, used only when public/assets/app has no logo: an anvil in a brass hex. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 1.8 28.4 9v14L16 30.2 3.6 23V9z" fill="#e2b86a" />
      <path d="M16 4.6 25.9 10.3v11.4L16 27.4 6.1 21.7V10.3z" fill="#f0ce82" />
      <path
        d="M9.2 12.4h11.6c1.9 0 3.4-.5 4.3-1.2-.2 1.9-1.9 3.4-4.2 3.6-.9.1-1.5.8-1.5 1.7v.3c0 .9.6 1.6 1.4 1.8v1.1H11.8v-1.1c.8-.2 1.4-.9 1.4-1.8v-.4c0-1-.8-1.8-1.8-1.8-1.2 0-2.2-.9-2.2-2.2Z"
        fill="#1c0f06"
      />
      <path d="M10.6 20.6h11.2v1.4H10.6z" fill="#1c0f06" />
    </svg>
  );
}

/** Your logo from public/assets/app (the v1 anvil ships with the script), otherwise the built-in mark. */
export function BrandMark({ className }: { className?: string }) {
  if (brand.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logo} alt="" aria-hidden className={cn('shrink-0 object-contain', className)} />;
  }
  return <Logo className={cn('shrink-0', className)} />;
}

/** Logo plus the serif MetaForge wordmark. */
export function Wordmark({
  className,
  markClassName,
  size = 'md',
}: {
  className?: string;
  markClassName?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandMark className={cn(size === 'lg' ? 'size-14' : 'size-12', markClassName)} />
      <span
        className={cn(
          'font-display font-semibold leading-none tracking-[-0.02em] text-moon',
          size === 'lg' ? 'text-[30px]' : 'text-[24px]',
        )}
      >
        Meta<span className="text-wisp">Forge</span>
      </span>
    </span>
  );
}
