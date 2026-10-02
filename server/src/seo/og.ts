import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import sharp from 'sharp';
import { config } from '../config.js';
import { rsd } from '../mail/format.js';

/**
 * Link-preview images (Open Graph, 1200×630) for Viber, WhatsApp, Facebook, X and Google Discover.
 * Laid out with satori (text becomes vector paths, so no system fonts are needed) and rasterised
 * to JPEG with sharp, which keeps the file small enough for WhatsApp (< 300 KB).
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const C = {
  yellow: '#ffcf00',
  yellowDeep: '#f2b800',
  ink: '#16150f',
  muted: '#4a463c',
  paper: '#ffffff',
  red: '#c8131a',
};

// ---- fonts: Plus Jakarta Sans, the site's typeface (static TTFs with č ć š ž đ; OFL licence) ----
const fontDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');
const fonts = (
  [
    [500, 'Medium'],
    [700, 'Bold'],
    [800, 'ExtraBold'],
  ] as const
).map(([weight, file]) => ({
  name: 'Jakarta',
  weight,
  style: 'normal' as const,
  data: readFileSync(path.join(fontDir, `PlusJakartaSans-${file}.ttf`)),
}));

// ---- tiny element builder for satori ----
type Style = Record<string, string | number>;
interface El {
  type: string;
  props: Record<string, unknown>;
}
type Child = El | string | null | false;
function h(type: string, style: Style, ...children: Child[]): El {
  const kids = children.filter((c): c is El | string => !!c);
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
const img = (src: string, width: number, height: number, style: Style = {}): El => ({
  type: 'img',
  props: { src, width, height, style: { objectFit: 'contain', ...style } },
});

// Kockolov mark drawn for a yellow background: black brick, white magnifier
const MARK = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect x="4" y="18" width="48" height="36" rx="7" fill="${C.ink}"/>
    <rect x="12" y="10" width="12" height="10" rx="3" fill="${C.ink}"/>
    <rect x="32" y="10" width="12" height="10" rx="3" fill="${C.ink}"/>
    <circle cx="44" cy="44" r="12" fill="#ffffff" stroke="${C.ink}" stroke-width="5"/>
    <path d="M52.5 52.5 L60 60" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>
  </svg>`,
).toString('base64')}`;

// Stand-in when a shop's picture can't be loaded: a plain 2×2 brick
const BRICK = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">
    <rect x="10" y="40" width="180" height="110" rx="16" fill="${C.yellow}" stroke="${C.ink}" stroke-width="6"/>
    <rect x="38" y="14" width="44" height="30" rx="8" fill="${C.yellow}" stroke="${C.ink}" stroke-width="6"/>
    <rect x="118" y="14" width="44" height="30" rx="8" fill="${C.yellow}" stroke="${C.ink}" stroke-width="6"/>
  </svg>`,
).toString('base64')}`;

// ---- product pictures: fetched once, squared on white, kept in memory ----
const pictures = new Map<string, Promise<string | null>>();

async function fetchPicture(url: string): Promise<Buffer> {
  if (url.startsWith('/')) {
    // pictures served by the site itself (demo data)
    const { webDistDir } = await import('../api/app.js');
    const root = webDistDir();
    const file = path.resolve(root, `.${decodeURIComponent(url.split('?')[0])}`);
    if (!file.startsWith(root + path.sep)) throw new Error('outside dist');
    return readFile(file);
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': config.CRAWLER_USER_AGENT, Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) throw new Error('too large');
  return buf;
}

/** The picture as a square PNG data URI on white, or null when it can't be loaded. */
export function picture(url: string | null | undefined, size: number): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const key = `${size}|${url}`;
  let p = pictures.get(key);
  if (!p) {
    p = fetchPicture(url)
      .then((buf) =>
        sharp(buf, { density: 200 })
          .flatten({ background: '#ffffff' })
          .resize(size, size, { fit: 'contain', background: '#ffffff' })
          .png()
          .toBuffer(),
      )
      .then((png) => `data:image/png;base64,${png.toString('base64')}`)
      .catch(() => {
        pictures.delete(key); // try again next time
        return null;
      });
    if (pictures.size > 400) pictures.delete(pictures.keys().next().value!);
    pictures.set(key, p);
  }
  return p;
}

/** Serbian plural: 1 prodavnica, 2–4 prodavnice, 5+ prodavnica (21 prodavnica, 22 prodavnice…) */
export function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

// ---- shared pieces ----
function background(...children: Child[]): El {
  return h(
    'div',
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      position: 'relative',
      backgroundColor: C.yellow,
      backgroundImage: `radial-gradient(circle at 0% 0%, #ffe680 0%, rgba(255,230,128,0) 55%), radial-gradient(circle at 100% 100%, ${C.yellowDeep} 0%, rgba(242,184,0,0) 60%)`,
      fontFamily: 'Jakarta',
      color: C.ink,
    },
    ...children,
  );
}

