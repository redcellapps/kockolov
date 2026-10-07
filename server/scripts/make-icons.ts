// Draws the app icons (web/public/icons) from the Kockolov mark: npx tsx server/scripts/make-icons.ts
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'public', 'icons');
mkdirSync(out, { recursive: true });

// the mark's drawing spans x 4–60, y 10–60 of a 64 grid: centre (32, 35)
const mark = (ink: string, lens: string) => `
  <rect x="4" y="18" width="48" height="36" rx="7" fill="${ink}"/>
  <rect x="12" y="10" width="12" height="10" rx="3" fill="${ink}"/>
  <rect x="32" y="10" width="12" height="10" rx="3" fill="${ink}"/>
  <circle cx="44" cy="44" r="12" fill="${lens}" stroke="${ink}" stroke-width="5"/>
  <path d="M52.5 52.5 L60 60" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;

/** the mark at `scale` of the icon's width, centred, on yellow (or transparent) */
function svg(size: number, scale: number, opts: { bg?: string; ink?: string; lens?: string } = {}) {
  const m = (size * scale) / 56; // 56 = width of the drawing in grid units
  const x = size / 2 - 32 * m;
  const y = size / 2 - 35 * m;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${opts.bg ? `<rect width="${size}" height="${size}" fill="${opts.bg}"/>` : ''}
    <g transform="translate(${x} ${y}) scale(${m})">${mark(opts.ink ?? '#16150f', opts.lens ?? '#ffffff')}</g></svg>`);
}

const Y = '#ffcf00';
const icons: [string, number, number, Parameters<typeof svg>[2]][] = [
  ['icon-192.png', 192, 0.66, { bg: Y }],
  ['icon-512.png', 512, 0.66, { bg: Y }],
  // Android cuts maskable icons to a circle or squircle: keep the mark inside the middle 80 %
  ['icon-maskable-512.png', 512, 0.54, { bg: Y }],
  ['apple-touch-icon.png', 180, 0.64, { bg: Y }],
  // small notification icon: Android uses only its shape, drawn white
  ['badge-96.png', 96, 0.8, { ink: '#ffffff', lens: 'transparent' }],
];
for (const [name, size, scale, opts] of icons) {
  await sharp(svg(size, scale, opts)).png().toFile(path.join(out, name));
  console.log(name);
}
