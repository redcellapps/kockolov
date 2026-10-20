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

/** Percentage below the reference price, rounded: (7799, 5752) → 26; 0 when not cheaper or no reference */
export function discountPct(reference: number | null | undefined, price: number | null | undefined): number {
  if (!reference || !price || price >= reference) return 0
  return Math.round((100 * (reference - price)) / reference)
}

/** "Ušteda 2.047 RSD (26%)" for the home hero, or '' when there is no saving */
export function savingText(reference: number | null | undefined, price: number | null | undefined): string {
  const pct = discountPct(reference, price)
  if (!pct || !reference || !price) return ''
  return t('home.top.saving', { amount: rsd(reference - price), pct })
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
