import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { t } from '../i18n';
import { SearchIcon, XIcon } from './icons';
import { cx } from './ui';

export function SearchBox({ size = 'md', autoFocus, className }: { size?: 'md' | 'lg'; autoFocus?: boolean; className?: string }) {
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setValue(params.get('q') ?? ''), [params]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(location.pathname === '/pretraga' ? params : undefined);
    if (value.trim()) next.set('q', value.trim());
    else next.delete('q');
    next.delete('page');
    if (!value.trim()) next.delete('sort');
    navigate(`/pretraga?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} role="search" className={cx('relative', className)}>
      <SearchIcon
        size={size === 'lg' ? 22 : 18}
        className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-3', size === 'lg' ? 'left-4 sm:left-5' : 'left-3.5')}
      />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={size === 'lg' && typeof window !== 'undefined' && window.innerWidth >= 640 ? t('search.placeholderLong') : t('search.placeholder')}
        aria-label={t('search.button')}
        className={cx(
          'w-full rounded-2xl border border-line bg-surface text-ink placeholder:text-ink-3 outline-none transition focus:border-ink focus:shadow-card [&::-webkit-search-cancel-button]:hidden',
          size === 'lg' ? 'h-14 pl-12 pr-24 text-base shadow-card sm:h-16 sm:pl-14 sm:pr-36 sm:text-lg' : 'h-11 pl-10 pr-10 text-[15px]',
        )}
      />
      {value && size !== 'lg' && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink cursor-pointer"
          aria-label={t('common.close')}
        >
          <XIcon size={16} />
        </button>
      )}
      {size === 'lg' && (
        <button
          type="submit"
          className="absolute right-2 top-2 bottom-2 rounded-xl bg-brand px-4 font-bold sm:px-6 text-brand-ink shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)] transition hover:bg-brand-2 cursor-pointer"
        >
          {t('search.button')}
        </button>
      )}
    </form>
  );
}
