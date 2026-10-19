import { describe, expect, it } from 'vitest'
import { dailyLowest, niceRange } from '../src/lib/history'

describe('dailyLowest', () => {
  const now = new Date('2026-10-05T12:00:00Z')
  it('takes the cheapest in-stock price per day and fills gaps', () => {
    const pts = dailyLowest(
      [
        { offer_id: 1, price_rsd: 8000, in_stock: true, recorded_at: '2026-10-01T05:30:00Z' },
        { offer_id: 2, price_rsd: 7000, in_stock: true, recorded_at: '2026-10-01T05:31:00Z' },
        { offer_id: 2, price_rsd: 6000, in_stock: false, recorded_at: '2026-10-02T05:30:00Z' },
        { offer_id: 1, price_rsd: 7500, in_stock: true, recorded_at: '2026-10-03T05:30:00Z' },
      ],
      90,
      now,
    )
    expect(pts.map((p) => `${p.day}:${p.price}`)).toEqual([
      '2026-10-01:7000',
      '2026-10-02:7000',
      '2026-10-03:7500',
      '2026-10-04:7500',
      '2026-10-05:7500',
    ])
  })
  it('limits to the last N days', () => {
    const pts = dailyLowest([{ offer_id: 1, price_rsd: 100, in_stock: true, recorded_at: '2026-01-01T00:00:00Z' }], 3, now)
    expect(pts.length).toBe(3)
    expect(pts[0].day).toBe('2026-10-03')
  })
  it('is empty without in-stock records', () => {
    expect(dailyLowest([{ offer_id: 1, price_rsd: 100, in_stock: false, recorded_at: '2026-10-01T00:00:00Z' }], 90, now)).toEqual([])
  })
})

describe('niceRange', () => {
  it('rounds to round numbers', () => {
    expect(niceRange(5752, 7799)).toEqual([5000, 8000])
    expect(niceRange(100, 100)).toEqual([90, 110])
  })
})
