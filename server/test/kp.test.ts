import { describe, expect, it } from 'vitest';
import { classifyAd, kpPrice, setNumbersIn, type KnownSet, type KpAd } from '../src/kp/classify.js';

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
    expect(decide('LEGO setovi razni', '20 €')).toEqual({ kind: 'skip', why: 'no_number' });
    // a LEGO Mixels set is not a "mix" of bricks
    expect(decide('LEGO Mixels 10294', '5 €').kind).not.toBe('skip');
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
    expect(decide('LEGO Titanic', '600 €', 'Set 10294, kompletan sa kutijom')).toMatchObject({ kind: 'review', setNum: '10294', why: 'number_in_text' });
    expect(decide('LEGO 75192 Millennium Falcon', '700 €', 'Imam i 75257, pitajte')).toMatchObject({ kind: 'review', setNum: '75192', why: 'more_numbers' });
  });
});
