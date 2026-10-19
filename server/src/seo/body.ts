import { query } from '../db.js';
import { latestDeals } from '../api/audience.js';
import { buildSearch } from '../api/search.js';
import { escapeHtml as h, rsd, shopLabel } from '../mail/format.js';
import { plural } from './og.js';
import type { SetSeo } from './pages.js';

/**
 * Plain HTML of a page's main content, put inside <div id="root"> for crawlers. The app draws the same
 * content in the browser (createRoot replaces it), so visitors never see this copy; search engines
 * that read the HTML first get the prices, offers and links to other sets without waiting for JavaScript.
 */

const NB = ' ';
const price = (n: number | null | undefined) => rsd(n).replace(' ', NB);
const setLink = (num: string, name: string, best: number | null) =>
  `<li><a href="/set/${encodeURIComponent(num)}">LEGO ${h(num)} ${h(name)}</a>${best ? ` – od ${price(best)}` : ''}</li>`;

interface ListedSet {
  set_num: string;
  name: string;
  best_price: number | null;
}

/** Wraps the content so it is read by crawlers and screen readers but takes no room before the app starts. */
export function wrapBody(inner: string): string {
  return `<div data-ssr style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">${inner}</div>`;
}

const nav = `<nav><a href="/">Kockolov</a> <a href="/ponude">Ponude dana</a> <a href="/teme">Teme</a> <a href="/pretraga">Pretraga</a> <a href="/blog">Blog</a></nav>`;

async function themeList() {
  return query<{ slug: string; name: string; count: number }>(
    `SELECT t.slug, t.name, count(DISTINCT s.set_num)::int AS count
       FROM themes t JOIN sets s ON s.theme_slug = t.slug JOIN public_offers o ON o.set_num = s.set_num
      WHERE o.active AND o.in_stock GROUP BY t.slug, t.name, t.sort_order
      ORDER BY count(DISTINCT s.set_num) DESC, t.sort_order`,
  );
}

const themeLinks = (themes: { slug: string; name: string; count: number }[]) =>
  `<ul>${themes.map((t) => `<li><a href="/pretraga?theme=${encodeURIComponent(t.slug)}">LEGO ${h(t.name)}</a> (${t.count})</li>`).join('')}</ul>`;

async function dealList(n: number) {
  return query<ListedSet>(
    `SELECT s.set_num, s.name, d.best_price_rsd AS best_price FROM deals d JOIN sets s ON s.set_num = d.set_num
      WHERE ${latestDeals('public', 'd')} ORDER BY d.rank LIMIT $1`,
    [n],
  );
}

const setLinks = (rows: ListedSet[]) => `<ul>${rows.map((r) => setLink(r.set_num, r.name, r.best_price)).join('')}</ul>`;

export async function homeBody(): Promise<string> {
  const [deals, themes] = await Promise.all([dealList(12), themeList()]);
  return wrapBody(
    `${nav}<h1>Najbolje cene LEGO setova u Srbiji</h1>` +
      `<p>Kockolov svakog jutra poredi cene LEGO setova u srpskim prodavnicama i izdvaja najisplativije kupovine.</p>` +
      `<h2>Ponude dana</h2>${setLinks(deals)}<h2>LEGO teme</h2>${themeLinks(themes)}`,
  );
}

export async function dealsBody(): Promise<string> {
  const deals = await dealList(40);
  return wrapBody(`${nav}<h1>LEGO ponude dana</h1>${setLinks(deals)}`);
}

export async function themesBody(): Promise<string> {
  return wrapBody(`${nav}<h1>LEGO teme</h1>${themeLinks(await themeList())}`);
}

export async function themeBody(slug: string, name: string, subtitle: string): Promise<string> {
  const q = buildSearch({ themes: [slug], stock: true, sort: 'deal', size: 60 });
  const rows = await query<ListedSet>(q.sql, q.params);
  return wrapBody(
    `${nav}<h1>LEGO ${h(name)}</h1><p>${h(subtitle)}</p>${setLinks(rows)}` + `<p><a href="/teme">Sve LEGO teme</a></p>`,
  );
}

export async function setBody(s: SetSeo): Promise<string> {
  const offers = await query<{ shop_id: string; seller: string | null; price_rsd: number; regular_price_rsd: number | null }>(
    `SELECT shop_id, seller, price_rsd, regular_price_rsd FROM public_offers
      WHERE set_num = $1 AND active AND in_stock ORDER BY price_rsd, shop_id LIMIT 15`,
    [s.set_num],
  );
  let related: ListedSet[] = [];
  if (s.theme_slug) {
    const q = buildSearch({ themes: [s.theme_slug], stock: true, sort: 'deal', size: 13 });
    related = (await query<ListedSet>(q.sql, q.params)).filter((r) => r.set_num !== s.set_num).slice(0, 12);
  }
  const label = `LEGO ${s.set_num} ${s.name}`;
  const crumbs =
    `<a href="/">Kockolov</a>` +
    (s.theme_slug && s.theme_name ? ` › <a href="/pretraga?theme=${encodeURIComponent(s.theme_slug)}">LEGO ${h(s.theme_name)}</a>` : '');
  const saving = s.best_price && s.rrp_rsd && s.rrp_rsd > s.best_price ? s.rrp_rsd - s.best_price : 0;
  const summary = s.best_price
    ? `<p>Najniža cena: ${price(s.best_price)}${s.shops_in_stock ? `, ponude iz ${s.shops_in_stock}${NB}${plural(s.shops_in_stock, 'prodavnice', 'prodavnice', 'prodavnica')}` : ''}.` +
      (saving ? ` Cena u LEGO Store-u: ${price(s.rrp_rsd)}, ušteda ${price(saving)}.` : '') +
      `</p>`
    : `<p>Set trenutno nije na stanju u prodavnicama koje pratimo.</p>`;
  const table = offers.length
    ? `<h2>Sve ponude</h2><ul>${offers
        .map(
          (o) =>
            `<li>${h(shopLabel(o.shop_id, o.seller))}: ${price(o.price_rsd)}` +
            `${o.regular_price_rsd && o.regular_price_rsd > o.price_rsd ? ` (redovna cena ${price(o.regular_price_rsd)})` : ''}</li>`,
        )
        .join('')}</ul>`
    : '';
  const more = related.length ? `<h2>Slični LEGO ${h(s.theme_name ?? '')} setovi</h2>${setLinks(related)}` : '';
  return wrapBody(`${nav}<p>${crumbs}</p><h1>${h(label)}</h1>${summary}${table}${more}`);
}
