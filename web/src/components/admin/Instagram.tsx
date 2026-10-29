import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { ago } from '../../lib/format';
import { Button, Spinner, buttonClasses, cx } from '../ui';

type Status = 'ready' | 'publishing' | 'published' | 'posted_by_hand' | 'failed' | 'skipped';

interface Post {
  id: number;
  day: string;
  set_num: string;
  caption: string;
  status: Status;
  permalink: string | null;
  error: string | null;
  published_at: string | null;
  card: { name: string };
  image: string;
  filename: string;
}
interface Info {
  account: { username: string; paused: boolean; refreshed_at: string; api: 'instagram' | 'facebook'; page_name: string } | null;
  schedule: string;
  today: Post | null;
  recent: Post[];
}

const STATUS_STYLE: Record<Status, string> = {
  ready: 'bg-brand/30 text-ink',
  publishing: 'bg-surface-2 text-ink-2',
  published: 'bg-save-soft text-save',
  posted_by_hand: 'bg-save-soft text-save',
  failed: 'bg-deal-soft text-deal',
  skipped: 'bg-surface-2 text-ink-3',
};

/** "30 8 * * *" -> "8:30" */
function cronTime(cron: string): string | null {
  const [m, h] = cron.split(/\s+/);
  return /^\d+$/.test(m ?? '') && /^\d+$/.test(h ?? '') ? `${Number(h)}:${m.padStart(2, '0')}` : null;
}

function StatusPill({ s }: { s: Status }) {
  return <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold', STATUS_STYLE[s])}>{t(`admin.ig.status.${s}`)}</span>;
}

/**
 * Admin: the Instagram "set dana". Every morning the server picks a popular set and makes a picture
 * and a caption; with an Instagram account connected it publishes them, otherwise they wait here.
 */
