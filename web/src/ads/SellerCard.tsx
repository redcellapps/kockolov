import { useState } from 'react';
import { Button, cx } from '../components/ui';
import { t } from '../i18n';
import { getPhone, setPhone, setSeller, useSeller } from './store';

const input = 'h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] outline-none focus:border-ink';

/** Account page block: seller type (private person or registered seller with fiscal receipts) and the phone shown on ads. Prototype: stored in this browser only. */
export function SellerCard() {
  const saved = useSeller();
  const [v, setV] = useState(getPhone());
  const [type, setType] = useState(saved.type);
  const [business, setBusiness] = useState(saved.business);
  const [fiscal, setFiscal] = useState(saved.fiscal);
  const [ok, setOk] = useState(false);
  const touch = () => setOk(false);
  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
      <h2 className="mb-1 text-lg font-extrabold">{t('ads.sellerInfo.title')}</h2>
      <p className="mb-4 text-sm text-ink-3">{t('ads.sellerInfo.text')}</p>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setPhone(v.trim());
          setSeller({ type, business: type === 'business' ? business.trim() : '', fiscal: type === 'business' && fiscal });
          setOk(true);
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('ads.new.phoneLabel')}</span>
          <input className={input} value={v} onChange={(e) => (setV(e.target.value), touch())} inputMode="tel" autoComplete="tel" placeholder="+381 6x xxx xxxx" />
        </label>
        <div>
          <span className="mb-2 block text-sm font-bold text-ink-2">{t('ads.sellerType.title')}</span>
          <div className="grid gap-2">
            {(['private', 'business'] as const).map((k) => (
              <label key={k} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold', type === k ? 'border-ink bg-surface-2' : 'border-line')}>
                <input type="radio" name="sellerType" checked={type === k} onChange={() => (setType(k), touch())} /> {t(`ads.sellerType.${k}`)}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">{t('ads.sellerType.hint')}</p>
        </div>
        {type === 'business' && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink-2">{t('ads.sellerType.name')}</span>
              <input className={input} value={business} onChange={(e) => (setBusiness(e.target.value), touch())} maxLength={80} />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={fiscal} onChange={(e) => (setFiscal(e.target.checked), touch())} /> {t('ads.sellerType.fiscal')}
            </label>
          </>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit">{t('ads.sellerInfo.save')}</Button>
          {ok && <span className="text-sm font-semibold text-save">{t('ads.sellerInfo.saved')}</span>}
        </div>
      </form>
    </section>
  );
}
