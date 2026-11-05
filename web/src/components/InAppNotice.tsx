import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../i18n';
import { IN_APP_PUSH, type InAppPush } from '../lib/inAppPush';
import { appPlatform } from '../lib/platform';
import { BellIcon, XIcon } from './icons';

/** Lists that a notification may have changed: refreshed at once instead of on their own timer */
const FRESH = ['ads', 'ad', 'my-ads', 'watched-ads', 'ads-status', 'conversations', 'thread', 'watchlist'];

/**
 * In the app, a notification that arrives while the app is open: a banner at the top for a few seconds
 * (a tap opens its page). Not shown for a message of the conversation that is open on the screen.
 */
export function InAppNotice() {
  const [n, setN] = useState<InAppPush | null>(null);
  const qc = useQueryClient();
  const nav = useNavigate();
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<InAppPush>).detail;
      void qc.invalidateQueries({ predicate: (q) => FRESH.includes(String(q.queryKey[0])) });
      // an iPhone shows the banner itself (presentationOptions in capacitor.config.json)
      if (appPlatform !== 'android' || (d.url && window.location.pathname === d.url)) return;
      setN(d);
    };
    window.addEventListener(IN_APP_PUSH, on);
    return () => window.removeEventListener(IN_APP_PUSH, on);
  }, [qc]);
  useEffect(() => {
    if (!n) return;
    const id = window.setTimeout(() => setN(null), 6000);
    return () => window.clearTimeout(id);
  }, [n]);
  if (!n) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
      <div role="status" aria-live="polite" className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-lg">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          onClick={() => {
            setN(null);
            if (n.url) nav(n.url);
          }}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
            <BellIcon size={18} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold">{n.title}</span>
            <span className="line-clamp-2 block text-xs text-ink-2">{n.body}</span>
          </span>
        </button>
        <button type="button" aria-label={t('inapp.close')} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2" onClick={() => setN(null)}>
          <XIcon size={16} />
        </button>
      </div>
    </div>
  );
}
