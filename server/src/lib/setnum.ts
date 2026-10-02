// Extract official LEGO set numbers from SKUs and product titles.

/**
 * SKU that is a set number: "75192" -> "75192".
 * Shops mark variants with a suffix — Kockarium sells single collectible minifigures as
 * "71051-7" and a blind box as "71053-X". Those are different products from the set "71051",
 * so the suffix is kept and they become their own entries.
 */
export function setNumFromSku(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const m = sku.trim().match(/^(\d{4,6})(-[0-9A-Za-z]{1,3})?$/);
  if (!m) return null;
  return m[2] ? `${m[1]}${m[2].toUpperCase()}` : m[1];
}

const YEAR_RE = /^(19[89]\d|20[0-4]\d)$/;

/**
 * Find the set number in a free-text title.
 * "LEGO Botanicals Mini orhideja 10343, Uzrast 18+" -> "10343"
 * "LEGO Friends božićni kalendar za 2026. godinu 42698" -> "42698"
 * Ignores years, piece counts ("790 delova") and ages.
 * `known` (optional) is used to break ties between several candidates.
 */
export function setNumFromTitle(title: string, known?: (n: string) => boolean): string | null {
  if (!title) return null;
  const candidates: { num: string; score: number }[] = [];
  const re = /(?<![\d.,])(\d{4,6})(?![\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title))) {
    const num = m[1];
    const after = title.slice(m.index + num.length, m.index + num.length + 12).toLowerCase();
    const before = title.slice(Math.max(0, m.index - 6), m.index).toLowerCase();
    // piece counts / quantities
    if (/^\s*(delova|dela|komada|kom\b|pcs|pieces|elemenata|kockica)/.test(after)) continue;
    // "za 2026. godinu", "2025." -> a year
    if (YEAR_RE.test(num) && (/^\s*\./.test(after) || /^\s*god/.test(after) || /(za|iz|od)\s*$/.test(before))) continue;
    let score = 0;
    if (num.length === 5) score += 3;
    else if (num.length === 6) score += 1;
    else if (YEAR_RE.test(num)) score -= 2; // bare 4-digit years are unlikely set numbers
    if (/^\s*[,)\s]/.test(after) || after === '') score += 1;
    if (known?.(num)) score += 5;
    candidates.push({ num, score });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0].score < 0) return null;
  return candidates[0].num;
}

/** Remove brand noise, set number and age suffix from a marketplace title. */
export function cleanTitle(title: string, setNum?: string | null): string {
  let s = title;
  if (setNum) s = s.replace(new RegExp(`\\b${setNum}\\b`, 'g'), ' ');
  s = s.replace(/,?\s*uzrast\s*[\d.,]+\s*\+?/gi, ' ');
  s = s.replace(/\blego\b[®™]?/gi, ' ');
  s = s.replace(/\bkocke\b/gi, ' ');
  s = s.replace(/[®™]/g, '');
  s = s.replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ');
  return s.trim().replace(/^[,\-–:\s]+|[,\-–:\s]+$/g, '');
}

/** Age from text: "Uzrast 18+", "1.5+", "9+" -> number */
export function ageFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/uzrast\s*:?\s*(\d{1,2}(?:[.,]\d)?)\s*\+?/i) ?? text.match(/(?:^|\s)(\d{1,2}(?:[.,]5)?)\+(?:\s|$|,)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return n > 0 && n <= 18 ? n : null;
}
