import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, cx, EmptyState } from '../components/ui';
import { t } from '../i18n';
import { money, timeHM } from '../lib/format';
import { usePageTitle } from '../lib/title';
import { ProtoBanner } from './ListingsPage';
import { markRead, reportConversation, sendMessage, useConversations, useOutbox, type Conversation } from './messages';
import { useListings } from './store';

function Avatar({ name }: { name: string }) {
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-sm font-extrabold">{name[0]}</span>;
}

const last = (c: Conversation) => c.messages.at(-1);
const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? timeHM(iso) : d.toLocaleDateString('sr-RS', { day: 'numeric', month: 'numeric' });
};

function Thread({ c }: { c: Conversation }) {
  const listing = useListings().find((l) => l.id === c.listing_id);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    markRead(c.id);
    end.current?.scrollIntoView({ block: 'end' });
  }, [c.id, c.messages.length, c.unread]);
  const img = listing?.images[0] ?? c.listing_image;
  return (
    <div className="flex min-h-[28rem] flex-col rounded-3xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <Link to="/poruke" className="text-sm font-bold text-ink-2 lg:hidden">←</Link>
        <Avatar name={c.other} />
        <div className="min-w-0 flex-1">
          <div className="font-extrabold">{c.other}</div>
          <Link to={`/oglasi/${c.listing_id}`} className="block truncate text-xs text-ink-3 hover:underline">{c.listing_title}</Link>
        </div>
        {img && <img src={img} alt="" className="hidden h-11 w-14 rounded-lg object-cover sm:block" />}
        <div className="tabular text-sm font-extrabold">{money(listing?.price_rsd ?? c.listing_price)}</div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4" style={{ maxHeight: '28rem' }}>
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-3">{t('msg.safety')}</p>
        {c.messages.map((m) => (
          <div key={m.id} className={cx('flex', m.from === 'me' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.from === 'me' ? 'rounded-br-md bg-brand text-brand-ink' : 'rounded-bl-md bg-surface-2')}>
              <p className="whitespace-pre-line">{m.text}</p>
              <div className="mt-0.5 text-right text-[10px] opacity-60">{when(m.at)}</div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(c.id, text);
          setText('');
        }}
      >
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage(c.id, text), setText(''))}
          maxLength={1000}
          placeholder={t('msg.placeholder')}
          className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
        <Button type="submit" disabled={!text.trim()}>{t('msg.send')}</Button>
      </form>
      <div className="flex justify-between px-4 pb-3 text-xs text-ink-3">
        <span>{t('msg.protoReply')}</span>
        <button className="font-bold underline" disabled={c.reported} onClick={() => reportConversation(c.id)}>{c.reported ? t('msg.reported') : t('msg.report')}</button>
      </div>
    </div>
  );
}

function Outbox() {
  const mails = useOutbox();
  return (
    <details className="mt-8 rounded-2xl border border-dashed border-ink-3 bg-surface-2 p-4">
      <summary className="cursor-pointer text-sm font-extrabold">📧 {t('msg.outbox')} ({mails.length})</summary>
      <p className="mt-2 text-xs text-ink-3">{t('msg.outboxHint')}</p>
      <ul className="mt-3 space-y-3">
        {mails.map((m) => (
          <li key={m.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
            <div className="font-extrabold">{m.subject}</div>
            <div className="text-xs text-ink-3">{when(m.at)}</div>
            <p className="mt-2 whitespace-pre-line text-ink-2">{m.body}</p>
            <Link to={`/poruke/${m.conv_id}`} className="mt-2 inline-block rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-bg">{t('msg.reply')}</Link>
          </li>
        ))}
        {!mails.length && <li className="text-xs text-ink-3">{t('msg.outboxEmpty')}</li>}
      </ul>
    </details>
  );
}

export default function MessagesPage() {
  usePageTitle(t('title.messages'));
  const { id } = useParams();
  const convs = [...useConversations()].filter((c) => c.messages.length).sort((a, b) => +new Date(last(b)!.at) - +new Date(last(a)!.at));
  const active = convs.find((c) => c.id === id);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <ProtoBanner />
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">{t('msg.title')}</h1>
      {convs.length ? (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <ul className={cx('space-y-2', id && 'hidden lg:block')}>
            {convs.map((c) => (
              <li key={c.id}>
                <Link to={`/poruke/${c.id}`} className={cx('flex items-center gap-3 rounded-2xl border p-3 transition hover:border-ink-3', c.id === id ? 'border-ink bg-surface-2' : 'border-line bg-surface')}>
                  <Avatar name={c.other} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cx('truncate text-sm', c.unread ? 'font-extrabold' : 'font-bold')}>{c.other}</span>
                      <span className="shrink-0 text-[11px] text-ink-3">{when(last(c)!.at)}</span>
                    </div>
                    <div className="truncate text-xs text-ink-3">{c.listing_title}</div>
                    <div className={cx('truncate text-xs', c.unread ? 'font-bold text-ink' : 'text-ink-2')}>{last(c)!.from === 'me' ? t('msg.you') + ' ' : ''}{last(c)!.text}</div>
                  </div>
                  {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-deal px-1.5 text-[11px] font-extrabold text-white">{c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <div className={cx(!id && 'hidden lg:block')}>
            {active ? <Thread c={active} /> : <div className="grid min-h-[20rem] place-items-center rounded-3xl border border-dashed border-line text-sm text-ink-3">{t('msg.pick')}</div>}
          </div>
        </div>
      ) : (
        <EmptyState title={t('msg.empty')} text={t('msg.emptyText')} action={<Link to="/oglasi" className="font-bold underline">{t('ads.title')}</Link>} />
      )}
      <Outbox />
    </div>
  );
}
