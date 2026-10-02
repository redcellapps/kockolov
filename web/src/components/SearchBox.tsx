import { useEffect, useId, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { t } from '../i18n';
import { useMedia } from '../lib/media';
import { SearchIcon, XIcon } from './icons';
import { cx } from './ui';

/**
 * Set search. `md` is the compact header field; `lg` is the home hero field with its own
 * "Pretraži" button, drawn in the hero's fixed black/white/yellow colors.
 */
export function SearchBox({ size = 'md', autoFocus, className }: { size?: 'md' | 'lg'; autoFocus?: boolean; className?: string }) {
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const navigate = useNavigate();
  const location = useLocation();
  const id = useId();
  // the long example placeholder only fits the full-width desktop field
  const wide = useMedia('(min-width: 1024px)');

  useEffect(() => {
    setValue(params.get('q') ?? '');
  }, [params]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(location.pathname === '/pretraga' ? params : undefined);
    if (value.trim()) next.set('q', value.trim());
    else next.delete('q');
    next.delete('page');
    if (!value.trim()) next.delete('sort');
    navigate(`/pretraga?${next.toString()}`);
  }

  const lg = size === 'lg';
  return (
    <form onSubmit={submit} role="search" className={cx('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {t('search.label')}
      </label>
      <SearchIcon
        size={lg ? 22 : 18}
        aria-hidden
        className={cx(
          'pointer-events-none absolute top-1/2 -translate-y-1/2',
          lg ? 'left-4 text-hero-muted sm:left-5' : 'left-3.5 text-ink-3',
        )}
      />
      <input
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={lg && wide ? t('search.placeholderLong') : t('search.placeholder')}
        className={cx(
          'w-full outline-none transition [&::-webkit-search-cancel-button]:hidden',
          lg
            ? 'h-14 rounded-2xl border-2 border-hero-ink bg-hero-paper pl-12 pr-[7.5rem] text-base text-hero-ink shadow-[0_3px_0_0_var(--hero-ink)] placeholder:text-hero-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hero-ink/25 sm:h-16 sm:pl-14 sm:pr-36 sm:text-lg'
            : 'h-11 rounded-2xl border border-line bg-surface pl-10 pr-10 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:shadow-card',
        )}
      />
      {value && !lg && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label={t('common.close')}
        >
          <XIcon size={16} />
        </button>
      )}
      {lg && (
        <button
          type="submit"
          className="absolute bottom-2 right-2 top-2 cursor-pointer rounded-xl bg-hero-ink px-4 text-[15px] font-extrabold text-brand transition hover:bg-hero-ink/85 sm:px-7 sm:text-base"
        >
          {t('search.button')}
        </button>
      )}
    </form>
  );
}
