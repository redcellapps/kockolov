import { sr, type Key } from './sr'

type Vars = Record<string, string | number>

const dict: Record<string, string> = sr

/** t('set.number', { num: '75192' }) → "Set 75192" */
export function t(key: Key, vars?: Vars): string {
  let s = dict[key] ?? key
  if (vars) {
    for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]))
  }
  return s
}

/** Serbian plural: 1 ponuda, 2–4 ponude, 5+ ponuda (21 ponuda, 22 ponude, 11 ponuda…) */
export function pluralForm(n: number): 'one' | 'few' | 'other' {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'one'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few'
  return 'other'
}

/** tn('card.offers', 3) → "3 ponude" — picks key.one / key.few / key.other */
export function tn(base: string, n: number, vars?: Vars): string {
  return t(`${base}.${pluralForm(n)}` as Key, { n, ...vars })
}
