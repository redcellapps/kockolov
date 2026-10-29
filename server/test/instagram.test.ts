import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildCaption, cardFor, type Candidate } from '../src/social/instagram.js';
import { dayGenitive, renderInstagramCard } from '../src/seo/og.js';

const base: Candidate = {
  set_num: '10348',
  name: 'Crvenolisni japanski bonsai javor',
  theme_slug: 'botanicals',
  theme_name: 'Botanicals',
  image_url: null,
  alt_images: [],
  rrp_rsd: 7799,
  best_price: 5752,
  best_shop: 'kockarium',
  best_seller: '',
  member_shops: 12,
  member_best: 5752,
  watchers: 3,
  shops: 15,
};

describe('Instagram "set dana" caption', () => {
  it('leads with a real discount and names price, shop and the LEGO Store price', () => {
    const c = buildCaption(base, '2026-10-29');
    expect(c.split('\n')[0]).toBe('26% jeftinije nego u LEGO® Store-u 🔥');
    expect(c).toContain('🧱 LEGO® Botanicals Crvenolisni japanski bonsai javor (10348)');
    expect(c).toContain('💰 Najniža cena 29. oktobra: 5.752 RSD, Kockarium');
    expect(c).toContain('🏷️ U LEGO® Store-u: 7.799 RSD');
    expect(c).toContain('🔎 Ima ga i u još 12 prodavnica. Njihove cene vidiš uz besplatan nalog.');
    expect(c).toContain('kockolov.rs/set/10348');
    expect(c.split('\n').at(-1)).toBe('#lego #legosrbija #legobotanicals #lego10348 #legoakcija #kockolov');
  });
  it('says when a members-only shop is cheaper, without its price', () => {
    const c = buildCaption({ ...base, member_shops: 2, member_best: 5100 }, '2026-10-29');
    expect(c).toContain('🔎 Ima ga i u još 2 prodavnice, a negde je i jeftiniji.');
    expect(c).not.toContain('5.100');
    expect(buildCaption({ ...base, member_shops: 1 }, '2026-10-29')).toContain('u još 1 prodavnici.');
    expect(buildCaption({ ...base, member_shops: 0 }, '2026-10-29')).not.toContain('🔎');
  });
  it('without a discount: a plain opener, no LEGO Store line when the LEGO Store is the best', () => {
    const c = buildCaption({ ...base, best_shop: 'lstore', best_price: 7799, theme_slug: 'star-wars', theme_name: 'Star Wars' }, '2026-10-30');
    expect(['Set dana na Kockolovu 👇', 'Jutros smo proverili cene 👇', 'Gde je danas najjeftiniji? 👇']).toContain(c.split('\n')[0]);
    expect(c).toContain('7.799 RSD, LEGO® Store');
    expect(c).not.toContain('🏷️');
    expect(c).toContain('#legostarwars');
  });
  it('fits Instagram: under 2,200 characters and 30 hashtags', () => {
    const c = buildCaption({ ...base, name: 'x'.repeat(300) }, '2026-12-31');
    expect(c.length).toBeLessThan(2200);
    expect((c.match(/#/g) ?? []).length).toBeLessThanOrEqual(30);
  });
});

describe('Instagram picture', () => {
  it('names the day in Serbian', () => {
    expect(dayGenitive('2026-10-29')).toBe('29. oktobra');
    expect(dayGenitive('2026-01-01')).toBe('1. januara');
  });
  it('is a 1080×1350 JPEG, also without the set picture', async () => {
    const jpg = await renderInstagramCard(cardFor(base, '2026-10-29'));
    expect(await sharp(jpg).metadata()).toMatchObject({ width: 1080, height: 1350, format: 'jpeg' });
  });
});
