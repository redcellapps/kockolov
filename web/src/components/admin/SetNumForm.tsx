import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { t, tn } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { AlertIcon, CheckIcon } from '../icons';
import { Button, Spinner, cx } from '../ui';

export interface SetLookup {
  set_num: string;
  name: string;
  image_url: string | null;
  theme_name: string | null;
  rrp_rsd: number | null;
  offers: number;
}

const SET_NUM = /^\d{3,7}(-\w+)?$/;

export function SetThumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span className={cx('product-img grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg', className)}>
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-1"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      )}
    </span>
  );
}

/**
 * A set number with the set it stands for shown right under it, so a mistyped number (75129 for
 * 75192) shows another set's name, or none, before anything is saved. A number that isn't in the
 * catalogue can only be saved with a second, explicit click.
 */
export function SetNumForm({
  current,
  busy,
  autoFocus,
  submitLabel,
  onSave,
  onCancel,
  extra,
}: {
  current?: string | null;
  busy?: boolean;
  autoFocus?: boolean;
  submitLabel: string;
  onSave: (setNum: string, confirmNew: boolean) => void;
  onCancel?: () => void;
  extra?: ReactNode;
}) {
  const [value, setValue] = useState(current ?? '');
  const [num, setNum] = useState(value.trim());
  useEffect(() => {
    const id = setTimeout(() => setNum(value.trim()), 250);
    return () => clearTimeout(id);
  }, [value]);

  const valid = SET_NUM.test(num);
  const look = useQuery({
    queryKey: ['admin', 'set', num],
    queryFn: () => api<SetLookup>(`/api/admin/sets/${encodeURIComponent(num)}`),
    enabled: valid,
    retry: false,
    staleTime: 60_000,
  });
  const typing = value.trim() !== num;
  const unknown = valid && look.error instanceof ApiError && look.error.status === 404;
  const same = !!current && num === current;
  const canSave = valid && !typing && !same && !!look.data && !busy;

  return (
    <div className="min-w-0">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave(num, false);
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('admin.match.placeholder')}
          aria-label={t('admin.match.placeholder')}
          autoFocus={autoFocus}
          inputMode="numeric"
          className="tabular h-9 w-32 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-ink"
        />
        {unknown && !typing ? (
          <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => onSave(num, true)} className="border-deal text-deal">
            {t('admin.setnum.confirm', { num })}
          </Button>
        ) : (
          <Button size="sm" variant="dark" type="submit" disabled={!canSave}>
            {busy && <Spinner className="h-3.5 w-3.5" />} {submitLabel}
          </Button>
        )}
        {onCancel && (
          <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        {extra}
      </form>
      <div className={cx('text-sm', value.trim() && 'mt-1.5 min-h-10')} aria-live="polite">
        {value.trim() && !SET_NUM.test(value.trim()) && !typing ? (
          <p className="text-xs text-ink-3">{t('admin.setnum.invalid')}</p>
        ) : look.isFetching || (typing && SET_NUM.test(value.trim())) ? (
          <Spinner className="mt-2 h-4 w-4" />
        ) : look.data && valid ? (
          <div className="flex items-center gap-2.5">
            <SetThumb src={look.data.image_url} />
            <div className="min-w-0">
              <div className="flex items-start gap-1.5 font-bold">
                <CheckIcon size={15} className="mt-0.5 shrink-0 text-save" />
                <span className="line-clamp-2">
                  <span className="tabular">{look.data.set_num}</span> {look.data.name}
                </span>
              </div>
              <div className="text-xs text-ink-3">
                {[look.data.theme_name, tn('admin.setnum.offers', look.data.offers)].filter(Boolean).join(' · ')}
                {same && ` · ${t('admin.setnum.same')}`}
              </div>
            </div>
          </div>
        ) : unknown ? (
          <p className="flex items-start gap-1.5 text-xs font-semibold text-deal">
            <AlertIcon size={15} className="mt-px shrink-0" /> {t('admin.setnum.unknown', { num })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
