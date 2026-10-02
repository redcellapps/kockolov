import { describe, expect, it } from 'vitest';
import { normalizeText, parseRsd } from '../src/lib/normalize.js';
import { ageFromText, cleanTitle, setNumFromSku, setNumFromTitle } from '../src/lib/setnum.js';
import { refineSuperHeroes, themeFromList, themeFromRaw } from '../src/lib/themes.js';
import { isMerch, linkDoubts, matchOffer, buildNameIndex } from '../src/crawler/matching.js';
import { htmlToText, parseFrontmatter, parsePost, readingMinutes } from '../src/blog/posts.js';

describe('normalizeText', () => {
  it('strips diacritics, trademarks and punctuation', () => {
    expect(normalizeText('LEGO® Hari Poter™ – Ministarstvo magije')).toBe('lego hari poter ministarstvo magije');
    expect(normalizeText('Gradonačelnikova rezidencija, Šrek, Žuti, Đavo')).toBe('gradonacelnikova rezidencija srek zuti djavo');
  });
  it('transliterates Serbian Cyrillic', () => {
    expect(normalizeText('Хари Потер')).toBe('hari poter');
    expect(normalizeText('Љубичасти змај')).toBe('ljubicasti zmaj');
  });
});

describe('parseRsd', () => {
  it.each([
    ['13.190,00 RSD', 13190],
    ['13.190,00 RSD', 13190],
    ['51999.00', 51999],
    ['1.00', 1],
    ['0.00', 0],
    ['2.105 RSD', 2105],
    ['499,00 RSD', 499],
    [7319, 7319],
  ])('%s -> %s', (raw, n) => expect(parseRsd(raw as string)).toBe(n));
  it('returns null for garbage', () => expect(parseRsd('—')).toBeNull());
});

describe('set numbers', () => {
  it('reads SKUs', () => {
    expect(setNumFromSku('75192')).toBe('75192');
    expect(setNumFromSku('71051-7')).toBe('71051-7'); // single minifigure, not the whole series
    expect(setNumFromSku('71053-x')).toBe('71053-X');
    expect(setNumFromSku('LGL-KE194H')).toBeNull();
    expect(setNumFromSku('11010295-590')).toBeNull();
  });
  it('finds numbers in marketplace titles', () => {
    expect(setNumFromTitle('LEGO Botanicals Mini orhideja 10343, Uzrast 18+')).toBe('10343');
    expect(setNumFromTitle('LEGO Classic Kofica kreativnih kockica 10698, 790 Delova')).toBe('10698');
    expect(setNumFromTitle('LEGO Friends božićni kalendar za 2026. godinu 42698')).toBe('42698');
    expect(setNumFromTitle('LEGO Kocke City Police Station Chase')).toBeNull();
    expect(setNumFromTitle('LEGO Disney Angel 4950741, Uzrast 9+')).toBeNull();
    expect(setNumFromTitle('Set 1000 delova')).toBeNull();
  });
  it('prefers known numbers when several appear', () => {
    expect(setNumFromTitle('LEGO 3u1 31155 zamena za 31100', (n) => n === '31100')).toBe('31100');
  });
  it('cleans marketplace titles', () => {
    expect(cleanTitle('LEGO Minecraft TNT kuća u džungli 21275, Uzrast 8+', '21275')).toBe('Minecraft TNT kuća u džungli');
    expect(cleanTitle('LEGO City Kocke Penguin slushy van, Uzrast 5+')).toBe('City Penguin slushy van');
  });
  it('parses ages', () => {
    expect(ageFromText('LEGO Duplo Kutija kocki Deluxe 10914, Uzrast 1.5+')).toBe(1.5);
    expect(ageFromText('LEGO Art, Uzrast 18+')).toBe(18);
    expect(ageFromText('Bez uzrasta')).toBeNull();
  });
});

