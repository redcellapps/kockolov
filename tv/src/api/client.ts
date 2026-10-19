import type { DealsResponse, SearchResponse, SetDetail, Stats, Theme } from './types'

/** Where the API lives: https://kockolov.rs in the packaged app, a local server in development */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) || 'https://kockolov.rs'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const cache = new Map<string, { at: number; data: unknown }>()
const CACHE_MS = 5 * 60 * 1000

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  let url = API_BASE + path
  if (params) {
    const qs: string[] = []
    for (const k in params) {
      const v = params[k]
      if (v !== undefined && v !== '') qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    }
    if (qs.length) url += (url.includes('?') ? '&' : '?') + qs.join('&')
  }
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T
  const res = await fetch(url, { headers: { Accept: 'application/json', 'x-kockolov-app': 'tv' } })
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const data = (await res.json()) as T
  cache.set(url, { at: Date.now(), data })
  if (cache.size > 60) cache.delete(cache.keys().next().value as string)
  return data
}

export const api = {
  deals: (limit = 24) => get<DealsResponse>('/api/deals', { limit }),
  set: (setNum: string) => get<SetDetail>(`/api/sets/${encodeURIComponent(setNum)}`),
  themes: () => get<Theme[]>('/api/themes'),
  stats: () => get<Stats>('/api/stats'),
  search: (q: { q?: string; theme?: string; sort?: string; page?: number; size?: number }) =>
    get<SearchResponse>('/api/sets', { q: q.q, theme: q.theme, sort: q.sort, page: q.page, size: q.size ?? 48, stock: 1 }),
}

/**
 * Product pictures: squared JPEGs served by the Kockolov server (same origin as the API, CORS-friendly,
 * small enough for a TV's texture memory). Sizes: 160 (row tiles), 320 (cards), 640 (hero and set page).
 */
export function picture(setNum: string, size: 160 | 320 | 640): string {
  return `${API_BASE}/media/set/${encodeURIComponent(setNum)}.jpg?w=${size}`
}
