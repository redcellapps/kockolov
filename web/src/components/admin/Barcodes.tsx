import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { num } from '../../lib/format';
import { buttonClasses } from '../ui';

interface EanStats {
  found: number;
  missing: number;
  waiting: number;
  total: number;
}

/**
 * Admin: box barcodes for the app's scanner, read from the LEGO Store a few hundred a day.
 * Shows how far it has got and offers the whole list as an Excel file.
 */
export function Barcodes() {
  const q = useQuery({ queryKey: ['admin', 'eans'], queryFn: () => api<EanStats>('/api/admin/eans'), refetchInterval: 30_000 });
  const s = q.data;
  const checked = s ? s.total - s.waiting : 0;
  const pct = s && s.total ? Math.round((100 * checked) / s.total) : 0;
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">{t('admin.eans.title')}</h2>
          <p className="mt-0.5 text-sm text-ink-3">{t('admin.eans.hint')}</p>
        </div>
        <a href="/api/admin/eans.xlsx" download className={buttonClasses('dark', 'md', !s?.found ? 'pointer-events-none opacity-50' : undefined)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          {t('admin.eans.download')}
        </a>
      </div>
      {s && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {(
              [
                ['admin.eans.found', s.found, 'text-save'],
                ['admin.eans.missing', s.missing, 'text-ink'],
                ['admin.eans.waiting', s.waiting, 'text-ink'],
                ['admin.eans.total', s.total, 'text-ink'],
              ] as const
            ).map(([k, n, color]) => (
              <div key={k} className="rounded-2xl bg-surface-2 px-4 py-3">
                <dt className="text-xs text-ink-3">{t(k)}</dt>
                <dd className={`tabular text-xl font-extrabold ${color}`}>{num(n)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-save" style={{ width: `${pct}%` }} />
            </div>
            <span className="tabular text-sm font-bold text-ink-2">{t('admin.eans.progress', { pct })}</span>
          </div>
        </>
      )}
    </section>
  );
}
