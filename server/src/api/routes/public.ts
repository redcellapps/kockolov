import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../../config.js';
import { one, query } from '../../db.js';
import { firstPicture, renderCollectionCard, renderSetCard } from '../../seo/og.js';
import { keyPart, sendCard, setCardFor } from '../../seo/cards.js';
import { loadCollection, loadSet, version } from '../../seo/pages.js';
import { listPosts } from '../../blog/posts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const site = () => config.APP_URL.replace(/\/$/, '');

/** Unsubscribe links from the morning e-mail, robots.txt, the sitemap and link-preview images. No login needed. */
export async function publicRoutes(app: FastifyInstance) {
  // mail clients send the one-click unsubscribe (RFC 8058) as a form post
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  async function byToken(token: string) {
    if (!UUID.test(token)) return null;
    return one<{ id: number; email: string; digest_enabled: boolean; news_enabled: boolean }>(
      'SELECT id, email, digest_enabled, news_enabled FROM users WHERE unsubscribe_token = $1',
      [token],
    );
  }

  app.get<{ Params: { token: string } }>('/api/unsubscribe/:token', async (req, reply) => {
    const u = await byToken(req.params.token);
    if (!u) return reply.code(404).send({ error: 'Link za odjavu nije ispravan.' });
    return { email: u.email, digestEnabled: u.digest_enabled, newsEnabled: u.news_enabled };
  });

  // POST without a body = the "Odjavi me" button or a mail client's one-click unsubscribe;
  // ?list=news for the news e-mails, otherwise the morning digest
  app.post<{ Params: { token: string }; Querystring: { on?: string; list?: string } }>('/api/unsubscribe/:token', async (req, reply) => {
    const u = await byToken(req.params.token);
    if (!u) return reply.code(404).send({ error: 'Link za odjavu nije ispravan.' });
    const on = req.query.on === '1';
    if (req.query.list === 'news') {
      await query('UPDATE users SET news_enabled = $2 WHERE id = $1', [u.id, on]);
      return { ok: true, newsEnabled: on, digestEnabled: u.digest_enabled };
    }
    await query('UPDATE users SET digest_enabled = $2 WHERE id = $1', [u.id, on]);
    return { ok: true, digestEnabled: on, newsEnabled: u.news_enabled };
  });

  app.get('/robots.txt', async (_req, reply) => {
    reply.type('text/plain; charset=utf-8').header('Cache-Control', 'public, max-age=3600');
    if (!config.PUBLIC_MODE) return 'User-agent: *\nDisallow: /\n';
    return [
      'User-agent: *',
      'Disallow: /api/',
      'Disallow: /admin',
      'Disallow: /nalog',
      'Disallow: /tv',
      'Disallow: /pracenje',
      'Disallow: /poziv/',
      'Disallow: /potvrda/',
      'Disallow: /odjava/',
      '',
      `Sitemap: ${site()}/sitemap.xml`,
      '',
    ].join('\n');
  });

  // ---- link-preview images (1200×630 JPEG); the ?v= in the page's og:image changes with the content ----
  const jpgName = (file: string) => (file.endsWith('.jpg') ? decodeURIComponent(file.slice(0, -4)) : null);

  app.get<{ Params: { file: string } }>('/og/set/:file', async (req, reply) => {
    const setNum = jpgName(req.params.file);
    const s = config.PUBLIC_MODE && setNum ? await loadSet(setNum) : null;
    if (!s) return reply.code(404).send('');
    const { card, key, prefix, alternatives } = setCardFor(s);
    return sendCard(reply, key, prefix, () => renderSetCard(card, alternatives));
  });

  // ---- product pictures, squared on white and shrunk (the TV app's WebGL textures need a same-origin
  // picture with CORS headers, which the shops' CDNs don't send; the full-size photos are also too big
  // for a TV's memory). ?w= is one of the fixed sizes so the disk cache (OG_CACHE_DIR/pics) stays small. ----
  const PICTURE_SIZES = [160, 320, 640];
  app.get<{ Params: { file: string }; Querystring: { w?: string } }>('/media/set/:file', async (req, reply) => {
    const setNum = jpgName(req.params.file);
    const w = Number(req.query.w) || 320;
    if (!setNum || !PICTURE_SIZES.includes(w)) return reply.code(404).send('');
    const s = await loadSet(setNum);
    const pic = s ? await firstPicture([s.image_url, ...s.alt_images], w) : null;
    if (!pic) return reply.code(404).send('');
    const buf = Buffer.from(pic.slice(pic.indexOf(',') + 1), 'base64');
    return reply.type('image/jpeg').header('Cache-Control', 'public, max-age=86400').send(buf);
  });

  async function collection(reply: import('fastify').FastifyReply, kind: 'home' | 'deals' | 'theme', slug?: string) {
    const c = config.PUBLIC_MODE ? await loadCollection(kind, slug) : null;
    if (!c) return reply.code(404).send('');
    const card = { title: c.title, subtitle: c.subtitle, items: c.items.map((i) => ({ imageUrl: i.image_url, price: i.best_price })) };
    const prefix = `col-${kind}${slug ? `_${keyPart(slug)}` : ''}-`;
    return sendCard(reply, `${prefix}${version(card)}`, prefix, () => renderCollectionCard(card));
  }
  app.get('/og/home.jpg', (_req, reply) => collection(reply, 'home'));
  app.get('/og/deals.jpg', (_req, reply) => collection(reply, 'deals'));
  app.get<{ Params: { file: string } }>('/og/theme/:file', (req, reply) => {
    const slug = jpgName(req.params.file);
    return slug ? collection(reply, 'theme', slug) : reply.code(404).send('');
  });

  // one index and three sitemaps: pages and themes, sets in stock, sets out of stock; Search Console
  // then shows for each group how many URLs Google has taken in
  const xml = (reply: FastifyReply, urls: string[]) =>
    reply
      .type('application/xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>'].join('\n'));
  const url = (path: string, lastmod?: string) =>
    `<url><loc>${site()}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  const setUrls = async (inStock: boolean) =>
    (
      await query<{ set_num: string; updated: string }>(
        `SELECT o.set_num, to_char(max(o.price_changed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS updated
           FROM public_offers o WHERE o.set_num IS NOT NULL AND o.active
          GROUP BY o.set_num
         HAVING bool_or(o.in_stock) = $1 ORDER BY o.set_num`,
        [inStock],
      )
    ).map((r) => url(`/set/${encodeURIComponent(r.set_num)}`, r.updated));

  app.get('/sitemap.xml', async (_req, reply) => {
    if (!config.PUBLIC_MODE) return reply.code(404).send('');
    const today = new Date().toISOString().slice(0, 10);
    const entries = ['pages', 'sets', 'sets-oos'].map((n) => `<sitemap><loc>${site()}/sitemap-${n}.xml</loc><lastmod>${today}</lastmod></sitemap>`);
    return reply
      .type('application/xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...entries, '</sitemapindex>'].join('\n'));
  });

  app.get('/sitemap-pages.xml', async (_req, reply) => {
    if (!config.PUBLIC_MODE) return reply.code(404).send('');
    const themes = await query<{ slug: string }>(
      `SELECT DISTINCT s.theme_slug AS slug FROM sets s JOIN public_offers o ON o.set_num = s.set_num
        WHERE s.theme_slug IS NOT NULL AND o.active AND o.in_stock ORDER BY 1`,
    );
    const posts = await listPosts();
    return xml(reply, [
      url('/'),
      url('/ponude'),
      url('/teme'),
      url('/pretraga'),
      url('/privatnost'),
      url('/blog', posts[0]?.date),
      ...posts.map((post) => url(`/blog/${post.slug}`, post.date)),
      ...themes.map((t) => url(`/pretraga?theme=${encodeURIComponent(t.slug)}`)),
    ]);
  });

  app.get('/sitemap-sets.xml', async (_req, reply) => (config.PUBLIC_MODE ? xml(reply, await setUrls(true)) : reply.code(404).send('')));
  app.get('/sitemap-sets-oos.xml', async (_req, reply) => (config.PUBLIC_MODE ? xml(reply, await setUrls(false)) : reply.code(404).send('')));
}
