import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { BLOG_DIR, getPost, listPosts, summary } from '../../blog/posts.js';
import { cached, renderBlogCard } from '../../seo/og.js';
import { version } from '../../seo/pages.js';

/** "2. oktobar 2026." */
export const blogDate = (d: string) =>
  new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Blog posts (public), their pictures and their link-preview cards */
export async function blogRoutes(app: FastifyInstance) {
  app.get('/api/blog', async () => ({ items: (await listPosts()).map(summary) }));

  app.get<{ Params: { slug: string } }>('/api/blog/:slug', async (req, reply) => {
    const post = await getPost(req.params.slug);
    if (!post) return reply.code(404).send({ error: 'Tekst nije pronađen.' });
    const { text: _t, ...rest } = post;
    return rest;
  });

  app.get<{ Params: { file: string } }>('/media/blog/:file', async (req, reply) => {
    const file = req.params.file;
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type || !/^[a-z0-9-]+\.[a-z]+$/.test(file)) return reply.code(404).send('');
    try {
      const buf = await readFile(path.join(BLOG_DIR, file));
      return reply.type(type).header('Cache-Control', 'public, max-age=604800').send(buf);
    } catch {
      return reply.code(404).send('');
    }
  });

  app.get<{ Params: { file: string } }>('/og/blog/:file', async (req, reply) => {
    const slug = req.params.file.endsWith('.jpg') ? req.params.file.slice(0, -4) : null;
    const post = config.PUBLIC_MODE && slug ? await getPost(slug) : null;
    if (!post) return reply.code(404).send('');
    const card = {
      title: post.title,
      subtitle: post.description,
      byline: `${post.author} · ${blogDate(post.date)}`,
      imageFile: post.image ? path.join(BLOG_DIR, post.image.file) : null,
    };
    const jpg = await cached(`blog:${version(card)}`, () => renderBlogCard(card));
    return reply.type('image/jpeg').header('Cache-Control', 'public, max-age=86400').send(jpg);
  });
}