function brand(size = 44): El {
  return h(
    'div',
    { alignItems: 'center', gap: 14 },
    img(MARK, size, size),
    h('div', { fontSize: Math.round(size * 0.72), fontWeight: 800, letterSpacing: -1 }, 'kockolov.rs'),
  );
}

/** A white tile with the black outline and hard shadow used for cards on the site. */
function tile(src: string | null, size: number, style: Style = {}): El {
  const pad = Math.round(size * 0.07);
  return h(
    'div',
    {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.paper,
      border: `5px solid ${C.ink}`,
      borderRadius: Math.round(size * 0.075),
      boxShadow: `12px 12px 0 ${C.ink}`,
      ...style,
    },
    src ? img(src, size - 2 * pad - 10, size - 2 * pad - 10) : img(BRICK, size * 0.5, size * 0.4),
  );
}

function render(el: El): Promise<Buffer> {
  return satori(el as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts })
    .then((svg) => sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer());
}

// ---- set card ----
export interface SetCard {
  setNum: string;
  name: string;
  theme: string | null;
  imageUrl: string | null;
  bestPrice: number | null;
  /** LEGO Store regular price, for the saving */
  refPrice: number | null;
  shopLabel: string | null;
  shops: number;
}

export async function renderSetCard(c: SetCard): Promise<Buffer> {
  const pic = await picture(c.imageUrl, 900);
  const saving = c.bestPrice && c.refPrice && c.refPrice > c.bestPrice ? c.refPrice - c.bestPrice : 0;
  const pct = saving && c.refPrice ? Math.round((100 * saving) / c.refPrice) : 0;
  const nameSize = c.name.length > 44 ? 44 : c.name.length > 26 ? 52 : 60;

  const price = c.bestPrice
    ? h(
        'div',
        { flexDirection: 'column' },
        h('div', { fontSize: 104, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }, rsd(c.bestPrice)),
        pct >= 3
          ? h(
              'div',
              { alignItems: 'center', gap: 14, marginTop: 18 },
              h(
                'div',
                { backgroundColor: C.red, color: '#fff', fontSize: 30, fontWeight: 800, padding: '6px 14px', borderRadius: 12 },
                `−${pct}%`,
              ),
              h(
                'div',
                { fontSize: 28, fontWeight: 500, color: C.muted, gap: 8 },
                h('span', { textDecoration: 'line-through' }, rsd(c.refPrice)),
                h('span', {}, 'u LEGO® Store-u'),
              ),
            )
          : c.shopLabel
            ? h('div', { fontSize: 28, fontWeight: 500, color: C.muted, marginTop: 18 }, `najjeftinije: ${c.shopLabel}`)
            : null,
      )
    : h(
        'div',
        { flexDirection: 'column' },
        h('div', { fontSize: 56, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }, 'Trenutno nije na stanju'),
        h('div', { fontSize: 28, fontWeight: 500, color: C.muted, marginTop: 14 }, 'Prati set i saznaj kad se pojavi.'),
      );

  return render(
    background(
      tile(pic, 510, { position: 'absolute', left: 56, top: 52 }),
      h(
        'div',
        { position: 'absolute', left: 626, top: 52, width: 518, height: 526, flexDirection: 'column' },
        h(
          'div',
          { alignItems: 'center', gap: 16 },
          h(
            'div',
            { backgroundColor: C.ink, color: C.yellow, fontSize: 26, fontWeight: 800, padding: '7px 16px', borderRadius: 999 },
            `LEGO® ${c.setNum}`,
          ),
          c.theme ? h('div', { fontSize: 26, fontWeight: 700, color: C.muted }, c.theme) : null,
        ),
        h(
          'div',
          { marginTop: 22, fontSize: nameSize, fontWeight: 800, lineHeight: 1.06, letterSpacing: -1.5, lineClamp: 3, display: 'block' },
          c.name,
        ),
        h('div', { flexGrow: 1 }),
        price,
        h(
          'div',
          { marginTop: 34, alignItems: 'center', justifyContent: 'space-between' },
          brand(40),
          c.shops > 1
            ? h('div', { fontSize: 24, fontWeight: 700, color: C.muted }, `cene iz ${c.shops} ${plural(c.shops, 'prodavnice', 'prodavnice', 'prodavnica')}`)
            : null,
        ),
      ),
    ),
  );
}

// ---- collection card (home, today's deals, a theme) ----
export interface CollectionCard {
  title: string;
  subtitle: string;
  items: { imageUrl: string | null; price: number | null }[];
}

