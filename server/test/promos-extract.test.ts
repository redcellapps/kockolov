import { describe, expect, it } from 'vitest';
import { extractPromos, fold, parseAtomFeed, parseDates, parseThreshold, passagesFromHtml } from '../src/crawler/promos/extract.js';

const NOW = new Date('2026-11-07T10:00:00Z');

describe('parseDates', () => {
  it('reads a day range with a month name', () => {
    expect(parseDates('Akcija važi samo onlajn na dexy.co.rs, od 2. do 8. novembra.', NOW)).toEqual({ from: '2026-11-02', until: '2026-11-08' });
  });
  it('reads two numeric dates', () => {
    expect(parseDates('Promocija važi između 01.11.2026, 00:00 i 30.11.2026, 23:59, ili dok traje zaliha.', NOW)).toEqual({ from: '2026-11-01', until: '2026-11-30' });
  });
  it('reads a lone "do" date and ignores an unmarked one', () => {
    expect(parseDates('Ponuda traje do 30.11.', NOW)).toEqual({ from: null, until: '2026-11-30' });
    expect(parseDates('Objavljeno 05.11. u prodavnici', NOW)).toEqual({ from: null, until: null });
  });
  it('rejects impossible dates', () => {
    expect(parseDates('od 31. do 32. novembra', NOW).until).toBeNull();
  });
});

describe('parseThreshold', () => {
  it('finds the spend amount in Serbian number format', () => {
    expect(parseThreshold('Uz kupovinu LEGO® proizvoda u vrednosti većoj od 16.000 RSD dobijate poklon')).toBe(16000);
    expect(parseThreshold('Jednostavno potrošite preko 30.000 RSD i izaberite set za samo 1 RSD')).toBe(30000);
  });
  it('does not mistake a price for a threshold', () => {
    expect(parseThreshold('Set košta 89.999 RSD')).toBeNull();
  });
});

describe('extractPromos', () => {
  const opt = { sourceUrl: 'https://lstore.rs/blogs/vesti/x', now: NOW };
  it('proposes a gift with a spend threshold', () => {
    const [c] = extractPromos(['Uz kupovinu LEGO® proizvoda u vrednosti većoj od 18.000 RSD, dobijate LEGO® Astro Bot™ (40899) za 1 RSD, dok traju zalihe.'], opt);
    expect(c).toMatchObject({ kind: 'gift', minBasketRsd: 18000 });
  });
  it('proposes an online-only discount with a code and dates, in LEGO-only mode', () => {
    const text = 'LEGO popust: akcija važi samo onlajn na dexy.co.rs, od 2. do 30. novembra, uz kod LEGO_NOV_10 ostvarujete 10% popusta.';
    const [c] = extractPromos([text], { ...opt, legoOnly: true });
    expect(c).toMatchObject({ kind: 'online_only', discountPct: 10, validFrom: '2026-11-02', validUntil: '2026-11-30' });
  });
  it('skips a non-LEGO promotion in LEGO-only mode', () => {
    const text = 'Akcija važi samo onlajn na dexy.co.rs, od 2. do 8. novembra, uz kod DRUSTVENE_IGRE_20 popust na društvene igre.';
    expect(extractPromos([text], { ...opt, legoOnly: true })).toEqual([]);
  });
  it('skips vague banners and bare shipping badges', () => {
    expect(extractPromos(['Popusti za Kockariumov 11. rođendan i stalne akcije na LEGO kockice', 'BESPLATNA ISPORUKA na odabrane proizvode'], opt)).toEqual([]);
  });
  it('skips a promotion that is already over', () => {
    expect(extractPromos(['Poklon uz kupovinu preko 10.000 RSD, od 1. do 3. oktobra.'], opt)).toEqual([]);
  });
  it('limits to themes only when the text speaks of themes', () => {
    const themes = [{ slug: 'star-wars', name: 'Star Wars' }, { slug: 'technic', name: 'Technic' }];
    const onlyThemes = extractPromos(['Poklon za sve setove iz teme Technic, uz kupovinu preko 12.000 RSD.'], { ...opt, themes });
    expect(onlyThemes[0]?.themes).toEqual(['technic']);
    const eligibleList = extractPromos(['Potrošite preko 30.000 RSD i izaberite set za 1 RSD: TIE Fighter (Star Wars) ili Scully’s Lab.'], { ...opt, themes });
    expect(eligibleList[0]?.themes).toEqual([]);
  });
});

describe('passagesFromHtml and feeds', () => {
  it('reads paragraphs and banner leaves, ignores navigation and footer', () => {
    const html = `<nav><a>Akcija popust navigacija preko 1.000 RSD ovde</a></nav>
      <div class="banner"><span>Poklon uz kupovinu preko 16.000 RSD do 30.11.</span></div>
      <p>Drugi paragraf bez ičega važnog za nas ovde.</p><footer><p>Popust u podnožju preko 5.000 RSD</p></footer>`;
    const out = passagesFromHtml(html);
    expect(out).toContain('Poklon uz kupovinu preko 16.000 RSD do 30.11.');
    expect(out.some((p) => p.includes('navigacija') || p.includes('podnožju'))).toBe(false);
  });
  it('reads Atom entries with their escaped HTML', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>1</id><published>2026-11-01T10:00:00+01:00</published>
      <link rel="alternate" type="text/html" href="https://lstore.rs/blogs/vesti/astro-bot"/><title>Astro Bot za 1 RSD</title>
      <content type="html">&lt;p&gt;Uz kupovinu preko 18.000 RSD dobijate poklon set.&lt;/p&gt;</content></entry></feed>`;
    const [e] = parseAtomFeed(xml);
    expect(e).toMatchObject({ title: 'Astro Bot za 1 RSD', url: 'https://lstore.rs/blogs/vesti/astro-bot' });
    expect(passagesFromHtml(e!.html)[0]).toBe('Uz kupovinu preko 18.000 RSD dobijate poklon set.');
  });
});

describe('fold', () => {
  it('drops diacritics and case', () => {
    expect(fold('Đurđevdan ČĆŽŠ')).toBe('djurdjevdan cczs');
  });
});
