import type { HistoryPoint } from '../api/types'

export interface DayPoint {
  day: string // YYYY-MM-DD
  price: number // lowest in-stock price recorded that day, over all offers
}

/**
 * The price chart shows one number per day: the cheapest in-stock price any shop asked that day.
 * Only the last `days` days; days without a record repeat the previous value so the line stays whole.
 */
export function dailyLowest(history: HistoryPoint[], days = 90, now: Date = new Date()): DayPoint[] {
  const byDay = new Map<string, number>()
  for (const h of history) {
    if (!h.in_stock || !h.price_rsd) continue
    const day = h.recorded_at.slice(0, 10)
    const cur = byDay.get(day)
    if (cur === undefined || h.price_rsd < cur) byDay.set(day, h.price_rsd)
  }
  if (byDay.size === 0) return []
  const keys = Array.from(byDay.keys()).sort()
  const first = keys[0]
  const out: DayPoint[] = []
  let last = byDay.get(first)!
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  const firstDate = new Date(first + 'T00:00:00Z')
  const from = firstDate > start ? firstDate : start
  for (let d = new Date(from); d <= end; d = new Date(d.getTime() + 86400000)) {
    const key = d.toISOString().slice(0, 10)
    const v = byDay.get(key)
    if (v !== undefined) last = v
    out.push({ day: key, price: last })
  }
  return out
}

/** Rounds a price axis to "nice" bounds: (5752, 7799) → [5000, 8000] */
export function niceRange(min: number, max: number): [number, number] {
  if (min === max) {
    min = Math.round(min * 0.9)
    max = Math.round(max * 1.1)
  }
  const span = max - min
  const step = Math.pow(10, Math.floor(Math.log10(span || 1)))
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step]
}
