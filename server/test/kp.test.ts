import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildNameIndex, classifyAd, kpPrice, setByName, setNumbersIn, type KnownSet, type KpAd } from '../src/kp/classify.js';
import { parseKpSearch } from '../src/kp/parse.js';

// our sets (Serbian names, LEGO Store regular price) and catalog-only retired sets
const SETS: Record<string, KnownSet> = {
  '75192': { names: ['Millennium Falcon'], theme: 'star-wars', rrp: 109999 },
  '75257': { names: ['Millennium Falcon'], theme: 'star-wars', rrp: 21999 },
  '10294': { names: ['Titanik', 'Titanic'], theme: 'icons', rrp: 89999 },
  '42622': { names: ['Streličarski poligon'], theme: 'friends', rrp: 2999 },
  '77258': { names: ['F1 ACADEMY trkački automobil'], theme: 'speed-champions', rrp: 2999 },
  '31140': { names: ['Magični jednorog'], theme: 'creator', rrp: 1599 },
  '9090': { names: ['Some old set'], theme: null, rrp: null },
  '1234': { names: ['Old thing'], theme: null, rrp: null },
  // from the catalog only: English names, no LEGO Store price
  '4195': { names: ["Queen Anne's Revenge"], theme: null, rrp: null },
  '6039': { names: ['Twisted Time Train'], theme: null, rrp: null },
};
const ctx = { known: (n: string) => SETS[n] ?? null, eurRate: 117.2 };
const ad = (title: string, priceText: string, snippet = '', condition: KpAd['condition'] = 'novo'): KpAd => ({
  id: '1',
  title,
  snippet,
  priceText,
  condition,
});
const decide = (title: string, priceText: string, snippet = '', condition: KpAd['condition'] = 'novo') =>
  classifyAd(ad(title, priceText, snippet, condition), ctx);

describe('KP prices', () => {
  it('reads dinars and euros, and no price for "Kontakt"', () => {
    expect(kpPrice('23 €')).toEqual({ amount: 23, currency: 'EUR' });
    expect(kpPrice('1.200 din')).toEqual({ amount: 1200, currency: 'RSD' });
    expect(kpPrice('12 000 din')).toEqual({ amount: 12000, currency: 'RSD' });
    expect(kpPrice('1.500,50 din')).toEqual({ amount: 1500.5, currency: 'RSD' });
    expect(kpPrice('Kontakt')).toBeNull();
    expect(kpPrice('Dogovor')).toBeNull();
  });
});

describe('set numbers in an ad', () => {
  const known = (n: string) => !!SETS[n];
  it('skips phone numbers, years, piece counts and prices', () => {
    expect(setNumbersIn('pozovite 064/123-1234', known)).toEqual([]);
    expect(setNumbersIn('Titanic 10294 9090 delova', known)).toEqual(['10294']);
    expect(setNumbersIn('LEGO 6039 Legoland - vintage Lego 1988 godina', known)).toEqual(['6039']);
    expect(setNumbersIn('cena 9090 din', known)).toEqual([]);
    expect(setNumbersIn('75192-1 i 75257', known)).toEqual(['75192', '75257']);
    expect(setNumbersIn('99999 nepoznat', known)).toEqual([]);
  });
});

