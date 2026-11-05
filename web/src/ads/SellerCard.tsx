import { useState } from 'react';
import { Button } from '../components/ui';
import { t } from '../i18n';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useProfileMutation } from './store';

const input = 'h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] outline-none focus:border-ink';

/** Account page block: the phone buyers can reveal on your ads, and the e-mail when someone writes to you */
export function SellerCard() {
  const { user, listings } = useAuth();
  const save = useProfileMutation();
  const [v, setV] = useState(user?.phone ?? '');
  const [hide, setHide] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!listings || !user) return null;
  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
      <h2 className="mb-1 text-lg font-extrabold">{t('ads.sellerInfo.title')}</h2>
      <p className="mb-4 text-sm text-ink-3">{t('ads.sellerInfo.text')}</p>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          save.mutate({ phone: hide ? '' : v.trim() }, { onSuccess: () => setOk(true), onError: (x) => setErr(x instanceof ApiError ? x.message : t('ads.detail.errorGeneric')) });
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('ads.new.phoneLabel')}</span>
          <input className={input} value={hide ? '' : v} disabled={hide} onChange={(e) => (setV(e.target.value), setOk(false))} inputMode="tel" autoComplete="tel" placeholder="+381 6x xxx xxxx" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={hide} onChange={(e) => (setHide(e.target.checked), setOk(false))} /> {t('ads.new.phoneHidden')}
        </label>
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input type="checkbox" className="mt-1" checked={user.msg_email_enabled ?? true} onChange={(e) => save.mutate({ msgEmailEnabled: e.target.checked })} />
          <span>{t('msg.emailPref')}<span className="block text-xs font-normal text-ink-3">{t('msg.emailPrefHint')}</span></span>
        </label>
        {err && <p role="alert" className="rounded-xl bg-deal-soft px-3 py-2 text-sm font-semibold text-deal">{err}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>{t('ads.sellerInfo.save')}</Button>
          {ok && <span className="text-sm font-semibold text-save">{t('ads.sellerInfo.saved')}</span>}
        </div>
      </form>
    </section>
  );
}