export async function renderCollectionCard(c: CollectionCard): Promise<Buffer> {
  const items = c.items.slice(0, 3);
  const [front, ...back] = await Promise.all(items.map((i, n) => picture(i.imageUrl, n === 0 ? 640 : 480)));
  const titleSize = c.title.length > 34 ? 66 : c.title.length > 11 ? 78 : 92;
  // the first item in front with its price; up to two more peeking out behind it
  const behind = [
    { left: 652, top: 70, rotate: -10 },
    { left: 930, top: 92, rotate: 9 },
  ];
  return render(
    background(
      h(
        'div',
        { position: 'absolute', left: 72, top: 64, width: 560, height: 502, flexDirection: 'column' },
        brand(48),
        h(
          'div',
          { marginTop: 40, fontSize: titleSize, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, display: 'block', lineClamp: 3 },
          c.title,
        ),
        h(
          'div',
          { marginTop: 26, fontSize: 30, fontWeight: 500, lineHeight: 1.3, color: C.muted, display: 'block', lineClamp: 3 },
          c.subtitle,
        ),
      ),
      ...back.map((pic, i) =>
        h(
          'div',
          { position: 'absolute', left: behind[i].left, top: behind[i].top, transform: `rotate(${behind[i].rotate}deg)` },
          tile(pic, 230),
        ),
      ),
      items.length
        ? h(
            'div',
            { position: 'absolute', left: 760, top: 168, flexDirection: 'column', alignItems: 'center', transform: 'rotate(-2deg)' },
            tile(front, 330),
            items[0].price
              ? h(
                  'div',
                  {
                    marginTop: -28,
                    backgroundColor: C.ink,
                    color: C.yellow,
                    fontSize: 34,
                    fontWeight: 800,
                    padding: '10px 22px',
                    borderRadius: 999,
                    letterSpacing: -0.5,
                  },
                  rsd(items[0].price),
                )
              : null,
          )
        : null,
    ),
  );
}

// ---- blog post card: title on the left, the post's picture as a tilted print on the right ----
export interface BlogCard {
  title: string;
  /** the post's short description, under the title */
  subtitle: string;
  /** "Milan Đorđević · 2. oktobar 2026." */
  byline: string;
  /** the post's picture file on disk */
  imageFile: string | null;
}

export async function renderBlogCard(c: BlogCard): Promise<Buffer> {
  const W = 372;
  const H = 465;
  const photo = c.imageFile
    ? `data:image/jpeg;base64,${(await sharp(c.imageFile).resize(W * 2, H * 2, { fit: 'cover', position: 'top' }).jpeg({ quality: 82 }).toBuffer()).toString('base64')}`
    : null;
  const titleSize = c.title.length > 60 ? 52 : c.title.length > 40 ? 60 : 70;
  return render(
    background(
      h(
        'div',
        { position: 'absolute', left: 72, top: 64, width: photo ? 620 : 1056, height: 502, flexDirection: 'column' },
        h(
          'div',
          { alignItems: 'center', gap: 18 },
          brand(46),
          h('div', { backgroundColor: C.ink, color: C.yellow, fontSize: 24, fontWeight: 800, padding: '6px 16px', borderRadius: 999 }, 'BLOG'),
        ),
        h(
          'div',
          { marginTop: 38, fontSize: titleSize, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2.5, display: 'block', lineClamp: 4 },
          c.title,
        ),
        c.subtitle
          ? h('div', { marginTop: 22, fontSize: 25, fontWeight: 500, lineHeight: 1.35, color: C.muted, display: 'block', lineClamp: 4 }, c.subtitle)
          : null,
        h('div', { flexGrow: 1 }),
        h('div', { fontSize: 26, fontWeight: 700 }, c.byline),
      ),
      photo
        ? h(
            'div',
            {
              position: 'absolute',
              left: 752,
              top: 76,
              width: W + 10,
              height: H + 10,
              backgroundColor: C.paper,
              border: `5px solid ${C.ink}`,
              borderRadius: 26,
              boxShadow: `14px 14px 0 ${C.ink}`,
              overflow: 'hidden',
              transform: 'rotate(3deg)',
            },
            img(photo, W, H, { objectFit: 'cover' }),
          )
        : null,
    ),
  );
}

// ---- rendered images, kept in memory (the key changes whenever the content does) ----
const rendered = new Map<string, Promise<Buffer>>();
export function cached(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
  let p = rendered.get(key);
  if (!p) {
    p = make().catch((err) => {
      rendered.delete(key);
      throw err;
    });
    if (rendered.size > 300) rendered.delete(rendered.keys().next().value!);
    rendered.set(key, p);
  }
  return p;
}
