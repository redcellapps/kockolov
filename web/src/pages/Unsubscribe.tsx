import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button, Spinner, buttonClasses } from '../components/ui';
import { t, type TKey } from '../i18n';
import { api } from '../lib/api';
import { AuthCard } from './Login';

type State = { email: string; digestEnabled: boolean; newsEnabled: boolean };

// texts per list: the morning digest, or the news e-mails (/odjava/:token?lista=novosti)
const TEXTS: Record<'digest' | 'news', Record<'title' | 'text' | 'offTitle' | 'offText' | 'undo' | 'onTitle' | 'onText' | 'bad', TKey>> = {
  digest: {
    title: 'unsub.title',
    text: 'unsub.text',
    offTitle: 'unsub.offTitle',
    offText: 'unsub.offText',
    undo: 'unsub.undo',
    onTitle: 'unsub.onTitle',
    onText: 'unsub.onText',
    bad: 'unsub.bad',
  },
  news: {
    title: 'unsub.news.title',
    text: 'unsub.news.text',
    offTitle: 'unsub.offTitle',
    offText: 'unsub.news.offText',
    undo: 'unsub.news.undo',
    onTitle: 'unsub.news.onTitle',
    onText: 'unsub.news.onText',
    bad: 'unsub.news.bad',
  },
};

/** /odjava/:token from the e-mails: turns the morning digest or the news off (or back on) without logging in. */
export default function UnsubscribePage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const list = params.get('lista') === 'novosti' ? 'news' : 'digest';
  const tx = TEXTS[list];
  const path = `/api/unsubscribe/${encodeURIComponent(token)}`;
  const info = useQuery({
    queryKey: ['unsubscribe', token],
    queryFn: () => api<State>(path),
    retry: false,
  });
  const change = useMutation({
    mutationFn: (on: boolean) => {
      const q = new URLSearchParams(list === 'news' ? { list: 'news' } : {});
      if (on) q.set('on', '1');
      const qs = q.toString();
      return api<State>(`${path}${qs ? `?${qs}` : ''}`, { method: 'POST' });
    },
  });

  const email = info.data?.email ?? '';
  const key = list === 'news' ? 'newsEnabled' : 'digestEnabled';
  // before any click: show the question while the e-mails are on
  const enabled = change.data ? change.data[key] : info.data?.[key];
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
          <h1 className="mt-6 text-2xl font-extrabold">{t(tx.title)}</h1>
          <p className="mt-2 text-ink-2">{t(tx.bad)}</p>
          <Link to="/nalog" className={buttonClasses('dark', 'lg', 'mt-6 w-full')}>
            {t('nav.account')}
          </Link>
        </>
      )}
      {info.data && (
        <>
          {enabled && !changed && (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">{t(tx.title)}</h1>
              <p className="mt-2 text-ink-2">{t(tx.text, { email })}</p>
              <Button size="lg" variant="dark" className="mt-6 w-full" disabled={change.isPending} onClick={() => change.mutate(false)}>
                {t('unsub.submit')}
              </Button>
            </>
          )}
          {!enabled && (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">{t(tx.offTitle)}</h1>
              <p className="mt-2 text-ink-2">{t(tx.offText, { email })}</p>
              <Button size="lg" variant="outline" className="mt-6 w-full" disabled={change.isPending} onClick={() => change.mutate(true)}>
                {t(tx.undo)}
              </Button>
            </>
          )}
          {enabled && changed && (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">{t(tx.onTitle)}</h1>
              <p className="mt-2 text-ink-2">{t(tx.onText, { email })}</p>
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
