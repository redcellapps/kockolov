import type { AuthMe, DealsResponse, PairStatus, Pairing, SearchResponse, SetDetail, Shop, Stats, Theme, WatchlistResponse } from './types'
import { token } from '../lib/session'

/**
 * Where the API lives: https://kockolov.rs in the packaged app (no VITE_API_BASE), another server in
 * development (VITE_API_BASE=http://localhost:8080), or the page's own origin for `vite preview` with its
 * proxy (any value that is not an http(s) URL, e.g. VITE_API_BASE=/ — Git Bash on Windows rewrites "/"
 * into "C:/Program Files/Git/", which is why "not a URL" rather than "/" is the test).
 */
function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE as string | undefined
  if (raw === undefined || raw === '') return 'https://kockolov.rs'
  return /^https?:\/\//.test(raw) ? raw.replace(/\/$/, '') : ''
}
export const API_BASE: string = apiBase()

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

/** Forget cached answers (after signing in/out, or after changing the watchlist) */
export function clearCache(prefix = ''): void {
  for (const k of Array.from(cache.keys())) if (k.includes(prefix)) cache.delete(k)
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', 'x-kockolov-app': 'tv' }
  const t = token()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

function withParams(path: string, params?: Record<string, string | number | undefined>): string {
  let url = API_BASE + path
  if (params) {
    const qs: string[] = []
    for (const k in params) {
      const v = params[k]
      if (v !== undefined && v !== '') qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    }
    if (qs.length) url += (url.includes('?') ? '&' : '?') + qs.join('&')
  }
  return url
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>, cached = true): Promise<T> {
  const url = withParams(path, params)
  // answers differ for members, so the cache key carries the sign-in state
  const key = (token() ? 'm|' : 'p|') + url
  const hit = cached ? cache.get(key) : undefined
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const data = (await res.json()) as T
  if (cached) {
    cache.set(key, { at: Date.now(), data })
    if (cache.size > 60) cache.delete(cache.keys().next().value as string)
  }
  return data
}

async function send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { ...headers(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  return (await res.json()) as T
}

export const api = {
  deals: (limit = 24) => get<DealsResponse>('/api/deals', { limit }),
  set: (setNum: string) => get<SetDetail>(`/api/sets/${encodeURIComponent(setNum)}`),
  themes: () => get<Theme[]>('/api/themes'),
  stats: () => get<Stats>('/api/stats'),
  shops: () => get<Shop[]>('/api/shops'),
  search: (q: { q?: string; theme?: string; sort?: string; page?: number; size?: number }) =>
    get<SearchResponse>('/api/sets', { q: q.q, theme: q.theme, sort: q.sort, page: q.page, size: q.size ?? 48, stock: 1 }),
  // account
  me: () => get<AuthMe>('/api/auth/me', undefined, false),
  pair: (platform: string) => send<Pairing>('POST', '/api/tv/pair', { platform }),
  pairStatus: (code: string, secret: string) => get<PairStatus>(`/api/tv/pair/${encodeURIComponent(code)}`, { secret }, false),
  logout: () => send<{ ok: true }>('POST', '/api/auth/logout'),
  watchlist: () => get<WatchlistResponse>('/api/me/watchlist', undefined, false),
  watch: (setNum: string) => send<{ ok: true; watched: boolean }>('PUT', `/api/me/watchlist/${encodeURIComponent(setNum)}`),
  unwatch: (setNum: string) => send<{ ok: true; watched: boolean }>('DELETE', `/api/me/watchlist/${encodeURIComponent(setNum)}`),
}

/**
 * Product pictures: squared JPEGs served by the Kockolov server (same origin as the API, CORS-friendly,
 * small enough for a TV's texture memory). Sizes: 160 (row tiles), 320 (cards), 640 (hero and set page).
 */
export function picture(setNum: string, size: 160 | 320 | 640): string {
  return `${API_BASE}/media/set/${encodeURIComponent(setNum)}.jpg?w=${size}`
}
