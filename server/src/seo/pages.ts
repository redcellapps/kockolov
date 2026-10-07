import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { latestDeals } from '../api/audience.js';
import { buildSearch } from '../api/search.js';
import { getPost, listPosts, type BlogPost } from '../blog/posts.js';
import { escapeHtml, rsd, shopLabel } from '../mail/format.js';
import { OG_HEIGHT, OG_WIDTH, plural } from './og.js';

/**
 * Server-side <head> for every page of the single-page app: title, description, canonical URL,
 * Open Graph / X tags (link previews in Viber, WhatsApp, Facebook…) and schema.org data for Google.
 * Crawlers and preview bots don't run JavaScript, so this has to be in the HTML itself.
 */

const NB = '\u00a0'; // keeps "3 prodavnice" on one line
const SITE = 'Kockolov';

export interface PageMeta {
  status: number;
  title: string;
  description: string;
  path: string;
  canonical?: string;
  robots?: string;
  image?: { url: string; alt: string };
  type?: 'website' | 'product' | 'article';
  product?: { price: number; availability: 'instock' | 'oos' };
  article?: { published: string; author: string };
  jsonLd?: object[];
}

const site = () => config.APP_URL.replace(/\/$/, '');
const abs = (p: string) => (p.startsWith('http') ? p : `${site()}${p}`);
const count = (n: number, one: string, few: string, many: string) =>
  `${new Intl.NumberFormat('sr-RS').format(n)}${NB}${plural(n, one, few, many)}`;
