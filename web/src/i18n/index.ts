import { sr, type Dict } from './sr';

// Serbian is the only language for now; add `en` with the same keys and switch `current`.
const LOCALES: Record<string, { dict: Dict; plural: Intl.PluralRules }> = {
  sr: { dict: sr, plural: new Intl.PluralRules('sr-Latn') },
};
const current = LOCALES.sr;

export type TKey = keyof typeof sr;

function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function t(key: TKey, vars?: Record<string, string | number>): string {
  return fill(current.dict[key] ?? key, vars);
}

/** Plural-aware: tn('results.count', 5) looks up results.count.one / .few / .other */
export function tn(base: string, n: number, vars?: Record<string, string | number>): string {
  const cat = current.plural.select(n);
  const dict = current.dict as Record<string, string>;
  const s = dict[`${base}.${cat}`] ?? dict[`${base}.other`] ?? base;
  return fill(s, { n: new Intl.NumberFormat('sr-RS').format(n), ...vars });
}
