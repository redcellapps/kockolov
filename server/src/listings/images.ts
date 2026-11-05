import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import sharp from 'sharp';
import { config } from '../config.js';

/** Every ad picture is this size (4:3): the whole photo fitted inside, over a blurred copy of itself. */
export const PHOTO_W = 1200;
export const PHOTO_H = 900;
/** What the upload may weigh before it is processed */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const fontDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');
let font: Buffer | null = null;
let mark: Buffer | null = null;

/** The "Kockolov" stamp for the bottom right corner (text drawn as vector paths by satori, so no system fonts are needed) */
async function stamp(): Promise<Buffer> {
  if (mark) return mark;
  font ??= readFileSync(path.join(fontDir, 'PlusJakartaSans-ExtraBold.ttf'));
  const box = (style: Record<string, unknown>) => ({ type: 'div', props: { style: { display: 'flex', ...style } } });
  const el = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 56,
        padding: '0 22px 0 19px',
        borderRadius: 28,
        backgroundColor: 'rgba(22,21,15,0.72)',
        color: '#ffffff',
        fontFamily: 'Jakarta',
        fontWeight: 800,
        fontSize: 28,
      },
      children: [
        // the logo brick: body and two studs
        { type: 'div', props: { style: { display: 'flex', position: 'relative', width: 40, height: 40 }, children: [
          box({ position: 'absolute', left: 2, top: 11, width: 30, height: 23, borderRadius: 5, backgroundColor: '#ffcf00' }),
          box({ position: 'absolute', left: 7, top: 5, width: 8, height: 7, borderRadius: 2, backgroundColor: '#ffcf00' }),
          box({ position: 'absolute', left: 19, top: 5, width: 8, height: 7, borderRadius: 2, backgroundColor: '#ffcf00' }),
        ] } },
        'Kockolov',
      ],
    },
  };
  const svg = await satori(el as never, { width: 260, height: 56, fonts: [{ name: 'Jakarta', weight: 800, style: 'normal', data: font }] });
  mark = await sharp(Buffer.from(svg)).png().toBuffer();
  return mark;
}

/**
 * Takes any photo (JPEG, PNG, WebP, HEIC if the build supports it), straightens it by its EXIF turn,
 * fits it whole into 1200×900 over a blurred copy, stamps Kockolov bottom right and returns a JPEG without metadata.
 */
export async function processPhoto(input: Buffer): Promise<Buffer> {
  const src = sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 }).rotate();
  const backdrop = await src
    .clone()
    .resize(PHOTO_W, PHOTO_H, { fit: 'cover' })
    .blur(28)
    .modulate({ brightness: 1.08 })
    .toBuffer();
  const photo = await src.clone().resize(PHOTO_W, PHOTO_H, { fit: 'inside', withoutEnlargement: false }).toBuffer();
  const s = await stamp();
  const sm = await sharp(s).metadata();
  return sharp(backdrop)
    .composite([
      { input: photo, gravity: 'center' },
      { input: s, left: PHOTO_W - (sm.width ?? 260) - 24, top: PHOTO_H - (sm.height ?? 56) - 24 },
    ])
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer(); // no .withMetadata(): EXIF (GPS, camera) is dropped
}

export const imagePath = (file: string) => path.join(config.LISTINGS_DIR, file);
export const isImageName = (file: string) => /^[a-f0-9]{24}\.jpg$/.test(file);

/** Processes and stores an upload; returns the file name */
export async function saveUpload(input: Buffer): Promise<string> {
  const jpg = await processPhoto(input);
  await mkdir(config.LISTINGS_DIR, { recursive: true });
  const file = `${randomBytes(12).toString('hex')}.jpg`;
  await writeFile(imagePath(file), jpg);
  return file;
}

export const readImage = (file: string) => readFile(imagePath(file));
export const removeImage = (file: string) => unlink(imagePath(file)).catch(() => {});