const sets = (n: number) => count(n, 'set', 'seta', 'setova');
/** "u 1 prodavnici", "u 3 prodavnice", "u 5 prodavnica" */
const inShops = (n: number) => count(n, 'prodavnici', 'prodavnice', 'prodavnica');
/** "iz 1 prodavnice", "iz 3 prodavnice", "iz 5 prodavnica" */
const fromShops = (n: number) => count(n, 'prodavnice', 'prodavnice', 'prodavnica');
/** "LEGO Store, Kockarium i Ananas" */
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} i ${names.at(-1)}` : (names[0] ?? ''));

// ---- data ----
export interface SetSeo {
  set_num: string;
  name: string;
  theme_slug: string | null;
  theme_name: string | null;
  image_url: string | null;
  rrp_rsd: number | null;
  best_price: number | null;
  best_shop: string | null;
  best_seller: string | null;
  max_price: number | null;
  any_price: number | null;
  offers_in_stock: number;
  shops_in_stock: number;
  /** other shops' photos of the set, for when its own picture can't be loaded */
  alt_images: string[];
}

export function loadSet(setNum: string): Promise<SetSeo | null> {
  return one<SetSeo>(
    `SELECT s.set_num, s.name, s.theme_slug, t.name AS theme_name, s.image_url, s.rrp_rsd,
            b.price_rsd AS best_price, b.shop_id AS best_shop, b.seller AS best_seller,
            a.max_price, a.any_price, coalesce(a.offers_in_stock, 0) AS offers_in_stock, coalesce(a.shops_in_stock, 0) AS shops_in_stock,
            array(
              SELECT o.image_url FROM offers o
               WHERE o.set_num = s.set_num AND o.active AND o.image_url IS NOT NULL AND o.image_url IS DISTINCT FROM s.image_url
               GROUP BY o.image_url
               ORDER BY min(CASE o.shop_id WHEN 'lstore' THEN 0 WHEN 'kockarium' THEN 1 WHEN 'ananas' THEN 2 ELSE 3 END), o.image_url
               LIMIT 4
            ) AS alt_images
       FROM sets s
       LEFT JOIN themes t ON t.slug = s.theme_slug
       LEFT JOIN LATERAL (
         SELECT price_rsd, shop_id, seller FROM public_offers o
          WHERE o.set_num = s.set_num AND o.active AND o.in_stock ORDER BY price_rsd LIMIT 1
       ) b ON true
       LEFT JOIN LATERAL (
         SELECT max(price_rsd) FILTER (WHERE in_stock) AS max_price, min(price_rsd) AS any_price,
                count(*) FILTER (WHERE in_stock)::int AS offers_in_stock,
                count(DISTINCT shop_id) FILTER (WHERE in_stock)::int AS shops_in_stock
           FROM public_offers o WHERE o.set_num = s.set_num AND o.active
       ) a ON true
      WHERE s.set_num = $1`,
    [setNum],
  );
}

export interface Collection {
  title: string;
  subtitle: string;
  items: { image_url: string | null; best_price: number | null }[];
}

async function siteStats() {
  return (await one<{ sets: number; shops: number; shop_names: string[]; deals: number; max_pct: number | null }>(
    `SELECT (SELECT count(DISTINCT set_num)::int FROM public_offers WHERE active AND in_stock AND set_num IS NOT NULL) AS sets,
            (SELECT count(*)::int FROM shops WHERE enabled AND NOT members_only) AS shops,
            (SELECT coalesce(array_agg(name ORDER BY kind = 'official' DESC, name), '{}') FROM shops WHERE enabled AND NOT members_only) AS shop_names,
            (SELECT count(*)::int FROM deals WHERE ${latestDeals('public')}) AS deals,
            (SELECT max(round(100.0 * (reference_price_rsd - best_price_rsd) / reference_price_rsd))::int
               FROM deals WHERE ${latestDeals('public')} AND reference_price_rsd > best_price_rsd) AS max_pct`,
  ))!;
}

async function topDeals(n: number) {
  return query<{ image_url: string | null; best_price: number | null }>(
    `SELECT s.image_url, d.best_price_rsd AS best_price FROM deals d JOIN sets s ON s.set_num = d.set_num
      WHERE ${latestDeals('public', 'd')} ORDER BY d.rank LIMIT $1`,
    [n],
  );
}

export async function loadCollection(kind: 'home' | 'deals' | 'theme', slug?: string): Promise<Collection | null> {
  if (kind === 'theme') {
    const theme = await one<{ name: string }>('SELECT name FROM themes WHERE slug = $1', [slug]);
    if (!theme) return null;
    const q = buildSearch({ themes: [slug!], stock: true, sort: 'deal', size: 3 });
    const rows = await query<{ image_url: string | null; best_price: number | null; total: number }>(q.sql, q.params);
    const agg = await one<{ min: number | null; n: number }>(
      `SELECT min(o.price_rsd) AS min, count(DISTINCT o.set_num)::int AS n
         FROM public_offers o JOIN sets s ON s.set_num = o.set_num
        WHERE s.theme_slug = $1 AND o.active AND o.in_stock`,
      [slug],
    );
    const n = agg?.n ?? 0;
    return {
      title: `LEGO ${theme.name}`,
      subtitle: n
        ? `${sets(n)} u ponudi, od ${rsd(agg!.min).replace(' ', NB)}. Uporedi cene i uštedi.`
        : 'Trenutno nema setova na stanju. Prati cene na Kockolovu.',
      items: rows,
    };
  }
  const st = await siteStats();
  const items = await topDeals(3);
  if (kind === 'deals') {
    return {
      title: 'LEGO ponude dana',
      subtitle: st.max_pct
        ? `${count(st.deals, 'najisplativija kupovina', 'najisplativije kupovine', 'najisplativijih kupovina')} danas, do${NB}−${st.max_pct}% u odnosu na LEGO® Store.`
        : 'Najisplativije LEGO kupovine u srpskim prodavnicama, svakog jutra.',
      items,
    };
  }
  return {
    title: 'Najbolje cene LEGO setova',
    subtitle: `Uporedi cene ${sets(st.sets)} u ${inShops(st.shops)} u Srbiji. Nove ponude svakog jutra.`,
    items,
  };
}

/** Changes whenever the picture would change, so preview caches pick up new prices. */
export const version = (...parts: unknown[]) =>
  createHash('sha1').update(JSON.stringify(parts)).digest('base64url').slice(0, 10);

// ---- pages ----
const DEFAULT: Omit<PageMeta, 'path'> = {
  status: 200,
  title: 'Kockolov — najbolje cene LEGO setova u Srbiji',
  description: 'Uporedi cene LEGO setova u srpskim prodavnicama i pronađi najbolju ponudu. Svakog jutra izdvajamo najisplativije kupovine.',
  type: 'website',
};

const PRIVATE_PATHS = ['/prijava', '/registracija', '/zaboravljena-lozinka', '/nalog', '/pracenje', '/admin'];
const PRIVATE_PREFIXES = ['/poziv/', '/potvrda/', '/odjava/'];

export async function pageMeta(rawPath: string, params: URLSearchParams): Promise<PageMeta> {
  const p = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  // closed testing: nothing gets indexed or previewed in detail
  if (!config.PUBLIC_MODE) return { ...DEFAULT, path: p, robots: 'noindex, nofollow' };

  if (PRIVATE_PATHS.includes(p) || PRIVATE_PREFIXES.some((x) => p.startsWith(x))) {
    return { ...DEFAULT, path: p, robots: 'noindex, follow' };
  }

  const setMatch = /^\/set\/([^/]+)$/.exec(p);
  if (setMatch) return setPage(decodeURIComponent(setMatch[1]));

  if (p === '/') {
    const st = await siteStats();
    const items = await topDeals(3);
    return {
      ...DEFAULT,
      path: '/',
      canonical: '/',
      description: `Uporedi cene ${sets(st.sets)} u ${inShops(st.shops)}: ${list(st.shop_names)}. Svakog jutra izdvajamo najisplativije kupovine i šaljemo ih e-mailom.`.replace(/\u00a0/g, ' '),
      image: { url: `/og/home.jpg?v=${version(st.sets, items[0]?.best_price, items[0]?.image_url)}`, alt: 'Kockolov: najbolje cene LEGO setova' },
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: `${site()}/`, inLanguage: 'sr-Latn' }],
    };
  }

  if (p === '/ponude') {
    const st = await siteStats();
    const items = await topDeals(1);
    // the day of the list itself (before the morning crawl that is still yesterday's)
    const latest = await one<{ day: string | null }>("SELECT max(day) AS day FROM deals WHERE audience = 'public'");
    const day = latest?.day
      ? new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${latest.day}T12:00:00Z`))
      : null;
    return {
      ...DEFAULT,
      path: p,
      canonical: p,
      title: day ? `LEGO ponude dana, ${day} | ${SITE}` : `LEGO ponude dana | ${SITE}`,
      description: st.max_pct
        ? `Najisplativije LEGO kupovine danas u srpskim prodavnicama: ${st.deals} ponuda, do −${st.max_pct}% u odnosu na LEGO Store. Lista se osvežava svakog jutra.`
        : 'Najisplativije LEGO kupovine u srpskim prodavnicama. Lista se osvežava svakog jutra.',
      image: { url: `/og/deals.jpg?v=${version(st.deals, st.max_pct, items[0]?.best_price)}`, alt: 'LEGO ponude dana na Kockolovu' },
    };
  }

  if (p === '/teme') {
    const top = await query<{ name: string }>(
      `SELECT t.name FROM themes t JOIN sets s ON s.theme_slug = t.slug JOIN public_offers o ON o.set_num = s.set_num
        WHERE o.active AND o.in_stock GROUP BY t.name, t.sort_order ORDER BY count(DISTINCT s.set_num) DESC, t.sort_order LIMIT 3`,
    );
    return {
      ...DEFAULT,
      path: p,
      canonical: p,
      title: top.length ? `LEGO teme: ${top.map((t) => t.name).join(', ')} i ostale | ${SITE}` : `LEGO teme | ${SITE}`,
      description: 'Sve LEGO teme na jednom mestu, sa brojem setova u ponudi i najnižim cenama u srpskim prodavnicama.',
    };
  }

  if (p === '/pretraga') {
    const keys = [...params.keys()];
    const theme = params.get('theme');
    if (theme && keys.every((k) => k === 'theme')) return themePage(theme);
    // free-text searches and filter combinations are endless: crawl them, don't index them
    return {
      ...DEFAULT,
      path: p,
      canonical: keys.length ? undefined : p,
      title: params.get('q') ? `„${params.get('q')}“: LEGO setovi i cene | ${SITE}` : `Svi LEGO setovi i cene | ${SITE}`,
      robots: keys.length ? 'noindex, follow' : undefined,
    };
  }

  if (p === '/blog') return blogIndex();
  const blogMatch = /^\/blog\/([a-z0-9-]+)$/.exec(p);
  if (blogMatch) return blogPost(blogMatch[1]);

  if (p === '/privatnost') {
    return { ...DEFAULT, path: p, canonical: p, title: `Politika privatnosti | ${SITE}`, description: 'Koje podatke Kockolov čuva, zašto i kako da ostvariš svoja prava.' };
  }

  // anything else: the app shows "not found", search engines get a real 404
  return { ...DEFAULT, status: 404, path: p, title: `Stranica nije pronađena | ${SITE}`, robots: 'noindex' };
}

