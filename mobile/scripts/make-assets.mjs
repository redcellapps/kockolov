// App icons, notification icon and splash screens for Android and iOS, drawn from the Kockolov mark
// (the same drawing as web/public/icons): node scripts/make-assets.mjs
import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android/app/src/main/res');
const ios = path.join(root, 'ios/App/App/Assets.xcassets');
const Y = '#ffcf00';
const INK = '#16150f';

// the mark spans x 4–60, y 10–60 of a 64 grid: centre (32, 35), width 56
const mark = (ink, lens) => `
  <rect x="4" y="18" width="48" height="36" rx="7" fill="${ink}"/>
  <rect x="12" y="10" width="12" height="10" rx="3" fill="${ink}"/>
  <rect x="32" y="10" width="12" height="10" rx="3" fill="${ink}"/>
  <circle cx="44" cy="44" r="12" fill="${lens}" stroke="${ink}" stroke-width="5"/>
  <path d="M52.5 52.5 L60 60" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;

// one colour, for Android's status bar (only the shape counts): the lens cut out of the brick
const markMono = (ink) => `
  <defs><mask id="lens"><rect width="64" height="64" fill="#fff"/><circle cx="44" cy="44" r="16.5" fill="#000"/></mask></defs>
  <g mask="url(#lens)">
    <rect x="4" y="18" width="48" height="36" rx="7" fill="${ink}"/>
    <rect x="12" y="10" width="12" height="10" rx="3" fill="${ink}"/>
    <rect x="32" y="10" width="12" height="10" rx="3" fill="${ink}"/>
  </g>
  <circle cx="44" cy="44" r="12" fill="none" stroke="${ink}" stroke-width="5"/>
  <path d="M52.5 52.5 L60 60" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;

/** w×h picture: background (or none, or a circle), the mark at `scale` of the shorter side, centred */
function svg(w, h, scale, { bg, circle, ink = INK, lens = '#ffffff', mono = false } = {}) {
  const m = (Math.min(w, h) * scale) / 56;
  const x = w / 2 - 32 * m;
  const y = h / 2 - 35 * m;
  const back = !bg ? '' : circle ? `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="${bg}"/>` : `<rect width="${w}" height="${h}" fill="${bg}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${back}
    <g transform="translate(${x} ${y}) scale(${m})">${mono ? markMono(ink) : mark(ink, lens)}</g></svg>`);
}

async function draw(file, w, h, scale, opts, { flatten = false } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  let img = sharp(svg(w, h, scale, opts));
  // App Store icons may not have transparency
  if (flatten) img = img.flatten({ background: opts.bg ?? '#ffffff' });
  await img.png().toFile(file);
  console.log(path.relative(root, file), `${w}×${h}`);
}

const size = async (file) => {
  const m = await sharp(file).metadata();
  return [m.width ?? 0, m.height ?? 0];
};

// ---- Android ----
if (existsSync(res)) {
  const dpi = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dpi)) {
    await draw(path.join(res, `mipmap-${d}/ic_launcher.png`), 48 * k, 48 * k, 0.62, { bg: Y });
    await draw(path.join(res, `mipmap-${d}/ic_launcher_round.png`), 48 * k, 48 * k, 0.56, { bg: Y, circle: true });
    // adaptive icon: 108 dp canvas, the launcher shows the middle 72 dp (and may cut it to a circle)
    await draw(path.join(res, `mipmap-${d}/ic_launcher_foreground.png`), 108 * k, 108 * k, 0.42, {});
    // status bar icon for notifications: only the shape counts, drawn white
    await draw(path.join(res, `drawable-${d}/ic_stat_kockolov.png`), 24 * k, 24 * k, 0.86, { ink: '#ffffff', mono: true });
  }
  // splash screens (older Android): every size the template ships
  for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
    const f = path.join(res, dir, 'splash.png');
    if (!existsSync(f) || !statSync(f).isFile()) continue;
    const [w, h] = await size(f);
    await draw(f, w, h, 0.34, { bg: Y });
  }
}

// ---- iOS ----
if (existsSync(ios)) {
  await draw(path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'), 1024, 1024, 0.62, { bg: Y }, { flatten: true });
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await draw(path.join(ios, 'Splash.imageset', f), 2732, 2732, 0.2, { bg: Y });
  }
}