describe('KP ads that are one set we can show', () => {
  it('shows ads with one known set number and a believable price (titles as seen on KP, Nov 2026)', () => {
    expect(decide('LEGO Friends 42622 Strelicarski poligon NOV ORIGINAL LEGO O', '2.990 din')).toMatchObject({ kind: 'show', setNum: '42622', priceRsd: 2990 });
    expect(decide('LEGO Speed Champions 77258 F1 ACADEMy LEGO trkački automobil', '23 €')).toMatchObject({
      kind: 'show',
      setNum: '77258',
      priceRsd: 2696,
      price: { amount: 23, currency: 'EUR' },
    });
    expect(decide('LEGO Creator 3 u 1 Magični jednorog 31140 NOV ORIGINAL LEGO', '1.200 din')).toMatchObject({ kind: 'show', setNum: '31140' });
    // retired sets from the catalog: no LEGO Store price to compare with
    expect(decide("LEGO 4195 Queen Anne's Revenge", '900 €', '', 'korisceno')).toMatchObject({ kind: 'show', setNum: '4195', priceRsd: 105480 });
    expect(decide('LEGO 6039 Legoland - vintage Lego 1988 godina', '8.999 din', '', 'korisceno')).toMatchObject({ kind: 'show', setNum: '6039' });
  });

  it('skips what is not one LEGO set', () => {
    expect(decide('Lego kocke ORIGINALNE prodaja na kilogram', '2.999 din')).toEqual({ kind: 'skip', why: 'bulk' });
    expect(decide('Lego kocke 2kg razne', '5.000 din')).toEqual({ kind: 'skip', why: 'bulk' });
    expect(decide('Kupujem LEGO Star Wars setove', '100 €')).toEqual({ kind: 'skip', why: 'wanted' });
    expect(decide('Kocke kompatibilne sa LEGO 75192 Millennium Falcon', '50 €')).toEqual({ kind: 'skip', why: 'not_lego' });
    expect(decide('LEGO Star Wars igrica PS4', '1.500 din')).toEqual({ kind: 'skip', why: 'not_a_set' });
    expect(decide('Lego minifigure Star Wars', '500 din')).toEqual({ kind: 'skip', why: 'not_a_set' });
    expect(decide('LED osvetljenje za LEGO 10294 Titanic', '30 €')).toEqual({ kind: 'skip', why: 'not_a_set' });
    expect(decide('LEGO promo set 75192', '10 €')).toEqual({ kind: 'skip', why: 'promo' });
    expect(decide('LEGO 75192 Millennium Falcon', '700 €', '', 'osteceno')).toEqual({ kind: 'skip', why: 'damaged' });
    expect(decide('LEGO 75192 Millennium Falcon', 'Kontakt')).toMatchObject({ kind: 'skip', why: 'no_price' });
    expect(decide('LEGO kocke razne boje', '20 €')).toEqual({ kind: 'skip', why: 'no_number' });
    expect(decide('LEGO setovi razni', '20 €')).toEqual({ kind: 'skip', why: 'multi' });
    // a LEGO Mixels set is not a "mix" of bricks
    expect(decide('LEGO Mixels 10294', '5 €').kind).not.toBe('skip');
  });

  it('does not take years, piece counts, prices or model names for set numbers (seen on KP, Nov 2026)', () => {
    const more: Record<string, KnownSet> = {
      ...SETS,
      '42141': { names: ['McLaren Formula 1 Team'], theme: 'technic', rrp: 24999 },
      '2022': { names: ['Some 2022 set'], theme: null, rrp: null },
      '2024': { names: ['Duck Rattle'], theme: 'duplo', rrp: null },
      '42130': { names: ['BMW M 1000 RR'], theme: 'technic', rrp: 26999 },
      '1000': { names: ['Basic Building Set'], theme: null, rrp: null },
      '1500': { names: ['Old thing'], theme: null, rrp: null },
      '3929': { names: ['Old set'], theme: null, rrp: null },
      '42055': { names: ['Bucket Wheel Excavator'], theme: 'technic', rrp: null },
    };
    const c = { known: (n: string) => more[n] ?? null, eurRate: 117.2 };
    const k = (title: string, price: string, snippet = '') => classifyAd(ad(title, price, snippet), c);
    expect(k('LEGO Technic: 42141 McLaren Formula 1 Team 2022', '25.599 din')).toMatchObject({ kind: 'show', setNum: '42141' });
    expect(k('Lego Christmas 2024 Bundle - Lego Christmas Tree', '99 €')).toMatchObject({ kind: 'skip', why: 'no_number' });
    expect(k('Lego City staze na prodaju (1500 obe)', '1.500 din')).toMatchObject({ kind: 'skip', why: 'no_number' });
    expect(k('Lego Technic 42055 Bucket Wheel Excavator Building Kit (3929', '557 €')).toMatchObject({ kind: 'show', setNum: '42055' });
    expect(k('LEGO Technic BMW M 1000 RR', '230 €', 'Article No. 42130 Manufacturer LEGO')).toMatchObject({ kind: 'show', setNum: '42130' });
    // LEGO's own descriptions call a model a "replika"; a real Mario expansion is "kompatibilan" with the starter set
    expect(k('LEGO 42141 McLaren', '200 €', 'detaljnu LEGO repliku bolida')).toMatchObject({ kind: 'show' });
    expect(k('LEGO 42141 McLaren', '200 €', 'Kompatibilan sa početnim setom')).toMatchObject({ kind: 'show' });
    expect(k('LEGO 42141 McLaren', '50 €', 'vrlo kvalitetna kopija, identična')).toMatchObject({ kind: 'skip', why: 'not_lego' });
  });

  it('reads set numbers the way KP sellers write them (Nov 2026)', () => {
    const more: Record<string, KnownSet> = {
      ...SETS,
      '21320': { names: ['Dinosaur Fossils'], theme: 'ideas', rrp: null },
      '76457': { names: ["Hogsmeade Village – Collectors' Edition"], theme: 'harry-potter', rrp: 43999 },
      '1470': { names: ['Old thing'], theme: null, rrp: null },
      '42218': { names: ['John Deere 9700 Forage Harvester'], theme: 'technic', rrp: 12999 },
      '71374': { names: ['Nintendo Entertainment System'], theme: 'super-mario', rrp: null },
      '10713': { names: ['Creative Suitcase'], theme: 'classic', rrp: null },
      '60500': { names: ['Kombi'], theme: 'city', rrp: 3999 },
      '10283': { names: ['NASA Space Shuttle Discovery'], theme: 'icons', rrp: 21999 },
    };
    const c = { known: (n: string) => more[n] ?? null, eurRate: 117.2 };
    const k = (title: string, price: string) => classifyAd(ad(title, price), c);
    expect(k('LEgo Ideas 21320 Dinosaur Fossils Construction Toy', '124 €')).toMatchObject({ kind: 'show', setNum: '21320' }); // not "din"
    expect(k('LEGO Harry Potter 76457Selo Hogsmid kolekcionarsko izdanje', '43.990 din')).toMatchObject({ kind: 'show', setNum: '76457' });
    expect(k('LEGO Technic 42218 John Deere 1470H kombajn', '12.990 din')).toMatchObject({ kind: 'show', setNum: '42218' });
    expect(k('LEGO Super Mario Nintendo Entertainment System 71374 Komplet', '377 €')).toMatchObject({ kind: 'show', setNum: '71374' });
    expect(k('LEGO Classic – Kreativni kofer (10713)', '1.700 din')).toMatchObject({ kind: 'show', setNum: '10713' });
    expect(k('LEGO City 60500 policajac i kombi', '3.590 din')).toMatchObject({ kind: 'show', setNum: '60500' });
    expect(k('LEGO NASA Space Shuttle Discovery 10283 Build and Display Model', '281 €')).toMatchObject({ kind: 'show', setNum: '10283' });
    expect(k('Akrilna vitrina za LEGO 10283', '60 €')).toMatchObject({ kind: 'skip', why: 'not_a_set' });
    expect(k('Torba za LEGO kocke', '15 €')).toMatchObject({ kind: 'skip', why: 'not_a_set' });
  });

  it('finds the set by its name when the ad has no number (KP, Nov 2026)', () => {
    const names = buildNameIndex([
      { num: '75579', names: ['Payakan the Tulkun & Crabsuit'] },
      { num: '4730', names: ['Chamber of Secrets'] },
      { num: '3862', names: ['Harry Potter: Hogwarts'] }, // only the theme: never used
      { num: '75192', names: ['Millennium Falcon'] }, // shared by several sets: never used
      { num: '75257', names: ['Millennium Falcon'] },
      { num: '76454', names: ['Hogwarts Castle: The Main Tower'] },
      { num: '40613', names: ['Mini Disney Palace of Agrabah'] },
      { num: '75639', names: ['The Going Merry Pirate Ship'] },
    ]);
    const more: Record<string, KnownSet> = {
      ...SETS,
      '75579': { names: ['Payakan the Tulkun & Crabsuit'], theme: null, rrp: null },
      '4730': { names: ['Chamber of Secrets'], theme: 'harry-potter', rrp: null },
      '76454': { names: ['Hogwarts Castle: The Main Tower'], theme: 'harry-potter', rrp: 22999 },
      '40613': { names: ['Mini Disney Palace of Agrabah'], theme: 'disney', rrp: null },
    };
    const c = { known: (n: string) => more[n] ?? null, names, eurRate: 117.2 };
    const k = (title: string, price: string) => classifyAd(ad(title, price), c);
    expect(k('LEGO Avatar: The Way of Water Payakan The Tulkun & Crabsuit', '188 €')).toMatchObject({ kind: 'show', setNum: '75579', priceRsd: 22034 });
    expect(k('LEGO Harry Potter Hogwarts Castle: The Main Tower - Toy with figures', '208 €')).toMatchObject({ kind: 'show', setNum: '76454' });
    // two words of its own could be a movie title: the admin decides
    expect(k('LEGO Harry Potter and The Chamber of Secrets Hogwarts', '153 €')).toMatchObject({ kind: 'review', setNum: '4730', why: 'name_only' });
    // the same words in another order
    expect(setByName('LEGO ONE PIECE - The Pirate Ship Going Merry - Playset', names)).toMatchObject({ num: '75639' });
    expect(setByName('LEGO Harry Potter Hogwarts Express', names)).toBeNull();
    expect(setByName('LEGO Star Wars Millennium Falcon', names)).toBeNull();
    // a number glued after "Aladdin" is not a price in dinars
    expect(k('Lego Aladdin 40613 Mini Disney Palace of Agrabah', '3.499 din')).toMatchObject({ kind: 'show', setNum: '40613' });
  });

  it('skips ads with several sets', () => {
    expect(decide('LEGO 75192 i 75257 Millennium Falcon', '900 €')).toEqual({ kind: 'skip', why: 'multi', setNums: ['75192', '75257'] });
    expect(decide('Lego novo veliki izbor setova na stanju', '10 €', 'Na stanju: 75192, 10294, 42622 i još mnogo toga')).toMatchObject({
      kind: 'skip',
      why: 'multi',
    });
  });

  it('sends doubtful ones to the admin instead of showing them', () => {
    // a typo: Technic Lamborghini with a Star Wars number
    expect(decide('LEGO Technic Lamborghini 75192', '400 €')).toMatchObject({ kind: 'review', setNum: '75192', why: 'name' });
    // 5.860 RSD for a 109.999 RSD set
    expect(decide('LEGO 75192 Millennium Falcon', '50 €')).toMatchObject({ kind: 'review', why: 'price' });
    expect(decide('LEGO veliki brod', '600 €', 'Set 10294, kompletan sa kutijom')).toMatchObject({ kind: 'review', setNum: '10294', why: 'number_in_text' });
    // ...but when the title names the same set, the number in the description is enough
    expect(decide('LEGO Titanic', '600 €', 'Set 10294, kompletan sa kutijom')).toMatchObject({ kind: 'show', setNum: '10294' });
    expect(decide('LEGO 75192 Millennium Falcon', '700 €', 'Imam i 75257, pitajte')).toMatchObject({ kind: 'review', setNum: '75192', why: 'more_numbers' });
  });
});

