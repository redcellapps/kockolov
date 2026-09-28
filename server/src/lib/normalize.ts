// Text normalization shared by search and matching.
// "Hari Poter™ – Ministarstvo magije" -> "hari poter ministarstvo magije"
// Cyrillic input is transliterated, so "Хари Потер" finds the same sets.

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k',
  л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.toLowerCase();
  s = s.replace(/[Ѐ-ӿ]/g, (ch) => CYR[ch] ?? ch);
  s = s.replace(/đ/g, 'dj');
  // strip remaining diacritics (č ć š ž and friends)
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[®™©]/g, ' ');
  s = s.replace(/[^a-z0-9+]+/g, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

export function tokens(input: string): string[] {
  return normalizeText(input)
    .split(' ')
    .filter((t) => t.length > 0);
}

export function slugify(input: string): string {
  return normalizeText(input).replace(/\s+/g, '-');
}

/** "13.190,00 RSD" / "13190" / "13.190 RSD" / "51999.00" -> 13190 / 51999 */
export function parseRsd(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  let s = raw.replace(/ /g, ' ').replace(/rsd|din\.?|дин\.?/gi, '').trim();
  if (!s) return null;
  // Serbian format: thousands '.', decimals ','
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    // English format: thousands ',', decimals '.'
    s = s.replace(/,/g, '');
  }
  s = s.replace(/\s+/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}
