import { t, tn } from '../i18n';
import type { Reason } from './api';

const nf = new Intl.NumberFormat('sr-RS', { maximumFractionDigits: 0 });

export function rsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${nf.format(n)} RSD`;
}

// ---- display currency: prices are stored in RSD; signed-in users can read them in EUR ----
export type Currency = 'RSD' | 'EUR';
let display: { currency: Currency; rate: number } = { currency: 'RSD', rate: 1 };
const eurFmt = new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eurNum = new Intl.NumberFormat('sr-RS', { maximumFractionDigits: 0 });

/** Set by the auth provider from the user's setting and today's NBS rate (RSD for 1 EUR). */
export function setDisplayCurrency(currency: Currency, rate: number) {
  display = currency === 'EUR' && rate > 0 ? { currency, rate } : { currency: 'RSD', rate: 1 };
}
export const displayCurrency = (): Currency => display.currency;

/** An RSD amount in the reader's currency: "7.319 RSD" or "62,45 €". */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return display.currency === 'EUR' ? eurFmt.format(n / display.rate) : rsd(n);
}

/** Bare number in the reader's currency (chart axes): "7.319" or "62". */
export function moneyNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return display.currency === 'EUR' ? eurNum.format(n / display.rate) : nf.format(n);
}

/** "117,4991" → "117,50" */
export const rateText = (rate: number | undefined) => (rate ? new Intl.NumberFormat('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate) : '—');

/** Between RSD (what the API speaks) and the reader's currency, for price filters. */
export const toDisplay = (rsdAmount: number) => (display.currency === 'EUR' ? rsdAmount / display.rate : rsdAmount);
export const fromDisplay = (amount: number) => Math.round(display.currency === 'EUR' ? amount * display.rate : amount);

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return nf.format(n);
}

export const SHOPS: Record<string, { name: string; short: string; dot: string }> = {
  lstore: { name: 'LEGO® Store', short: 'LEGO Store', dot: '#ffcf00' },
  kockarium: { name: 'Kockarium', short: 'Kockarium', dot: '#2f6fdf' },
  ananas: { name: 'Ananas', short: 'Ananas', dot: '#19a35b' },
};

export function shopName(id: string | null | undefined): string {
  if (!id) return '';
  return SHOPS[id]?.name ?? id;
}

export function shopLabel(id: string | null | undefined, seller?: string | null): string {
  const n = shopName(id);
  return seller ? `${n} · ${seller}` : n;
}

/** "pre 3 sata", "juče", "pre 5 dana" */
export function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 90) return t('time.now');
  const min = Math.round(diff / 60);
  if (min < 60) return t('time.minutes', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return tn('time.hours', h);
  const d = Math.round(h / 24);
  if (d === 1) return t('time.yesterday');
  if (d < 30) return tn('time.days', d);
  return tn('time.months', Math.round(d / 30));
}

/** Serbian plural forms: 1 set, 2 seta, 5 setova */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function dateLong(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

export function dateShort(d: Date): string {
  return new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'short' }).format(d);
}

export function timeHM(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function ageLabel(age: number | null | undefined): string {
  if (!age) return '';
  return `${String(age).replace('.', ',')}+`;
}

export function reasonText(r: Reason): string {
  switch (r.type) {
    case 'vs_rrp':
      return t('reason.vs_rrp', { pct: r.pct });
    case 'vs_next':
      return t('reason.vs_next', { amount: money(r.amount) });
    case 'shop_sale':
      return t('reason.shop_sale', { pct: r.pct });
    case 'new_low':
      return t('reason.new_low');
    default:
      return '';
  }
}
