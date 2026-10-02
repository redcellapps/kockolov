import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import sharp from 'sharp';
import { escapeHtml } from '../mail/format.js';

// Blog posts are Markdown files in server/content/blog: "<slug>.md" with a short header
// (title, description, date, image…) between "---" lines, and the picture next to it.
// They are read once, at the first request, and served from memory.

export const BLOG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'blog');

export interface BlogImage {
  file: string;
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  /** <title> of the page (falls back to "<title> | Kockolov") */
  seoTitle: string;
  description: string;
  /** YYYY-MM-DD; a post dated in the future stays hidden until that day */
  date: string;
  author: string;
  keywords: string[];
  image: BlogImage | null;
  minutes: number;
  html: string;
  /** the article as plain text (structured data for search engines) */
  text: string;
}

export type BlogSummary = Omit<BlogPost, 'html' | 'text' | 'keywords'>;

const marked = new Marked({
  gfm: true,
  renderer: {
    // links to other sites open in a new tab; links inside Kockolov stay in the app
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href);
      return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}${external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
    },
  },
});

/** Splits the "---" header from the Markdown body. */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h\d|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** About 200 words a minute, at least one */
export const readingMinutes = (text: string) => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));

export async function parsePost(slug: string, raw: string, dir = BLOG_DIR): Promise<BlogPost> {
  const { meta, body } = parseFrontmatter(raw);
  if (!meta.title || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? '')) throw new Error(`blog/${slug}.md: title and date (YYYY-MM-DD) are required`);
  const html = await marked.parse(body);
  const text = htmlToText(html);
  let image: BlogImage | null = null;
  if (meta.image && existsSync(path.join(dir, meta.image))) {
    const info = await sharp(path.join(dir, meta.image)).metadata();
    image = { file: meta.image, url: `/media/blog/${meta.image}`, width: info.width ?? 0, height: info.height ?? 0, alt: meta.imageAlt ?? meta.title };
  }
  return {
    slug,
    title: meta.title,
    seoTitle: meta.seoTitle || `${meta.title} | Kockolov`,
    description: meta.description ?? '',
    date: meta.date,
    author: meta.author ?? 'Kockolov',
    keywords: (meta.keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean),
    image,
    minutes: readingMinutes(text),
    html,
    text,
  };
}

let loaded: Promise<BlogPost[]> | null = null;

async function loadAll(dir: string): Promise<BlogPost[]> {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => /^[a-z0-9-]+\.md$/.test(f));
  const posts = await Promise.all(files.map((f) => parsePost(f.slice(0, -3), readFileSync(path.join(dir, f), 'utf8'), dir)));
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/** Today in Belgrade, YYYY-MM-DD */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date());

/** Published posts, newest first */
export async function listPosts(): Promise<BlogPost[]> {
  loaded ??= loadAll(BLOG_DIR).catch((err) => {
    loaded = null;
    throw err;
  });
  const now = today();
  return (await loaded).filter((p) => p.date <= now);
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  return (await listPosts()).find((p) => p.slug === slug) ?? null;
}

export const summary = ({ html: _h, text: _t, keywords: _k, ...p }: BlogPost): BlogSummary => p;
