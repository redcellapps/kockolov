import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { type SessionUser, userFromRequest } from './auth.js';
import { adminRoutes } from './routes/admin.js';
import { blogRoutes } from './routes/blog.js';
import { publicRoutes } from './routes/public.js';
import { injectHead, pageMeta } from '../seo/pages.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { meRoutes } from './routes/me.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

const OPEN_PATHS = ['/api/auth/', '/api/health', '/api/unsubscribe/'];

export function webDistDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // server/src/api -> ../../../web/dist  |  server/dist/api -> ../../../web/dist
  return path.resolve(here, '..', '..', '..', 'web', 'dist');
}

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? { level: config.isProd ? 'info' : 'warn' },
    // one reverse proxy (nginx/Caddy) in front: the client IP is the last X-Forwarded-For entry
    trustProxy: (_addr: string, hop: number) => hop === 0,
  });
  await app.register(cookie);
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    req.user = await userFromRequest(req);
    const open = OPEN_PATHS.some((p) => req.url.startsWith(p));
    if (!config.PUBLIC_MODE && !open && !req.user) {
      return reply.code(401).send({ error: 'Potrebna je prijava.' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Neispravni parametri.', details: err.issues });
    req.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: status >= 500 ? 'Greška na serveru.' : (err as Error).message });
  });

  app.get('/api/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });

  await app.register(authRoutes);
  await app.register(catalogRoutes);
  await app.register(meRoutes);
  await app.register(adminRoutes);
  await app.register(publicRoutes);
  await app.register(blogRoutes);

  const dist = webDistDir();
  if (existsSync(dist)) {
    await app.register(fastifyStatic, {
      root: dist,
      wildcard: false,
      // every page, including /, goes through the not-found handler below to get its own <head>
      index: false,
      allowedPath: (pathName) => pathName !== '/index.html',
      cacheControl: false,
      // index.html must be re-checked on every visit, or browsers keep an old version after a deploy;
      // files in assets/ have a content hash in their name and never change
      setHeaders(res, filePath) {
        const file = path.basename(filePath);
        if (file === 'index.html') res.setHeader('Cache-Control', 'no-cache');
        else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    });
    // SPA fallback: every non-API route renders index.html, with a <head> made for that page
    // (title, description, link-preview tags, structured data) and a real 404 for unknown pages
    const template = readFileSync(path.join(dist, 'index.html'), 'utf8');
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Nije pronađeno.' });
      const url = new URL(req.url, 'http://local');
      let html = template;
      let status = 200;
      try {
        const meta = await pageMeta(url.pathname, url.searchParams);
        html = injectHead(template, meta);
        status = meta.status;
      } catch (err) {
        req.log.error(err, 'page meta failed');
      }
      return reply.code(status).header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(html);
    });
  }
  return app;
}
