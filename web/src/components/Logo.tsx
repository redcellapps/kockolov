import { cx } from './ui';

/** Original mark: a 2x2 brick with a magnifying lens (brick hunting). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cx('h-9 w-9', className)} aria-hidden>
      <rect x="2" y="11" width="30" height="23" rx="5" fill="var(--brand)" />
      <rect x="2" y="27" width="30" height="7" rx="3.5" fill="rgba(0,0,0,0.12)" />
      <rect x="7" y="5" width="8" height="7" rx="2.2" fill="var(--brand)" />
      <rect x="19" y="5" width="8" height="7" rx="2.2" fill="var(--brand)" />
      <circle cx="28" cy="27" r="7.2" fill="var(--surface)" stroke="var(--ink)" strokeWidth="3" />
      <path d="M33.2 32.2 38 37" stroke="var(--ink)" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[22px] font-extrabold tracking-tight">
        Kocko<span className="relative">lov</span>
      </span>
    </span>
  );
}
