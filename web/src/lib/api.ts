export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** machine-readable reason from the server, e.g. 'unconfirmed' */
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Greška ${res.status}`, data?.code);
  return data as T;
}

export type Reason =
  | { type: 'vs_rrp'; pct: number; amount: number }
  | { type: 'vs_next'; pct: number; amount: number; shop: string; seller: string }
  | { type: 'shop_sale'; pct: number }
  | { type: 'new_low'; days: number }
  | { type: 'only_offer' };

export interface SetSummary {
  set_num: string;
  name: string;
  theme_slug: string | null;
  theme_name: string | null;
  image_url: string | null;
  rrp_rsd: number | null;
  age_min: number | null;
  best_price: number | null;
  any_price: number | null;
  offers_in_stock: number;
  shops_in_stock: number;
  shops: string[];
  shop_sale: boolean;
  best_shop: string | null;
  best_seller: string | null;
  best_offer_id: number | null;
  discount_pct: number;
  deal_score: number | null;
  deal_rank: number | null;
}

export interface SearchResponse {
  total: number;
  page: number;
  size: number;
  sort: string;
  items: SetSummary[];
  facets: { themes: { slug: string | null; count: number }[]; shops: { id: string; count: number }[] };
}

export interface Offer {
  id: number;
  shop_id: string;
  shop_name: string;
  shop_kind: string;
  seller: string;
  title: string;
  url: string;
  image_url: string | null;
  price_rsd: number;
  regular_price_rsd: number | null;
  in_stock: boolean;
  stock_qty: number | null;
  last_seen: string;
  price_changed_at: string;
  match_method: string | null;
}

export interface HistoryPoint {
  offer_id: number;
  price_rsd: number;
  in_stock: boolean;
  recorded_at: string;
}

export interface SetDetail {
  set: {
    set_num: string;
    name: string;
    name_en: string | null;
    theme_slug: string | null;
    theme_name: string | null;
    year: number | null;
    pieces: number | null;
    age_min: number | null;
    image_url: string | null;
    rrp_rsd: number | null;
    created_at: string;
  };
  offers: Offer[];
  history: HistoryPoint[];
  stats: { lowest_ever: number | null; lowest_30d: number | null; tracked_since: string | null } | null;
  deal: { day: string; rank: number; score: number; best_price_rsd: number; reference_price_rsd: number | null; reasons: Reason[] } | null;
  related: SetSummary[];
  watched: boolean;
}

export interface Deal {
  day: string;
  rank: number;
  score: number;
  best_price_rsd: number;
  reference_price_rsd: number | null;
  reasons: Reason[];
  set_num: string;
  name: string;
  theme_slug: string | null;
  theme_name: string | null;
  image_url: string | null;
  rrp_rsd: number | null;
  age_min: number | null;
  best_shop: string | null;
  best_seller: string | null;
  best_url: string | null;
  best_shop_name: string | null;
  offers_in_stock: number;
}

export interface Theme {
  slug: string;
  name: string;
  count: number;
  image_url: string | null;
}

export interface Shop {
  id: string;
  name: string;
  url: string;
  kind: string;
  offers_in_stock: number;
  sellers: number;
  last_crawl: string | null;
}

export interface Stats {
  sets_in_stock: number;
  offers_in_stock: number;
  shops: number;
  sellers: number;
  last_update: string | null;
  deals_today: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  digest_enabled: boolean;
  currency?: 'RSD' | 'EUR';
}

export interface MeResponse {
  user: User | null;
  publicMode: boolean;
  registrationOpen: boolean;
  /** NBS middle rate: RSD for 1 EUR (day is null while only the fallback is known) */
  fx?: { eur: { rate: number; day: string | null } };
}
