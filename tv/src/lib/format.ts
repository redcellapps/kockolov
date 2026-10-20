import { t, tn } from '../i18n'

/** 4792 → "4.792" (no Intl: old TV browsers ship a trimmed ICU) */
export function num(n: number): string {
  const sign = n < 0 ? '−' : ''
  const digits = String(Math.round(Math.abs(n)))
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i
    out += digits[i]
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += '.'
  }
  return sign + out
}

/** 4792 → "4.792 RSD"; null → "—" */
export function rsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${num(n)} RSD`
}

// ---- display currency: prices are stored in RSD; a signed-in account may read them in EUR ----
let display: { currency: 'RSD' | 'EUR'; rate: number } = { currency: 'RSD', rate: 1 }

/** Set after sign-in from the account's setting and today's NBS rate (RSD for 1 EUR) */
export function setDisplayCurrency(currency: 'RSD' | 'EUR', rate: number): void {
  display = currency === 'EUR' && rate > 0 ? { currency, rate } : { currency: 'RSD', rate: 1 }
}
export const displayCurrency = () => display.currency

/** "62,45 €" from an RSD amount (comma decimal, like the site) */
export function eur(rsdAmount: number): string {
  const v = rsdAmount / display.rate
  const whole = Math.floor(v)
  const cents = Math.round((v - whole) * 100)
  const c = cents === 100 ? 0 : cents
  return `${num(cents === 100 ? whole + 1 : whole)},${c < 10 ? '0' : ''}${c} €`
}

/** An RSD amount in the reader's currency: "7.319 RSD" or "62,45 €" */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return display.currency === 'EUR' ? eur(n) : rsd(n)
}

/** Bare number in the reader's currency, for chart axes: "7.319" or "62" */
export function moneyNum(n: number): string {
  return display.currency === 'EUR' ? num(Math.round(n / display.rate)) : num(n)
}

/** Percentage below the reference price, rounded: (7799, 5752) → 26; 0 when not cheaper or no reference */
export function discountPct(reference: number | null | undefined, price: number | null | undefined): number {
  if (!reference || !price || price >= reference) return 0
  return Math.round((100 * (reference - price)) / reference)
}

/** "Ušteda 2.047 RSD (26%)" for the home hero, or '' when there is no saving */
export function savingText(reference: number | null | undefined, price: number | null | undefined): string {
  const pct = discountPct(reference, price)
  if (!pct || !reference || !price) return ''
  return t('home.top.saving', { amount: money(reference - price), pct })
}

/** "danas" / "juče" / "pre 3 dana" for an ISO timestamp, relative to now */
export function relativeDay(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—'
  const then = new Date(iso)
  if (isNaN(then.getTime())) return '—'
  const dayMs = 86400000
  const a = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / dayMs)
  const b = Math.floor((then.getTime() - then.getTimezoneOffset() * 60000) / dayMs)
  const d = a - b
  if (d <= 0) return t('common.today')
  if (d === 1) return t('common.yesterday')
  return tn('common.daysAgo', d)
}

/** "19.10." style short date for chart axes */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}.${d.getMonth() + 1}.`
}

/** Cuts a long title so it fits a card: "Avanture sa interaktivnom LEGO® Breskvicom™" → "Avanture sa interaktivnom…" */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '…'
}
