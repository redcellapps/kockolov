import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { one, query } from '../../db.js';
import { shopLabel } from '../../mail/format.js';
import { cached, renderCollectionCard, renderSetCard, type SetCard } from '../../seo/og.js';
import { loadCollection, loadSet, version } from '../../seo/pages.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const site = () => config.APP_URL.replace(/\/$/, '');

/** Unsubscribe links from the morning e-mail, robots.txt, the sitemap and link-preview images. No login needed. */
export async function publicRoutes(app: FastifyInstance) {
  // mail clients send the one-click unsubscribe (RFC 8058) as a form post
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  async function byToken(token: string) {
    if (!UUID.test(token)) return null;
    return one<{ id: number; email: string; digest_enabled: boolean }>(
      'SELECT id, email, digest_enabled FROM users WHERE unsubscribe_token = $1',
      [token],
    );
  }

  app.get<{ Params: { token: string } }>('/api/unsubscribe/:token', async (req, reply) => {
    const u = await byToken(req.params.token);
    if (!u) return reply.code(404).send({ error: 'Link za odjavu nije ispravan.' });
    return { email: u.email, digestEnabled: u.digest_enabled };
  });

  // POST without a body = the "Odjavi me" button or a mail client's one-click unsubscribe
  app.post<{ Params: { token: string }; Querystring: { on?: string } }>('/api/unsubscribe/:token', async (req, reply) => {
    const u = await byToken(req.params.token);
    if (!u) return reply.code(404).send({ error: 'Link za odjavu nije ispravan.' });
    const on = req.query.on === '1';
    await query('UPDATE users SET digest_enabled = $2 WHERE id = $1', [u.id, on]);
    return { ok: true, digestEnabled: on };
  });

  app.get('/robots.txt', async (_req, reply) => {
    reply.type('text/plain; charset=utf-8').header('Cache-Control', 'public, max-age=3600');
    if (!config.PUBLIC_MODE) return 'User-agent: *\nDisallow: /\n';
    return [
      'User-agent: *',
      'Disallow: /api/',
      'Disallow: /admin',
      'Disallow: /nalog',
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
  function sendJpeg(reply: import('fastify').FastifyReply, buf: Buffer) {
    return reply.type('image/jpeg').header('Cache-Control', 'public, max-age=86400').send(buf);
  }
  const jpgName = (file: string) => (file.endsWith('.jpg') ? decodeURIComponent(file.slice(0, -4)) : null);

  app.get<{ Params: { file: string } }>('/og/set/:file', async (req, reply) => {
    const setNum = jpgName(req.params.file);
    const s = config.PUBLIC_MODE && setNum ? await loadSet(setNum) : null;
    if (!s) return reply.code(404).send('');
    const card: SetCard = {
      setNum: s.set_num,
      name: s.name,
      theme: s.theme_name,
      imageUrl: s.image_url,
      bestPrice: s.best_price,
      refPrice: s.rrp_rsd,
      shopLabel: s.best_shop ? shopLabel(s.best_shop, s.best_seller) : null,
      shops: s.shops_in_stock,
    };
    return sendJpeg(reply, await cached(`set:${version(card)}`, () => renderSetCard(card)));
  });

  async function collection(reply: import('fastify').FastifyReply, kind: 'home' | 'deals' | 'theme', slug?: string) {
    const c = config.PUBLIC_MODE ? await loadCollection(kind, slug) : null;
    if (!c) return reply.code(404).send('');
    const card = { title: c.title, subtitle: c.subtitle, items: c.items.map((i) => ({ imageUrl: i.image_url, price: i.best_price })) };
    return sendJpeg(reply, await cached(`col:${version(card)}`, () => renderCollectionCard(card)));
  }
  app.get('/og/home.jpg', (_req, reply) => collection(reply, 'home'));
  app.get('/og/deals.jpg', (_req, reply) => collection(reply, 'deals'));
  app.get<{ Params: { file: string } }>('/og/theme/:file', (req, reply) => {
    const slug = jpgName(req.params.file);
    return slug ? collection(reply, 'theme', slug) : reply.code(404).send('');
  });

  app.get('/sitemap.xml', async (_req, reply) => {
    if (!config.PUBLIC_MODE) return reply.code(404).send('');
    const sets = await query<{ set_num: string; updated: string }>(
      `SELECT o.set_num, to_char(max(o.price_changed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS updated
         FROM public_offers o WHERE o.set_num IS NOT NULL AND o.active
        GROUP BY o.set_num ORDER BY o.set_num`,
    );
    const themes = await query<{ slug: string }>(
      `SELECT DISTINCT s.theme_slug AS slug FROM sets s JOIN public_offers o ON o.set_num = s.set_num
        WHERE s.theme_slug IS NOT NULL AND o.active AND o.in_stock ORDER BY 1`,
    );
    const url = (path: string, lastmod?: string) =>
      `<url><loc>${site()}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      url('/'),
      url('/ponude'),
      url('/teme'),
      url('/pretraga'),
      url('/privatnost'),
      ...themes.map((t) => url(`/pretraga?theme=${encodeURIComponent(t.slug)}`)),
      ...sets.map((s) => url(`/set/${encodeURIComponent(s.set_num)}`, s.updated)),
      '</urlset>',
    ].join('\n');
    return reply.type('application/xml; charset=utf-8').header('Cache-Control', 'public, max-age=3600').send(body);
  });
}