export function Instagram() {
  const qc = useQueryClient();
  const ref = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const info = useQuery({
    queryKey: ['admin', 'instagram'],
    queryFn: () => api<Info>('/api/admin/instagram'),
    refetchInterval: (q) => (q.state.data?.today?.status === 'publishing' ? 4000 : false),
  });

  // the morning e-mail links to /admin#instagram
  useEffect(() => {
    if (window.location.hash === '#instagram' && info.data) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [info.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'instagram'] });
  const act = (path: string, ok: string, json?: unknown) => ({
    mutationFn: () => api(path, { method: 'POST', ...(json !== undefined ? { json } : {}) }),
    onSuccess: () => setNotice({ ok: true, text: ok }),
    onError: (e: unknown) => setNotice({ ok: false, text: (e as Error).message }),
    onSettled: () => void refresh(),
  });

  const p = info.data?.today ?? null;
  const acc = info.data?.account ?? null;
  const prepare = useMutation(act('/api/admin/instagram/prepare', t('admin.ig.prepared')));
  const skip = useMutation(act(`/api/admin/instagram/${p?.id}/skip`, t('admin.ig.skipped')));
  const posted = useMutation(act(`/api/admin/instagram/${p?.id}/posted`, t('admin.ig.markedPosted')));
  const publish = useMutation(act(`/api/admin/instagram/${p?.id}/publish`, t('admin.ig.published')));
  const connect = useMutation({
    mutationFn: () => api('/api/admin/instagram/account', { method: 'POST', json: { token } }),
    onSuccess: () => {
      setToken('');
      setNotice({ ok: true, text: t('admin.ig.connected') });
    },
    onError: (e: unknown) => setNotice({ ok: false, text: (e as Error).message }),
    onSettled: () => void refresh(),
  });
  const pause = useMutation(act('/api/admin/instagram/account/pause', t('admin.ig.saved'), { paused: !acc?.paused }));
  const disconnect = useMutation({
    mutationFn: () => api('/api/admin/instagram/account', { method: 'DELETE' }),
    onSuccess: () => setNotice({ ok: true, text: t('admin.ig.disconnected') }),
    onError: (e: unknown) => setNotice({ ok: false, text: (e as Error).message }),
    onSettled: () => void refresh(),
  });
  const busy = [prepare, skip, posted, publish, connect, pause, disconnect].some((m) => m.isPending);
  const waiting = p && (p.status === 'ready' || p.status === 'failed');
  const time = info.data ? cronTime(info.data.schedule) : null;

  const copy = async () => {
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p.caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ ok: false, text: t('admin.ig.copyFailed') });
    }
  };

  return (
    <section id="instagram" ref={ref} className="scroll-mt-24 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">{t('admin.ig.title')}</h2>
        {info.data && (
          <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-ink-2">
            {acc ? (acc.paused ? t('admin.ig.account.paused', { user: acc.username }) : `@${acc.username}`) : t('admin.ig.account.none')}
          </span>
        )}
      </div>
      <p className="mb-5 max-w-3xl text-sm text-ink-3">
        {info.data && !info.data.schedule ? t('admin.ig.intro.off') : t('admin.ig.intro', { time: time ?? info.data?.schedule ?? '' })}
      </p>
      {info.isLoading && <Spinner />}
      {notice && <p className={cx('mb-4 text-sm font-semibold', notice.ok ? 'text-save' : 'text-deal')}>{notice.text}</p>}

      {info.data && !p && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-sm text-ink-2">{t('admin.ig.none')}</span>
          <Button size="sm" variant="dark" disabled={busy} onClick={() => prepare.mutate()}>
            {prepare.isPending && <Spinner className="h-4 w-4" />} {t('admin.ig.prepare')}
          </Button>
        </div>
      )}

      {p && (
        <div className="mb-6 grid gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
          <a href={p.image} target="_blank" rel="noreferrer" className="block">
            <img src={p.image} alt={p.card.name} width={1080} height={1350} className="h-auto w-full rounded-2xl border border-line" />
          </a>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-extrabold">
                {p.set_num} · {p.card.name}
              </span>
              <StatusPill s={p.status} />
            </div>
            {p.error && <p className="mb-2 text-sm font-semibold text-deal">{p.error}</p>}
            <textarea
              readOnly
              value={p.caption}
              rows={11}
              aria-label={t('admin.ig.caption')}
              className="w-full resize-y rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[14px] leading-relaxed"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? t('admin.ig.copied') : t('admin.ig.copy')}
              </Button>
              <a href={p.image} download={p.filename} className={buttonClasses('outline', 'sm')}>
                {t('admin.ig.download')}
              </a>
              {waiting && acc && (
                <Button size="sm" variant="dark" disabled={busy} onClick={() => publish.mutate()}>
                  {publish.isPending && <Spinner className="h-4 w-4" />} {t('admin.ig.publish')}
                </Button>
              )}
              {waiting && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => posted.mutate()}>
                  {t('admin.ig.markPosted')}
                </Button>
              )}
              {waiting && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => skip.mutate()}>
                  {skip.isPending && <Spinner className="h-4 w-4" />} {t('admin.ig.skip')}
                </Button>
              )}
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
                  {t('admin.ig.open')}
                </a>
              )}
            </div>
            {!acc && waiting && <p className="mt-3 text-xs text-ink-3">{t('admin.ig.byHand')}</p>}
          </div>
        </div>
      )}

      <h3 className="mb-2 text-base font-extrabold">{t('admin.ig.account')}</h3>
      {acc ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-2">
            {acc.api === 'facebook'
              ? t('admin.ig.account.infoFb', { user: acc.username, page: acc.page_name })
              : t('admin.ig.account.info', { user: acc.username, when: ago(acc.refreshed_at) })}
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => pause.mutate()}>
            {acc.paused ? t('admin.ig.resume') : t('admin.ig.pause')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => disconnect.mutate()}>
            {t('admin.ig.disconnect')}
          </Button>
        </div>
      ) : (
        <form
          className="mb-6 max-w-2xl space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            connect.mutate();
          }}
        >
          <p className="text-sm text-ink-3">{t('admin.ig.connect.hint')}</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-ink"
              placeholder={t('admin.ig.connect.ph')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button size="sm" variant="dark" type="submit" disabled={busy || token.trim().length < 20}>
              {connect.isPending && <Spinner className="h-4 w-4" />} {t('admin.ig.connect')}
            </Button>
          </div>
        </form>
      )}

      {!!info.data?.recent.length && (
        <>
          <h3 className="mb-2 text-base font-extrabold">{t('admin.ig.recent')}</h3>
          <div className="space-y-2">
            {info.data.recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                <img src={r.image} alt="" width={40} height={50} loading="lazy" className="h-[50px] w-10 shrink-0 rounded-md border border-line object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {r.set_num} · {r.card.name}
                  </div>
                  <div className="text-xs text-ink-3">{r.day}</div>
                </div>
                <StatusPill s={r.status} />
                {r.permalink && (
                  <a href={r.permalink} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent">
                    {t('admin.ig.open')}
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
