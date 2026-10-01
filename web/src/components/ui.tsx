import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { t } from '../i18n';
import { SHOPS } from '../lib/format';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'dark' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:translate-y-px disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
    size === 'sm' && 'h-9 px-3 text-sm',
    size === 'md' && 'h-11 px-4 text-[15px]',
    size === 'lg' && 'h-13 px-6 text-base',
    variant === 'primary' && 'bg-brand text-brand-ink shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)] hover:bg-brand-2',
    variant === 'dark' && 'bg-ink text-bg hover:opacity-90',
    variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    variant === 'outline' && 'border border-line bg-surface text-ink hover:border-ink-3',
    variant === 'danger' && 'bg-deal text-white hover:opacity-90',
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...rest} />;
}

export function Chip({
  active,
  children,
  onClick,
  count,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  count?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition cursor-pointer',
        active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink',
        className,
      )}
    >
      {children}
      {count !== undefined && <span className={cx('tabular text-xs', active ? 'opacity-70' : 'text-ink-3')}>{count}</span>}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[15px] font-medium text-ink">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-ink' : 'bg-line')}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}

export function ShopDot({ shop, className }: { shop: string; className?: string }) {
  return (
    <span
      className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10', className)}
      style={{ background: SHOPS[shop]?.dot ?? '#999' }}
      aria-hidden
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx('inline-block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink', className)}
      role="status"
      aria-label={t('common.loading')}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-line/60', className)} />;
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <BrickArt />
      <h3 className="mt-5 text-lg font-extrabold">{title}</h3>
      {text && <p className="mt-1 max-w-md text-ink-2">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      title={t('common.error')}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )
      }
    />
  );
}

/** Small original illustration: a lone 2x2 brick */
export function BrickArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 64" className={cx('h-16 w-24', className)} aria-hidden>
      <rect x="8" y="22" width="80" height="36" rx="6" fill="var(--brand)" />
      <rect x="8" y="46" width="80" height="12" rx="6" fill="rgba(0,0,0,0.10)" />
      <rect x="20" y="10" width="18" height="14" rx="4" fill="var(--brand)" />
      <rect x="58" y="10" width="18" height="14" rx="4" fill="var(--brand)" />
      <rect x="20" y="10" width="18" height="5" rx="2.5" fill="rgba(255,255,255,0.45)" />
      <rect x="58" y="10" width="18" height="5" rx="2.5" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h2>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