const blogCard = (post: BlogPost) => ({
  url: `/og/blog/${post.slug}.jpg?v=${version(post.title, post.description, post.date, post.author, post.image?.file)}`,
  alt: post.title,
});

async function blogIndex(): Promise<PageMeta> {
  const posts = await listPosts();
  return {
    ...DEFAULT,
    path: '/blog',
    canonical: '/blog',
    title: `Blog | ${SITE}`,
    description: 'Priče iza Kockolova i saveti za pametniju kupovinu LEGO setova u Srbiji.',
    image: posts[0] ? blogCard(posts[0]) : undefined,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: `${SITE} blog`,
        url: `${site()}/blog`,
        inLanguage: 'sr-Latn',
        blogPost: posts.map((post) => ({ '@type': 'BlogPosting', headline: post.title, url: `${site()}/blog/${post.slug}`, datePublished: post.date })),
      },
    ],
  };
}

async function blogPost(slug: string): Promise<PageMeta> {
  const post = await getPost(slug);
  const path = `/blog/${slug}`;
  if (!post) return { ...DEFAULT, status: 404, path, title: `Tekst nije pronađen | ${SITE}`, robots: 'noindex' };
  return {
    status: 200,
    path,
    canonical: path,
    title: post.seoTitle,
    description: post.description,
    type: 'article',
    article: { published: post.date, author: post.author },
    image: blogCard(post),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Kockolov', item: `${site()}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${site()}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: `${site()}${path}` },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        author: { '@type': 'Person', name: post.author },
        publisher: { '@type': 'Organization', name: SITE, url: `${site()}/` },
        ...(post.image ? { image: [abs(post.image.url)] } : {}),
        mainEntityOfPage: `${site()}${path}`,
        inLanguage: 'sr-Latn',
        ...(post.keywords.length ? { keywords: post.keywords.join(', ') } : {}),
        wordCount: post.text.split(/\s+/).filter(Boolean).length,
        articleBody: post.text,
      },
    ],
  };
}

