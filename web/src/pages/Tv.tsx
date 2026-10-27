import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../components/ui';
import { t } from '../i18n';
import { trackEvent } from '../lib/analytics';
import { api } from '../lib/api';
import { usePageTitle } from '../lib/title';

/** The TV shows a code; the signed-in user confirms it here (Gate needUser sends visitors to sign in first). */
export default function TvPage() {
  usePageTitle(t('title.tv'));
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('kod') ?? '');
  const confirm = useMutation({
    mutationFn: () => api<{ ok: true; device: string | null }>('/api/me/tv/confirm', { method: 'POST', json: { code } }),
    onSuccess: (r) => trackEvent('tv-uparen', { uredjaj: r.device ?? 'TV' }),
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('tv.title')}</h1>
      {confirm.isSuccess ? (
        <div className="mt-6 rounded-3xl border border-line bg-surface p-6 sm:p-7">
          <h2 className="text-lg font-extrabold text-save">{t('tv.done.title')}</h2>
          <p className="mt-2 text-ink-2">{t('tv.done.text', { device: confirm.data.device || t('account.tv') })}</p>
          <p className="mt-2 text-sm text-ink-3">
            <Link to="/nalog" className="underline">
              {t('tv.done.account')}
            </Link>
          </p>
          <Button
            type="button"
            variant="dark"
            className="mt-5"
            onClick={() => {
              setCode('');
              confirm.reset();
            }}
          >
            {t('tv.again')}
          </Button>
        </div>
      ) : (
        <form
          className="mt-6 rounded-3xl border border-line bg-surface p-6 sm:p-7"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <p className="text-ink-2">{t('tv.intro')}</p>
          <label className="mt-5 block text-sm font-semibold" htmlFor="tv-code">
            {t('tv.code')}
          </label>
          <input
            id="tv-code"
            className="mt-2 h-14 w-full rounded-xl border border-line bg-surface px-4 text-center font-mono text-2xl tracking-[0.3em] uppercase outline-none focus:border-ink"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7P3MX"
            maxLength={8}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
          {confirm.isError && <p className="mt-3 text-sm font-semibold text-deal">{(confirm.error as Error).message}</p>}
          <Button type="submit" variant="primary" className="mt-5" disabled={confirm.isPending || code.replace(/[^A-Za-z0-9]/g, '').length < 6}>
            {t('tv.submit')}
          </Button>
        </form>
      )}
    </div>
  );
}
