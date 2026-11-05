import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, cx, EmptyState, Spinner } from '../components/ui';
import { t } from '../i18n';
import { ApiError } from '../lib/api';
import { money, timeHM } from '../lib/format';
import { usePageTitle } from '../lib/title';
import { useAdActions, useConversations, useThread, type Conversation } from './store';

function Avatar({ name }: { name: string }) {
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-sm font-extrabold">{name[0]}</span>;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? timeHM(iso) : d.toLocaleDateString('sr-RS', { day: 'numeric', month: 'numeric' });
};

function Thread({ c }: { c: Conversation }) {
  const q = useThread(String(c.id));
  const actions = useAdActions();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const msgs = q.data?.messages ?? [];
  // opening a conversation reads it on the server; refresh the badge and the list once it did
  useEffect(() => {
    if (q.isSuccess && c.unread) void actions.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isSuccess, c.id]);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [msgs.length]);

  async function send() {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await actions.reply(c.id, v);
      setText('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('ads.detail.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-[28rem] flex-col rounded-3xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <Link to="/poruke" className="text-sm font-bold text-ink-2 lg:hidden">←</Link>
        <Avatar name={c.other} />
        <div className="min-w-0 flex-1">
          <div className="font-extrabold">{c.other}</div>
          {c.listing_id ? (
            <Link to={`/oglasi/${c.listing_id}`} className="block truncate text-xs text-ink-3 hover:underline">{c.listing_title}</Link>
          ) : (
            <span className="block truncate text-xs text-ink-3">{c.listing_title} · {t('msg.adDeleted')}</span>
          )}
        </div>
        {c.listing_image && <img src={c.listing_image} alt="" className="hidden h-11 w-14 rounded-lg object-cover sm:block" />}
        {c.listing_price !== null && <div className="tabular text-sm font-extrabold">{money(c.listing_price)}</div>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4" style={{ maxHeight: '28rem' }}>
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-3">{t('msg.safety')}</p>
        {q.isLoading && <div className="grid place-items-center py-6"><Spinner /></div>}
        {msgs.map((m) => (
          <div key={m.id} className={cx('flex', m.mine ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.mine ? 'rounded-br-md bg-brand text-brand-ink' : 'rounded-bl-md bg-surface-2')}>
              <p className="whitespace-pre-line break-words">{m.text}</p>
              <div className="mt-0.5 text-right text-[10px] opacity-60">{when(m.at)}</div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => (e.preventDefault(), void send())}>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void send())}
          maxLength={1000}
          placeholder={t('msg.placeholder')}
          className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
        <Button type="submit" disabled={!text.trim() || busy}>{t('msg.send')}</Button>
      </form>
      {err && <p role="alert" className="mx-3 mb-2 rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">{err}</p>}
      <div className="flex justify-end px-4 pb-3 text-xs text-ink-3">
        <button className="font-bold underline" disabled={reported} onClick={() => void actions.reportConversation(c.id).then(() => setReported(true)).catch(() => {})}>{reported ? t('msg.reported') : t('msg.report')}</button>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  usePageTitle(t('title.messages'));
  const { id } = useParams();
  const q = useConversations();
  const convs = q.data ?? [];
  const active = convs.find((c) => String(c.id) === id);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">{t('msg.title')}</h1>
      {q.isLoading ? (
        <div className="grid min-h-[30vh] place-items-center"><Spinner className="h-8 w-8" /></div>
      ) : convs.length ? (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <ul className={cx('space-y-2', id && 'hidden lg:block')}>
            {convs.map((c) => (
              <li key={c.id}>
                <Link to={`/poruke/${c.id}`} className={cx('flex items-center gap-3 rounded-2xl border p-3 transition hover:border-ink-3', String(c.id) === id ? 'border-ink bg-surface-2' : 'border-line bg-surface')}>
                  <Avatar name={c.other} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cx('truncate text-sm', c.unread ? 'font-extrabold' : 'font-bold')}>{c.other}</span>
                      {c.last && <span className="shrink-0 text-[11px] text-ink-3">{when(c.last.at)}</span>}
                    </div>
                    <div className="truncate text-xs text-ink-3">{c.listing_title}</div>
                    {c.last && <div className={cx('truncate text-xs', c.unread ? 'font-bold text-ink' : 'text-ink-2')}>{c.last.mine ? t('msg.you') + ' ' : ''}{c.last.text}</div>}
                  </div>
                  {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-deal px-1.5 text-[11px] font-extrabold text-white">{c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <div className={cx(!id && 'hidden lg:block')}>
            {active ? <Thread key={active.id} c={active} /> : <div className="grid min-h-[20rem] place-items-center rounded-3xl border border-dashed border-line text-sm text-ink-3">{t('msg.pick')}</div>}
          </div>
        </div>
      ) : (
        <EmptyState title={t('msg.empty')} text={t('msg.emptyText')} action={<Link to="/oglasi" className="font-bold underline">{t('ads.title')}</Link>} />
      )}
    </div>
  );
}
