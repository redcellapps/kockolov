import type { CrawlContext, PageResult, RawOffer } from '../types.js';

/**
 * Walks numbered listing pages until a page is missing (404), empty, or only repeats products
 * already seen (some shops keep serving their last page for any higher number).
 */
export async function* pageThrough(
  ctx: CrawlContext,
  urlFor: (page: number) => string,
  parse: (html: string) => RawOffer[],
): AsyncGenerator<PageResult> {
  const seen = new Set<string>();
  for (let page = 1; page <= ctx.maxPages; page++) {
    const res = await ctx.http.get(urlFor(page), { allow404: true });
    if (res.status === 404) return;
    const offers = parse(res.text).filter((o) => !seen.has(o.externalId));
    if (!offers.length) return;
    for (const o of offers) seen.add(o.externalId);
    yield { page, offers };
  }
}

export const absUrl = (base: string, href: string | undefined | null): string | null => {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

/** "LEGO® City" -> "City", "LEGO®  Marvel Super Hero ™" -> "Marvel Super Hero" */
export const themeFromCategory = (cat: string | null | undefined): string[] => {
  const t = (cat ?? '').replace(/lego/gi, '').replace(/[®™]/g, '').replace(/kocke/gi, '').replace(/\s+/g, ' ').trim();
  return t ? [t] : [];
};

/** The set number in a shop code like "LE42215" (Dexy, Kockalend, Tehnomanija). */
export const setNumFromLeCode = (code: string | null | undefined): string | null =>
  code?.trim().match(/^LE(\d{4,6})$/i)?.[1] ?? null;
