import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { one, query } from '../../db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const site = () => config.APP_URL.replace(/\/$/, '');

/** Unsubscribe links from the morning e-mail, robots.txt and the sitemap. No login needed. */
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

  app.get('/sitemap.xml', async (_req, reply) => {
    if (!config.PUBLIC_MODE) return reply.code(404).send('');
    const sets = await query<{ set_num: string; updated: string }>(
      `SELECT o.set_num, to_char(max(o.price_changed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS updated
         FROM offers o WHERE o.set_num IS NOT NULL AND o.active
        GROUP BY o.set_num ORDER BY o.set_num`,
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
      ...sets.map((s) => url(`/set/${encodeURIComponent(s.set_num)}`, s.updated)),
      '</urlset>',
    ].join('\n');
    return reply.type('application/xml; charset=utf-8').header('Cache-Control', 'public, max-age=3600').send(body);
  });
}
