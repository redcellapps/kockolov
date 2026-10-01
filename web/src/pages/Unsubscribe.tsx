import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Button, Spinner, buttonClasses } from '../components/ui';
import { t } from '../i18n';
import { api } from '../lib/api';
import { AuthCard } from './Login';

/** /odjava/:token from the morning e-mail: turns the digest off (or back on) without logging in. */
export default function UnsubscribePage() {
  const { token = '' } = useParams();
  const path = `/api/unsubscribe/${encodeURIComponent(token)}`;
  const info = useQuery({
    queryKey: ['unsubscribe', token],
    queryFn: () => api<{ email: string; digestEnabled: boolean }>(path),
    retry: false,
  });
  const change = useMutation({
    mutationFn: (on: boolean) => api<{ digestEnabled: boolean }>(`${path}${on ? '?on=1' : ''}`, { method: 'POST' }),
  });

  const email = info.data?.email ?? '';
  // before any click: show the question while the digest is on
  const enabled = change.data ? change.data.digestEnabled : info.data?.digestEnabled;
  const changed = !!change.data;

  return (
    <AuthCard>
      {info.isLoading && (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      )}
      {info.isError && (
        <>
          <h1 className="mt-6 text-2xl font-extrabold">{t('unsub.title')}</h1>
          <p className="mt-2 text-ink-2">{t('unsub.bad')}</p>
          <Link to="/nalog" className={buttonClasses('dark', 'lg', 'mt-6 w-full')}>
            {t('nav.account')}
          </Link>
        </>
      )}
      {info.data && (
        <>
          {enabled && !changed && (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">{t('unsub.title')}</h1>
              <p className="mt-2 text-ink-2">{t('unsub.text', { email })}</p>
              <Button size="lg" variant="dark" className="mt-6 w-full" disabled={change.isPending} onClick={() => change.mutate(false)}>
                {t('unsub.submit')}
              </Button>
            </>
          )}
          {!enabled && (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">{t('unsub.offTitle')}</h1>
              <p className="mt-2 text-ink-2">{t('unsub.offText', { email })}</p>
              <Button size="lg" variant="outline" className="mt-6 w-full" disabled={change.isPending} onClick={() => change.mutate(true)}>
                {t('unsub.undo')}
              </Button>
            </>
          )}
          {enabled && changed && (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">{t('unsub.onTitle')}</h1>
              <p className="mt-2 text-ink-2">{t('unsub.onText', { email })}</p>
            </>
          )}
          {change.isError && <p className="mt-4 text-sm font-semibold text-deal">{(change.error as Error).message}</p>}
          <Link to="/" className="mt-5 block text-center text-sm font-bold text-accent hover:underline">
            {t('unsub.toSite')}
          </Link>
        </>
      )}
    </AuthCard>
  );
}
