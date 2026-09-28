import { describe, expect, it } from 'vitest';
import { scoreSet } from '../src/deals/engine.js';

const offer = (id: number, shop: string, price: number, seller = '', regular: number | null = null) => ({
  id,
  set_num: '10280',
  shop_id: shop,
  seller,
  price_rsd: price,
  regular_price_rsd: regular,
});

describe('deal scoring', () => {
  it('rewards prices well below the LEGO Store price and the next offer', () => {
    const d = scoreSet({ set_num: '10280', rrp_rsd: 8999, low90: null, history_days: null }, [
      offer(1, 'lstore', 8999),
      offer(2, 'ananas', 6499, 'Spark'),
      offer(3, 'kockarium', 7590),
    ])!;
    expect(d.bestOfferId).toBe(2);
    expect(d.reasons.find((r) => r.type === 'vs_rrp')).toMatchObject({ pct: 28, amount: 2500 });
    expect(d.reasons.find((r) => r.type === 'vs_next')).toMatchObject({ amount: 1091, shop: 'kockarium' });
    expect(d.score).toBeGreaterThan(30);
  });
  it('ignores sets that are not really cheaper anywhere', () => {
    expect(
      scoreSet({ set_num: 'x', rrp_rsd: 5000, low90: null, history_days: null }, [offer(1, 'lstore', 5000), offer(2, 'kockarium', 4950)]),
    ).toBeNull();
  });
  it('drops implausible prices (likely a wrong match)', () => {
    expect(
      scoreSet({ set_num: 'x', rrp_rsd: 20000, low90: null, history_days: null }, [offer(1, 'ananas', 1500, 'Shop'), offer(2, 'lstore', 20000)]),
    ).toBeNull();
  });
  it('flags a new lowest price once there is enough history', () => {
    const d = scoreSet({ set_num: 'x', rrp_rsd: 10000, low90: 8500, history_days: 30 }, [offer(1, 'kockarium', 8000), offer(2, 'lstore', 10000)])!;
    expect(d.reasons.some((r) => r.type === 'new_low')).toBe(true);
  });
});
