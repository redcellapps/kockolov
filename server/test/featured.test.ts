import { describe, expect, it } from 'vitest';
import { FEATURED_SLOT_MS, pickFeatured } from '../src/deals/featured.js';

const deal = (set_num: string, score: number | string) => ({ set_num, score });
const at = (slot: number) => new Date(slot * FEATURED_SLOT_MS + 1000);

describe('pickFeatured', () => {
  const deals = [deal('A', 80), deal('B', 70), deal('C', 55), deal('D', 47), deal('E', 30)];

  it('returns null without deals', () => {
    expect(pickFeatured([])).toBeNull();
  });

  it('only rotates through strong deals (>= 60% of the best score)', () => {
    const seen = new Set<string>();
    for (let slot = 0; slot < 30; slot++) seen.add(pickFeatured(deals, at(slot))!.set_num);
    expect([...seen].sort()).toEqual(['A', 'B', 'C']); // D (47) and E are below 48 = 60% of 80
  });

  it('never repeats the same set in two consecutive slots and is stable inside a slot', () => {
    for (let slot = 0; slot < 30; slot++) {
      const a = pickFeatured(deals, at(slot))!.set_num;
      expect(pickFeatured(deals, new Date(at(slot).getTime() + FEATURED_SLOT_MS - 2000))!.set_num).toBe(a);
      expect(pickFeatured(deals, at(slot + 1))!.set_num).not.toBe(a);
    }
  });

  it('always keeps the top deal in the pool, even when it is the only one', () => {
    expect(pickFeatured([deal('A', 10)], at(5))!.set_num).toBe('A');
  });

  it('copes with scores that arrive as strings from Postgres', () => {
    const picked = new Set(Array.from({ length: 12 }, (_, i) => pickFeatured([deal('A', '80.00'), deal('B', '70.50'), deal('C', '10.00')], at(i))!.set_num));
    expect([...picked].sort()).toEqual(['A', 'B']);
  });

  it('looks only at the top 8', () => {
    const many = Array.from({ length: 20 }, (_, i) => deal(`S${i}`, 100 - i));
    for (let slot = 0; slot < 40; slot++) expect(Number(pickFeatured(many, at(slot))!.set_num.slice(1))).toBeLessThan(8);
  });
});
