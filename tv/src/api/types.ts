// Shapes of the Kockolov REST API as the TV app reads them (server/src/api/routes/catalog.ts).

export interface Reason {
  type: 'vs_rrp' | 'vs_next' | 'new_low' | string
  pct?: number
  amount?: number
  shop?: string
  seller?: string
  days?: number
}

export interface Deal {
  day: string
  rank: number
  score: number
  best_price_rsd: number
  reference_price_rsd: number | null
  reasons: Reason[]
  set_num: string
  name: string
  theme_slug: string | null
  theme_name: string | null
  image_url: string | null
  rrp_rsd: number | null
  age_min: number | null
  best_shop: string | null
  best_seller: string | null
  best_url: string | null
  best_shop_name: string | null
  offers_in_stock: number
}

export interface DealsResponse {
  day: string | null
  items: Deal[]
}

export interface SetSummary {
  set_num: string
  name: string
  theme_slug: string | null
  theme_name: string | null
  image_url: string | null
  rrp_rsd: number | null
  age_min: number | null
  best_price: number | null
  any_price: number | null
  offers_in_stock: number
  shops_in_stock: number
  shops: string[]
  shop_sale: boolean
  best_shop: string | null
  best_seller: string | null
  best_offer_id: number | null
  discount_pct: number
  deal_score: number | null
  deal_rank: number | null
}

export interface SearchResponse {
  total: number
  page: number
  size: number
  sort: string
  items: SetSummary[]
  facets: { themes: { slug: string; count: number }[]; shops: { shop_id: string; count: number }[] }
}

export interface Theme {
  slug: string
  name: string
  count: number
  image_url: string | null
}

export interface Offer {
  id: number
  shop_id: string
  shop_name: string
  shop_kind: 'official' | 'shop' | 'marketplace' | string
  seller: string
  title: string
  url: string
  image_url: string | null
  price_rsd: number
  regular_price_rsd: number | null
  in_stock: boolean
  stock_qty: number | null
  last_seen: string
  price_changed_at: string
  match_method: string
}

export interface HistoryPoint {
  offer_id: number
  price_rsd: number
  in_stock: boolean
  recorded_at: string
}

export interface SetDetail {
  set: {
    set_num: string
    name: string
    name_en: string | null
    theme_slug: string | null
    theme_name: string | null
    year: number | null
    pieces: number | null
    age_min: number | null
    image_url: string | null
    rrp_rsd: number | null
    created_at: string
  }
  offers: Offer[]
  history: HistoryPoint[]
  stats: { lowest_ever: number | null; lowest_30d: number | null; tracked_since: string | null } | null
  deal: { day: string; rank: number; score: number; best_price_rsd: number; reference_price_rsd: number | null; reasons: Reason[] } | null
  related: SetSummary[]
  watched: boolean
  hidden_offers: number
  hidden_shops: number
}

export interface Shop {
  id: string
  name: string
  url: string
  kind: string
  members_only: boolean
  offers_in_stock: number
  sellers: number
  last_crawl: string | null
}

export interface Stats {
  sets_in_stock: number
  offers_in_stock: number
  shops: number
  sellers: number
  last_update: string | null
  deals_today: number
  members_shops: number
  members_offers: number
}

export interface AuthMe {
  user: { id: number; email: string; name: string; role: string; currency: 'RSD' | 'EUR' } | null
  publicMode: boolean
  fx: { eur: { rate: number; day: string | null } }
}

export interface Pairing {
  code: string
  secret: string
  expiresIn: number
  url: string
}

export interface PairStatus {
  status: 'pending' | 'confirmed' | 'expired'
  token?: string
  user?: { name: string; currency: 'RSD' | 'EUR' }
}

export interface WatchedSet extends SetSummary {
  watched_since: string | null
  seen_price: number | null
}

export interface WatchlistResponse {
  items: WatchedSet[]
}
