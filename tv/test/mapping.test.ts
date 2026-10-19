import { describe, expect, it } from 'vitest'
import { dealToCard, themeToCard } from '../src/pages/Home'
import { offersToList, summaryToCard } from '../src/pages/Set'
import type { Deal, SetDetail, SetSummary } from '../src/api/types'

const deal: Deal = {
  day: '2026-10-19', rank: 1, score: 55, best_price_rsd: 5752, reference_price_rsd: 7799, reasons: [],
  set_num: '72046', name: 'Game Boy™', theme_slug: 'super-mario', theme_name: 'Super Mario', image_url: null,
  rrp_rsd: 7799, age_min: 18, best_shop: 'kockarium', best_seller: '', best_url: '', best_shop_name: 'Kockarium', offers_in_stock: 4,
}

describe('API → cards', () => {
  it('deal of the day → card', () => {
    expect(dealToCard(deal)).toEqual({ key: '72046', setNum: '72046', name: 'Game Boy™', price: 5752, reference: 7799, discount: 26, offers: 4 })
  })
  it('theme → tile', () => {
    expect(themeToCard({ slug: 'city', name: 'City', count: 17, image_url: null })).toEqual({ key: 'city', slug: 'city', name: 'City', count: 17 })
  })
  it('search row → card (uses the API discount)', () => {
    const s = { set_num: '1', name: 'X', rrp_rsd: 1000, best_price: 800, offers_in_stock: 2, discount_pct: 20 } as SetSummary
    expect(summaryToCard(s)).toMatchObject({ key: '1', price: 800, discount: 20, offers: 2 })
  })
  it('offers: in stock first, cheapest first, cheapest marked', () => {
    const d = {
      offers: [
        { id: 1, shop_name: 'LEGO® Store Srbija', seller: '', price_rsd: 7799, in_stock: true },
        { id: 2, shop_name: 'Ananas', seller: 'Spark', price_rsd: 7699, in_stock: true },
        { id: 3, shop_name: 'Kockarium', seller: '', price_rsd: 5000, in_stock: false },
        { id: 4, shop_name: 'Kockarium', seller: '', price_rsd: 5752, in_stock: true },
      ],
    } as unknown as SetDetail
    expect(offersToList(d).map((o) => `${o.shop}${o.seller ? '/' + o.seller : ''}:${o.price}:${o.inStock ? 's' : 'n'}:${o.cheapest ? '*' : ''}`)).toEqual([
      'Kockarium:5752:s:*',
      'Ananas/Spark:7699:s:',
      'LEGO® Store Srbija:7799:s:',
      'Kockarium:5000:n:',
    ])
  })
})