describe('themes', () => {
  it('maps shop categories from all three shops', () => {
    expect(themeFromRaw('LEGO® Harry Potter™')).toBe('harry-potter');
    expect(themeFromRaw('LEGO® Hari Poter™')).toBe('harry-potter');
    expect(themeFromRaw('LEGO® Marvel Super Heroji')).toBe('marvel');
    expect(themeFromRaw('LEGO® DC Comics™ Super Heroji')).toBe('dc');
    expect(themeFromRaw('LEGO DC')).toBe('dc');
    expect(themeFromRaw('LEGO® Spider-Man')).toBe('marvel');
    expect(themeFromRaw('LEGO® Super Heroes')).toBe('super-heroes');
    expect(themeFromRaw('LEGO® Creator 3in1')).toBe('creator');
    expect(themeFromRaw('LEGO® Creator Expert')).toBe('icons');
    expect(themeFromRaw('Botanical Collection')).toBe('botanicals');
    expect(themeFromRaw('Botanička kolekcija')).toBe('botanicals');
    expect(themeFromRaw('LEGO® Iconic')).toBe('iconic');
    expect(themeFromRaw('LEGO® Šampioni Brzine')).toBe('speed-champions');
    expect(themeFromRaw('LEGO® Jurassic World™')).toBe('jurassic-world');
    expect(themeFromRaw('LEGO® kocke')).toBeNull();
    expect(themeFromRaw('Igračke za decu')).toBeNull();
    expect(themeFromRaw('LEGO® 4+')).toBeNull();
  });
  it('picks the specific theme from a list', () => {
    expect(themeFromList(['LEGO® Icons', 'LEGO® kocke', 'LEGO® modeli za odrasle'])).toBe('icons');
    expect(themeFromList(['LEGO® 4+', 'LEGO® kocke', 'LEGO® Marvel Super Heroji'])).toBe('marvel');
    expect(themeFromList(['LEGO kocke', 'Igračke za decu', 'LEGO Botanicals'])).toBe('botanicals');
  });
  it('splits Super Heroes into Marvel / DC by title', () => {
    expect(refineSuperHeroes('Betmobil iz filma Povratak Betmena')).toBe('dc');
    expect(refineSuperHeroes('Ajronmen MK4 bista')).toBe('marvel');
    expect(refineSuperHeroes('Nešto treće')).toBeNull();
  });
});

describe('matching', () => {
  const idx = {
    known: new Set(['10280', '31999']),
    names: buildNameIndex([{ set_num: '31999', names: ['Most Kloda Monea'] }]),
  };
  it('uses the SKU when the shop provides one', () => {
    expect(matchOffer({ externalId: '1', title: 'x', url: '', priceRsd: 1, inStock: true, sku: '11383' }, idx)).toEqual({
      setNum: '11383',
      method: 'sku',
    });
  });
  it('rejects non-set SKUs and merchandise', () => {
    expect(matchOffer({ externalId: '1', title: 'Privezak 853', url: '', priceRsd: 1, inStock: true, sku: 'LGL-KE48' }, idx)).toBeNull();
    expect(isMerch('LEGO Kutija za odlaganje 4, Svetlozelena, Uzrast 3+')).toBe(true);
    expect(isMerch('LEGO Duplo Kutija kocki Deluxe 10914')).toBe(false);
  });
  it('falls back to set names when the title has no number', () => {
    expect(
      matchOffer({ externalId: '1', title: 'LEGO Art Most Kloda Monea, Uzrast 18+', url: '', priceRsd: 1, inStock: true }, idx),
    ).toEqual({ setNum: '31999', method: 'name' });
  });
});