async function themePage(slug: string): Promise<PageMeta> {
  const c = await loadCollection('theme', slug);
  const path = `/pretraga?theme=${encodeURIComponent(slug)}`;
  if (!c) return { ...DEFAULT, status: 404, path, title: `Tema nije pronađena | ${SITE}`, robots: 'noindex' };
  const name = c.title.replace('LEGO ', '');
  const st = await siteStats();
  return {
    ...DEFAULT,
    path,
    canonical: path,
    title: `LEGO ${name} setovi: cene u Srbiji | ${SITE}`,
    description: `${c.subtitle} Svi LEGO ${name} setovi iz prodavnica ${list(st.shop_names)} na jednom mestu.`.replace(/\u00a0/g, ' '),
    image: { url: `/og/theme/${encodeURIComponent(slug)}.jpg?v=${version(c.subtitle, c.items[0]?.image_url)}`, alt: `LEGO ${name} na Kockolovu` },
  };
}

async function setPage(setNum: string): Promise<PageMeta> {
  const s = await loadSet(setNum);
  const path = `/set/${encodeURIComponent(setNum)}`;
  if (!s) return { ...DEFAULT, status: 404, path, title: `Set nije pronađen | ${SITE}`, robots: 'noindex' };

  const label = `LEGO ${s.set_num} ${s.name}`;
  const shop = s.best_shop ? shopLabel(s.best_shop, s.best_seller) : null;
  const saving = s.best_price && s.rrp_rsd && s.rrp_rsd > s.best_price ? s.rrp_rsd - s.best_price : 0;
  const pct = saving ? Math.round((100 * saving) / s.rrp_rsd!) : 0;
  const theme = s.theme_name ? `${s.theme_name} ` : '';

  const title = s.best_price ? `${label} – od ${rsd(s.best_price)} | ${SITE}` : `${label}: cena i dostupnost | ${SITE}`;
  const description = s.best_price
    ? `Uporedi cene za LEGO ${theme}${s.set_num} ${s.name}. Najjeftinije danas: ${rsd(s.best_price)} (${shop})` +
      (pct >= 3 ? `, ${pct}% manje nego u LEGO Store-u.` : '.') +
      ` Cene iz ${fromShops(Math.max(s.shops_in_stock, 1)).replace(NB, ' ')} i istorija cena.`
    : `LEGO ${theme}${s.set_num} ${s.name} trenutno nije na stanju u srpskim prodavnicama. Prati set na Kockolovu i saznaj kad se pojavi i po kojoj ceni.`;

  const jsonLd: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Kockolov', item: `${site()}/` },
        ...(s.theme_slug && s.theme_name
          ? [{ '@type': 'ListItem', position: 2, name: `LEGO ${s.theme_name}`, item: `${site()}/pretraga?theme=${encodeURIComponent(s.theme_slug)}` }]
          : []),
        { '@type': 'ListItem', position: s.theme_slug ? 3 : 2, name: label, item: `${site()}${path}` },
      ],
    },
  ];
  const offerPrice = s.best_price ?? s.any_price;
  if (offerPrice) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `LEGO® ${s.theme_name ? `${s.theme_name} ` : ''}${s.name} ${s.set_num}`,
      sku: s.set_num,
      mpn: s.set_num,
      brand: { '@type': 'Brand', name: 'LEGO' },
      ...(s.image_url ? { image: [abs(s.image_url)] } : {}),
      ...(s.theme_name ? { category: s.theme_name } : {}),
      url: `${site()}${path}`,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'RSD',
        lowPrice: offerPrice,
        highPrice: s.best_price ? (s.max_price ?? s.best_price) : offerPrice,
        offerCount: Math.max(s.offers_in_stock, 1),
        availability: s.best_price ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
    });
  }

  return {
    status: 200,
    path,
    canonical: path,
    title,
    description,
    type: 'product',
    product: offerPrice ? { price: offerPrice, availability: s.best_price ? 'instock' : 'oos' } : undefined,
    image: {
      url: `/og/set/${encodeURIComponent(s.set_num)}.jpg?v=${version(s.best_price, s.rrp_rsd, s.shops_in_stock, s.image_url)}`,
      alt: s.best_price ? `${label}, ${rsd(s.best_price)}` : label,
    },
    jsonLd,
  };
}

