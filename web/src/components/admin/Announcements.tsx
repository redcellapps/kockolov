import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { t, tn } from '../../i18n';
import { api } from '../../lib/api';
import { ago, num } from '../../lib/format';
import { Button, Spinner, cx } from '../ui';

interface Sent {
  id: number;
  subject: string;
  created_at: string;
  finished_at: string | null;
  status: 'sending' | 'sent';
  author: string | null;
  total: number;
  sent: number;
  failed: number;
}
interface Info {
  recipients: number;
  mailConfigured: boolean;
  delayMs: number;
  adminEmail: string;
  items: Sent[];
}
interface Draft {
  subject: string;
  body: string;
}

// the draft survives a reload of the admin page (this browser only)
const DRAFT_KEY = 'kockolov.admin.newsDraft';
function loadDraft(): Draft {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (v && typeof v.subject === 'string' && typeof v.body === 'string') return v;
  } catch {
    // no storage: start empty
  }
  return { subject: '', body: '' };
}

const field = 'w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-ink';

/** Admin: write a news e-mail, preview it, send a test copy to yourself, then send it to everyone. */
export function Announcements() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const info = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => api<Info>('/api/admin/announcements'),
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.status === 'sending') ? 3000 : false),
  });

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // no storage: the draft just isn't kept
    }
  }, [draft]);

  // the preview follows the text after a short pause in typing
  const [shown, setShown] = useState(draft);
  useEffect(() => {
    const id = setTimeout(() => setShown(draft), 400);
    return () => clearTimeout(id);
  }, [draft]);
  const preview = useQuery({
    queryKey: ['admin', 'announcements', 'preview', shown],
    queryFn: () => api<{ html: string }>('/api/admin/announcements/preview', { method: 'POST', json: shown }),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'], exact: true });
  const fail = (e: unknown) => setNotice({ ok: false, text: (e as Error).message });
  const test = useMutation({
    mutationFn: () => api<{ email: string }>('/api/admin/announcements/test', { method: 'POST', json: draft }),
    onSuccess: (r) => setNotice({ ok: true, text: t('admin.news.testSent', { email: r.email }) }),
    onError: fail,
  });
  const send = useMutation({
    mutationFn: () =>
      api<{ recipients: number }>('/api/admin/announcements', { method: 'POST', json: { ...draft, expected: info.data?.recipients ?? 0 } }),
    onSuccess: () => {
      setDraft({ subject: '', body: '' });
      setNotice({ ok: true, text: t('admin.news.started') });
    },
    onError: fail,
    onSettled: () => {
      setConfirming(false);
      void refresh();
    },
  });
  const retry = useMutation({
    mutationFn: (id: number) => api(`/api/admin/announcements/${id}/retry`, { method: 'POST' }),
    onError: fail,
    onSettled: () => void refresh(),
  });

  const n = info.data?.recipients ?? 0;
  const canMail = info.data?.mailConfigured ?? false;
  const valid = draft.subject.trim().length >= 3 && draft.body.trim().length >= 10;
  const busy = test.isPending || send.isPending;
  const minutes = Math.ceil((n * (info.data?.delayMs ?? 1500)) / 60_000);
  const duration = minutes <= 1 ? t('admin.news.time.short') : t('admin.news.time', { n: minutes });
  const edit = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setConfirming(false);
    setNotice(null);
  };

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">{t('admin.news')}</h2>
        {info.data && <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-ink-2">{t('admin.news.recipients', { n: num(n) })}</span>}
      </div>
      <p className="mb-5 max-w-3xl text-sm text-ink-3">{t('admin.news.intro')}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('admin.news.subject')}</span>
            <input
              id="news-subject"
              className={cx(field, 'h-11')}
              maxLength={150}
              placeholder={t('admin.news.subject.ph')}
              value={draft.subject}
              onChange={(e) => edit({ subject: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('admin.news.body')}</span>
            <textarea
              id="news-body"
              className={cx(field, 'min-h-72 resize-y py-3 leading-relaxed')}
              rows={12}
              maxLength={20000}
              placeholder={t('admin.news.body.ph')}
              value={draft.body}
              onChange={(e) => edit({ body: e.target.value })}
            />
          </label>
          <p className="text-xs leading-relaxed text-ink-3">{t('admin.news.hint')}</p>

          {info.data && !canMail && <p className="rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">{t('admin.news.noMail')}</p>}
          {notice && <p className={cx('text-sm font-semibold', notice.ok ? 'text-save' : 'text-deal')}>{notice.text}</p>}

          {confirming ? (
            <div className="rounded-2xl border-2 border-ink p-4">
              <p className="text-[15px] font-bold">{tn('admin.news.confirm.title', n)}</p>
              <p className="mt-1 text-sm text-ink-2">{t('admin.news.confirm.text', { subject: draft.subject.trim(), time: duration })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="dark" disabled={busy} onClick={() => send.mutate()}>
                  {send.isPending && <Spinner className="h-4 w-4" />} {t('admin.news.confirm.yes')}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                  {t('admin.news.confirm.no')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!valid || busy || !canMail} onClick={() => test.mutate()}>
                {test.isPending && <Spinner className="h-4 w-4" />} {t('admin.news.test', { email: info.data?.adminEmail ?? '' })}
              </Button>
              <Button disabled={!valid || busy || !canMail || n === 0} onClick={() => setConfirming(true)}>
                {t('admin.news.send', { n: num(n) })}
              </Button>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-ink-2">
            {t('admin.news.preview')} {preview.isFetching && <Spinner className="h-3.5 w-3.5" />}
          </div>
          <iframe
            title={t('admin.news.preview')}
            sandbox=""
            srcDoc={preview.data?.html ?? ''}
            className="h-[680px] w-full rounded-2xl border border-line bg-[#f6f4ee]"
          />
        </div>
      </div>

      <h3 className="mt-8 mb-3 text-base font-extrabold">{t('admin.news.history')}</h3>
      {info.data && !info.data.items.length && <p className="text-sm text-ink-3">{t('admin.news.empty')}</p>}
      <div className="space-y-2">
        {info.data?.items.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{a.subject}</div>
              <div className="text-xs text-ink-3">
                {a.author ? `${a.author} · ` : ''}
                {ago(a.created_at)}
              </div>
            </div>
            {a.status === 'sending' ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-ink-2">
                <Spinner className="h-3.5 w-3.5" /> {t('admin.news.sending', { sent: num(a.sent), total: num(a.total) })}
              </span>
            ) : (
              <span className="rounded-full bg-save-soft px-3 py-1 text-sm font-semibold text-save">
                {t('admin.news.sent', { sent: num(a.sent), total: num(a.total) })}
              </span>
            )}
            {a.failed > 0 && (
              <>
                <span className="rounded-full bg-deal-soft px-3 py-1 text-sm font-semibold text-deal">{t('admin.news.failed', { n: num(a.failed) })}</span>
                {a.status === 'sent' && (
                  <Button size="sm" variant="outline" disabled={retry.isPending || !canMail} onClick={() => retry.mutate(a.id)}>
                    {t('admin.news.retry')}
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
