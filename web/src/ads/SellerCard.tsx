import { useState } from 'react';
import { Button } from '../components/ui';
import { t } from '../i18n';
import { getPhone, setPhone } from './store';

/** Account page block: the phone buyers can reveal on your ads (prototype: stored in this browser only) */
export function SellerCard() {
  const [v, setV] = useState(getPhone());
  const [ok, setOk] = useState(false);
  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
      <h2 className="mb-1 text-lg font-extrabold">{t('ads.sellerInfo.title')}</h2>
      <p className="mb-4 text-sm text-ink-3">{t('ads.sellerInfo.text')}</p>
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), setPhone(v.trim()), setOk(true))}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('ads.new.phoneLabel')}</span>
          <input className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] outline-none focus:border-ink" value={v} onChange={(e) => (setV(e.target.value), setOk(false))} inputMode="tel" autoComplete="tel" placeholder="+381 6x xxx xxxx" />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit">{t('ads.sellerInfo.save')}</Button>
          {ok && <span className="text-sm font-semibold text-save">{t('ads.sellerInfo.saved')}</span>}
        </div>
      </form>
    </section>
  );
}