// ---- HTML ----
const attr = (s: string) => escapeHtml(s);
/** JSON inside <script>: "<" can't close the tag */
const json = (o: object) => JSON.stringify(o).replace(/</g, '\\u003c');

/** Replaces the template's title and description and adds the rest before </head>. */
export function injectHead(template: string, m: PageMeta): string {
  // og:title without the site name: the preview shows the site separately
  const ogTitle = m.title.replace(/ \| Kockolov$/, '');
  const url = m.canonical ? abs(m.canonical) : abs(m.path);
  // pages without their own picture share the home one (none at all while the site is private)
  const own = m.image ?? (config.PUBLIC_MODE ? { url: '/og/home.jpg', alt: 'Kockolov: najbolje cene LEGO setova' } : null);
  const image = own && { url: abs(own.url), alt: own.alt };
  const tags = [
    m.canonical ? `<link rel="canonical" href="${attr(abs(m.canonical))}" />` : '',
    m.robots ? `<meta name="robots" content="${attr(m.robots)}" />` : '',
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:locale" content="sr_RS" />`,
    `<meta property="og:type" content="${m.type ?? 'website'}" />`,
    `<meta property="og:title" content="${attr(ogTitle)}" />`,
    `<meta property="og:description" content="${attr(m.description)}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    ...(image
      ? [
          `<meta property="og:image" content="${attr(image.url)}" />`,
          `<meta property="og:image:type" content="image/jpeg" />`,
          `<meta property="og:image:width" content="${OG_WIDTH}" />`,
          `<meta property="og:image:height" content="${OG_HEIGHT}" />`,
          `<meta property="og:image:alt" content="${attr(image.alt)}" />`,
        ]
      : []),
    ...(m.product
      ? [
          `<meta property="product:price:amount" content="${m.product.price}" />`,
          `<meta property="product:price:currency" content="RSD" />`,
          `<meta property="product:availability" content="${m.product.availability === 'instock' ? 'in stock' : 'out of stock'}" />`,
        ]
      : []),
    ...(m.article
      ? [
          `<meta property="article:published_time" content="${attr(m.article.published)}" />`,
          `<meta property="article:author" content="${attr(m.article.author)}" />`,
        ]
      : []),
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${attr(ogTitle)}" />`,
    `<meta name="twitter:description" content="${attr(m.description)}" />`,
    image ? `<meta name="twitter:image" content="${attr(image.url)}" />` : '',
    ...(m.jsonLd ?? []).map((o) => `<script type="application/ld+json">${json(o)}</script>`),
  ].filter(Boolean);

  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(m.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${attr(m.description)}" />`)
    .replace(/\s*<\/head>/, `\n    ${tags.join('\n    ')}\n  </head>`);
}
