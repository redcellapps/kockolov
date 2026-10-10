import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../i18n';
import { api, ApiError } from '../lib/api';
import { isApp } from '../lib/platform';
import { XIcon } from './icons';
import { Button, cx } from './ui';

export function ScanIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M8 9v6M11 9v6M14 9v6M17 9v6" />
    </svg>
  );
}

type Note = { text: string; code?: string };

/**
 * App only: scans the barcode on a LEGO box and opens that set. When the code isn't known yet,
 * the set number printed on the box can be typed instead.
 */
export function ScanButton({ variant = 'icon', className }: { variant?: 'icon' | 'wide'; className?: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [num, setNum] = useState('');
  if (!isApp) return null;

  const scan = async () => {
    setNote(null);
    setBusy(true);
    try {
      const r = await (await import('../native/scan')).scanBox();
      if (!r) return;
      if ('error' in r) {
        setNote({ text: t(r.error === 'denied' ? 'scan.denied' : r.error === 'preparing' ? 'scan.preparing' : 'scan.unsupported') });
        return;
      }
      try {
        const found = await api<{ set_num: string }>(`/api/sets/by-code/${encodeURIComponent(r.code)}`);
        navigate(`/set/${encodeURIComponent(found.set_num)}`);
      } catch (err) {
        setNote({ text: err instanceof ApiError && err.status === 404 ? t('scan.notFound') : t('scan.failed'), code: r.code });
      }
    } finally {
      setBusy(false);
    }
  };

  const typed = (e: FormEvent) => {
    e.preventDefault();
    const q = num.trim();
    if (!q) return;
    setNote(null);
    setNum('');
    navigate(/^\d{3,7}(-\d{1,2})?$/.test(q) ? `/set/${q}` : `/pretraga?q=${encodeURIComponent(q)}`);
  };

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => void scan()}
          disabled={busy}
          aria-label={t('scan.aria')}
          className={cx('grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-ink hover:bg-surface-2 disabled:opacity-50', className)}
        >
          <ScanIcon />
        </button>
      ) : (
        <Button type="button" variant="dark" onClick={() => void scan()} disabled={busy} className={className}>
          <ScanIcon size={18} /> {t('scan.button')}
        </Button>
      )}
      {note && (
        <div role="dialog" aria-live="polite" className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface px-4 pt-4 shadow-lift">
          <div className="mx-auto max-w-xl pb-4">
            <div className="flex items-start gap-3">
              <p className="flex-1 font-bold">
                {note.text}
                {note.code && <span className="ml-1 font-normal text-ink-3">({note.code})</span>}
              </p>
              <button type="button" onClick={() => setNote(null)} aria-label={t('scan.close')} className="cursor-pointer rounded-full p-1 text-ink-3 hover:text-ink">
                <XIcon size={18} />
              </button>
            </div>
            {note.code && (
              <form onSubmit={typed} className="mt-3 flex gap-2">
                <input
                  value={num}
                  onChange={(e) => setNum(e.target.value)}
                  inputMode="numeric"
                  placeholder={t('scan.typeNumber')}
                  aria-label={t('scan.typeNumber')}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-ink"
                />
                <Button type="submit">{t('scan.open')}</Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