describe('KP search page', () => {
  const page = (n: number) => parseKpSearch(readFileSync(new URL(`./fixtures/kp/pretraga-strana-${n}.html`, import.meta.url), 'utf8'));

  it('reads the ads from the page data (KupujemProdajem, 4 Nov 2026)', () => {
    const p = page(1);
    expect(p).toMatchObject({ blocked: false, page: 1, pages: 172, total: 5139 });
    expect(p.ads).toHaveLength(30);
    expect(p.ads.find((a) => a.id === '196749898')).toEqual({
      id: '196749898',
      title: "LEGO 4195 Queen Anne's Revenge",
      snippet: "LGO 4195 Queen Anne's Revenge nov, neotpakovan, bez oštećenja",
      priceText: '900 €',
      priceAmount: 900,
      currency: 'EUR',
      condition: 'nekorisceno',
      type: 'sell',
      location: 'Subotica',
      url: 'https://www.kupujemprodajem.com/igracke-i-igre/kockice/lego-4195-queen-anne-s-revenge/oglas/196749898',
      image: expect.stringMatching(/^https:\/\/images\.kupujemprodajem\.com\/photos\/oglasi\/.+\.webp$/),
      thumb: expect.stringContaining('/tmb-300x300-'),
      postedAt: '2026-10-29 14:17:53',
    });
    expect(page(2).page).toBe(2);
    expect(new Set([...page(1).ads, ...page(2).ads].map((a) => a.condition))).toEqual(new Set(['novo', 'nekorisceno', 'korisceno']));
  });

  it('notices a check page instead of results', () => {
    expect(parseKpSearch('<html><body>Are you human?</body></html>').blocked).toBe(true);
    const html = readFileSync(new URL('./fixtures/kp/pretraga-strana-1.html', import.meta.url), 'utf8').replace(
      '"captchaSiteKey": ""',
      '"captchaSiteKey": "6Lc-abc"',
    );
    expect(parseKpSearch(html).blocked).toBe(true);
  });

  it('decides on the real ads of the first two pages', () => {
    // set numbers the catalog knows (a few, with their names); a minifigure series is not a set
    const cat: Record<string, KnownSet> = {
      '4195': { names: ["Queen Anne's Revenge"], theme: null, rrp: null },
      '6039': { names: ['Twisted Time Train'], theme: null, rrp: null },
      '75954': { names: ['Hogwarts Great Hall'], theme: 'harry-potter', rrp: null },
      '21309': { names: ['NASA Apollo Saturn V'], theme: 'ideas', rrp: null },
      '31214': { names: ['Love'], theme: 'art', rrp: null },
      '71011': { names: ['Minifigures Series 15'], theme: null, rrp: null, notASet: true },
      '7412': { names: ['Yoda'], theme: 'star-wars', rrp: null },
      '4500': { names: ['Rebel Snowspeeder'], theme: 'star-wars', rrp: null },
    };
    const ads = [...page(1).ads, ...page(2).ads];
    const d = (id: string) => classifyAd(ads.find((a) => a.id === id)!, { known: (n) => cat[n] ?? null, eurRate: 117.2 });
    expect(d('196749898')).toMatchObject({ kind: 'show', setNum: '4195' }); // Queen Anne's Revenge, 900 €
    expect(d('184454130')).toMatchObject({ kind: 'show', setNum: '6039' }); // "vintage Lego 1988 godina"
    expect(d('182931301')).toMatchObject({ kind: 'show', setNum: '75954' });
    expect(d('192307608')).toMatchObject({ kind: 'skip', why: 'multi' }); // "Veliki izbor setova", 23 €
    expect(d('196887395')).toMatchObject({ kind: 'skip', why: 'bulk' }); // 11 kg of bricks
    expect(d('192020580')).toMatchObject({ kind: 'skip', why: 'not_a_set' }); // minifigure series 1/4/5/6
    const titled = (re: RegExp) => ads.find((a) => re.test(a.title))!.id;
    expect(d(titled(/lighting kit/))).toMatchObject({ kind: 'skip' }); // a light kit "for lego 31214"
    expect(d(titled(/Series 15 Minifigures 71011/))).toMatchObject({ kind: 'skip', why: 'not_a_set' });
    expect(d(titled(/Saturn V/))).toMatchObject({ kind: 'show', setNum: '21309' }); // number only in the description
    expect(d(titled(/yeti 7412/))).toMatchObject({ kind: 'skip', why: 'multi' });
    expect(d(titled(/njo0009/))).toMatchObject({ kind: 'skip' }); // a minifigure code
  });
});
