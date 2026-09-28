import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMerch, matchOffer } from '../src/crawler/matching.js';
import { ageFromText } from '../src/lib/setnum.js';
import { themeFromList } from '../src/lib/themes.js';

// Real listings captured from the three shops on 28 Sep 2026 (also used by `npm run demo`).
const rows = (f: string) =>
  readFileSync(path.join(__dirname, '..', 'scripts', 'demo-data', f), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('|'));

const lstore = rows('lstore.txt');
const kockarium = rows('kockarium.txt');
const ananas = rows('ananas.txt');
const idx = { known: new Set(lstore.map((r) => r[1])), names: new Map<string, string>() };

describe('matching on real shop titles', () => {
  it('links every Ananas set listing to the same set number the LEGO Store uses', () => {
    let matched = 0;
    const misses: string[] = [];
    for (const [id, , , , , seller, title] of ananas) {
      const m = matchOffer({ externalId: id, seller, title, url: '', priceRsd: 1, inStock: true }, idx);
      const expected = title.match(/\b(\d{5})\b/)?.[1];
      if (m) {
        matched++;
        expect(m.setNum).toBe(expected);
      } else if (!isMerch(title)) misses.push(title);
    }
    expect(matched).toBe(359);
    expect(misses).toEqual([]); // everything unmatched is merchandise (keychains, bottles, bags)
  });

  it('uses the SKU on Kockarium, keeping single minifigures separate from the series', () => {
    const nums = kockarium.map(([id, sku, title]) => matchOffer({ externalId: id, title, url: '', priceRsd: 1, inStock: true, sku }, idx)?.setNum);
    expect(nums.every(Boolean)).toBe(true);
    expect(nums).toContain('71051-7');
    expect(nums).not.toContain('71051');
  });

  it('resolves a theme for nearly every set', () => {
    const themed = [...kockarium.map((r) => r[7].split('^')), ...ananas.map((r) => [r[7]]), ...lstore.map((r) => [r[4]])].filter(
      (cats) => themeFromList(cats),
    ).length;
    const total = kockarium.length + ananas.length + lstore.length;
    // Ananas leaves the category empty for some licensed themes (Sonic, Animal Crossing...)
    expect(themed / total).toBeGreaterThan(0.85);
    expect(themeFromList(['LEGO® Hari Poter™'])).toBe('harry-potter');
    expect(themeFromList(['LEGO® DUPLO®', 'LEGO® Marvel Super Heroji'])).toBe('duplo');
  });

  it('reads ages from marketplace titles', () => {
    const ages = ananas.map((r) => ageFromText(r[6])).filter((a) => a !== null);
    expect(ages.length).toBeGreaterThan(330);
  });
});
