import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { t, tn } from '../i18n';
import { api } from '../lib/api';
import { isApp } from '../lib/platform';
import { disablePush, enablePush, installApp, pushAddress, pushStatus, usePwa, type PushStatus } from '../lib/pwa';
import { BellIcon, XIcon } from './icons';
import { Button, Toggle } from './ui';

/** This device's notification state, and the number of the account's devices that get them */
function usePush() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['push-status'], queryFn: pushStatus, staleTime: Infinity });
  const devices = useQuery({ queryKey: ['push-devices'], queryFn: () => api<{ devices: number }>('/api/me/push') });
  const change = useMutation({
    mutationFn: (on: boolean) => (on ? enablePush() : disablePush()),
    onSuccess: (s: PushStatus) => {
      qc.setQueryData(['push-status'], s);
      void qc.invalidateQueries({ queryKey: ['push-devices'] });
    },
  });
  return { status: status.data, devices: devices.data?.devices ?? 0, change };
}

function IosSteps({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0 text-accent">
        <path d="M12 3v12M8 7l4-4 4 4" />
        <path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
      </svg>
      <p>{text}</p>
    </div>
  );
}

/** Account page: install the site as an app, notifications on this device, a sample notification */
export function PhoneCard() {
  const pwa = usePwa();
  const push = usePush();
  const [test, setTest] = useState<'sent' | 'failed' | null>(null);
  const sample = useMutation({
    mutationFn: async () => api<{ ok: boolean }>('/api/me/push/test', { method: 'POST', json: { endpoint: await pushAddress() } }),
    onSuccess: (r) => setTest(r.ok ? 'sent' : 'failed'),
    onError: () => setTest('failed'),
  });
  const iosNeedsInstall = pwa.ios && !pwa.standalone && push.status === 'unsupported';

  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
      <h2 className="mb-1 text-lg font-extrabold">{t('phone.title')}</h2>
      <p className="mb-4 text-sm text-ink-2">{t('phone.intro')}</p>

      {pwa.canInstall && (
        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <Button type="button" onClick={() => void installApp()}>
            {t('phone.install')}
          </Button>
          <span className="text-sm text-ink-3">{t('phone.install.hint')}</span>
        </div>
      )}

      {iosNeedsInstall ? (
        <IosSteps text={t('phone.ios')} />
      ) : push.status === 'unsupported' ? (
        <p className="text-sm text-ink-3">{t(isApp ? 'phone.push.unsupportedApp' : 'phone.push.unsupported')}</p>
      ) : push.status === 'denied' ? (
        <p className="text-sm font-semibold text-deal">{t('phone.push.denied')}</p>
      ) : push.status ? (
        <>
          <Toggle
            checked={push.status === 'on'}
            onChange={(v) => {
              setTest(null);
              push.change.mutate(v);
            }}
            label={t('phone.push')}
          />
          {push.change.isError && <p className="mt-1 text-sm font-semibold text-deal">{t('phone.push.error')}</p>}
          {push.status === 'on' && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" disabled={sample.isPending} onClick={() => sample.mutate()}>
                <BellIcon size={16} />
                {t('phone.push.test')}
              </Button>
              {test && (
                <span className={test === 'sent' ? 'text-sm text-ink-2' : 'text-sm font-semibold text-deal'}>
                  {t(test === 'sent' ? 'phone.push.testSent' : 'phone.push.testFailed')}
                </span>
              )}
            </div>
          )}
        </>
      ) : null}

      {push.devices > 0 && <p className="mt-3 text-sm text-ink-3">{tn('phone.push.devices', push.devices)}</p>}
      {pwa.standalone && !isApp && <p className="mt-1 text-sm text-ink-3">{t('phone.installed')}</p>}
    </section>
  );
}

const LATER_KEY = 'kl-push-later';
function laterUntil(): number {
  try {
    return Number(localStorage.getItem(LATER_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/** Watchlist page: a nudge to turn notifications on (or, on an iPhone, to add the site to the home screen first) */
export function PushPrompt() {
  const pwa = usePwa();
  const push = usePush();
  const [hidden, setHidden] = useState(() => laterUntil() > Date.now());
  const [done, setDone] = useState(false);
  const iosNeedsInstall = pwa.ios && !pwa.standalone && push.status === 'unsupported';
  if (done) {
    return <p className="mb-6 rounded-2xl bg-save-soft px-4 py-3 text-sm font-semibold text-save">{t('watch.push.done')}</p>;
  }
  if (hidden || !(push.status === 'off' || iosNeedsInstall)) return null;

  const later = () => {
    setHidden(true);
    try {
      // ask again in two weeks
      localStorage.setItem(LATER_KEY, String(Date.now() + 14 * 86_400_000));
    } catch {
      /* private mode: hidden until the page is reloaded */
    }
  };
  return (
    <div className="relative mb-6 rounded-3xl border border-line bg-surface p-5 sm:flex sm:items-center sm:gap-6 sm:p-6">
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-brand-ink sm:h-12 sm:w-12">
          <BellIcon size={22} />
        </div>
        <div className="min-w-0 flex-1 pr-6 sm:pr-0">
          <h2 className="font-extrabold">{t('watch.push.title')}</h2>
          <p className="mt-1 text-sm text-ink-2">{iosNeedsInstall ? t('watch.push.ios') : t('watch.push.text')}</p>
          {push.change.isError && <p className="mt-1 text-sm font-semibold text-deal">{t('phone.push.error')}</p>}
        </div>
      </div>
      {!iosNeedsInstall && (
        <div className="mt-4 flex items-center gap-2 whitespace-nowrap sm:mt-0 sm:shrink-0">
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            disabled={push.change.isPending}
            onClick={() => push.change.mutate(true, { onSuccess: (s) => s === 'on' && setDone(true) })}
          >
            {t('watch.push.enable')}
          </Button>
          <Button type="button" variant="ghost" onClick={later}>
            {t('watch.push.later')}
          </Button>
        </div>
      )}
      {iosNeedsInstall && (
        <button type="button" onClick={later} aria-label={t('watch.push.later')} className="absolute top-4 right-4 cursor-pointer rounded-full p-1 text-ink-3 hover:text-ink">
          <XIcon size={18} />
        </button>
      )}
    </div>
  );
}
