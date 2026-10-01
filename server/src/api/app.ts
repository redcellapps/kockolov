import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { type SessionUser, userFromRequest } from './auth.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { meRoutes } from './routes/me.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

const OPEN_PATHS = ['/api/auth/', '/api/health'];

export function webDistDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // server/src/api -> ../../../web/dist  |  server/dist/api -> ../../../web/dist
  return path.resolve(here, '..', '..', '..', 'web', 'dist');
}

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? { level: config.isProd ? 'info' : 'warn' },
    trustProxy: true,
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

  const dist = webDistDir();
  if (existsSync(dist)) {
    await app.register(fastifyStatic, {
      root: dist,
      wildcard: false,
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
    // SPA fallback: every non-API route renders index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Nije pronađeno.' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }
  return app;
}