describe('doubtful links (admin table of offers)', () => {
  const idx = {
    known: new Set(['75192', '75129', '10280']),
    sets: new Map([
      ['75192', { names: ['Millennium Falcon'], theme: 'star-wars', rrp: 109999 }],
      ['75129', { names: ['Wookiee Gunship'], theme: 'star-wars', rrp: 2999 }],
      ['10280', { names: ['Buket cveća'], theme: 'botanicals', rrp: 7799 }],
    ]),
  };
  it('trusts a title that names the linked set', () => {
    expect(linkDoubts({ title: 'LEGO Star Wars 75192 Millennium Falcon', price: 99999 }, '75192', idx)).toEqual([]);
  });
  it('flags a title that names another known set (swapped digits)', () => {
    expect(linkDoubts({ title: 'LEGO Star Wars 75192 Millennium Falcon', price: 99999 }, '75129', idx)).toEqual([
      { kind: 'number', num: '75192' },
      { kind: 'price' },
    ]);
  });
  it('flags a title with no word in common with the set, and a far-off price', () => {
    expect(linkDoubts({ title: 'LEGO Botanicals Orhideja', price: 7499 }, '10280', idx)).toEqual([{ kind: 'name' }]);
    expect(linkDoubts({ title: 'LEGO Buket cveća', price: 1999 }, '10280', idx)).toEqual([{ kind: 'price' }]);
  });
});

describe('blog posts', () => {
  it('reads the header and renders the Markdown', async () => {
    const raw = '---\ntitle: Naslov: sa dvotačkom\ndate: 2026-10-02\ndescription: Kratko\nkeywords: lego, cene\n---\nUvod.\n\n## Deo\n\n- [set](/set/10280)\n- [LEGO](https://www.lego.com)\n';
    expect(parseFrontmatter(raw).meta).toMatchObject({ title: 'Naslov: sa dvotačkom', date: '2026-10-02' });
    const post = await parsePost('probni', raw);
    expect(post).toMatchObject({ slug: 'probni', title: 'Naslov: sa dvotačkom', seoTitle: 'Naslov: sa dvotačkom | Kockolov', keywords: ['lego', 'cene'], image: null, minutes: 1 });
    expect(post.html).toContain('<h2>Deo</h2>');
    expect(post.html).toContain('<a href="/set/10280">set</a>');
    expect(post.html).toContain('<a href="https://www.lego.com" target="_blank" rel="noopener">LEGO</a>');
    expect(post.text).toBe('Uvod.\nDeo\nset\nLEGO');
    await expect(parsePost('los', '---\ntitle: Bez datuma\n---\nx')).rejects.toThrow(/date/);
  });
  it('counts reading time at about 200 words a minute', () => {
    expect(readingMinutes('reč '.repeat(700))).toBe(4);
    expect(htmlToText('<p>A &amp; B</p><ul><li>C</li></ul>')).toBe('A & B\nC');
  });
});

describe('news e-mail text', () => {
  it('turns the plain text into safe HTML and readable text', async () => {
    const { bodyToHtml, bodyToText } = await import('../src/mail/announce.js');
    const body = '# Šta je novo\n\nCene <b>iz</b> 11 prodavnica & više.\nDrugi red.\n\n* jedan\n- dva https://kockolov.rs/ponude.';
    const html = bodyToHtml(body);
    expect(html).toContain('>Šta je novo</div>');
    expect(html).toContain('Cene &lt;b&gt;iz&lt;/b&gt; 11 prodavnica &amp; više.<br>Drugi red.');
    expect(html).toContain('<li style="margin:0 0 6px">dva <a href="https://kockolov.rs/ponude" style="color:#1d5fd1">https://kockolov.rs/ponude</a>.</li>');
    expect(html).not.toContain('<b>');
    // a heading followed straight by a list, then a paragraph right after the list
    const tight = bodyToHtml('# Šta je novo\n- jedan\n- dva\nKraj.');
    expect(tight).toMatch(/>Šta je novo<\/div>\n<ul[^>]*><li[^>]*>jedan<\/li><li[^>]*>dva<\/li><\/ul>\n<p[^>]*>Kraj\.<\/p>$/);
    expect(bodyToText(body)).toBe('Šta je novo\n\nCene <b>iz</b> 11 prodavnica & više.\nDrugi red.\n\n- jedan\n- dva https://kockolov.rs/ponude.');
  });
});
