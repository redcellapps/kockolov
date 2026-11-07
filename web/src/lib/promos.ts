import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { dateLong, money } from './format';
import { t } from '../i18n';

export type PromoKind = 'gift' | 'sale' | 'online_only' | 'multi_buy' | 'code' | 'other';
export type PromoStatus = 'pending' | 'approved' | 'rejected';

export interface Promo {
  id: number;
  shop_id: string;
  shop_name: string;
  kind: PromoKind;
  title: string;
  details: string;
  min_basket_rsd: number | null;
  discount_pct: number | null;
  themes: string[];
  valid_from: string | null;
  valid_until: string | null;
  source_url: string;
  source?: 'crawler' | 'manual';
  status?: PromoStatus;
  changed?: boolean;
  first_seen_at?: string;
  last_seen_at?: string;
}

export const PROMO_KINDS: PromoKind[] = ['gift', 'sale', 'online_only', 'multi_buy', 'code', 'other'];

export function usePromos() {
  return useQuery({ queryKey: ['promos'], queryFn: () => api<{ items: Promo[] }>('/api/akcije'), staleTime: 5 * 60_000 });
}

/** "Poklon za porudžbine preko 10.000 RSD · do 30. novembra 2026." */
export function promoFacts(p: Promo): string[] {
  const out: string[] = [];
  if (p.discount_pct) out.push(t('promo.fact.pct', { n: p.discount_pct }));
  if (p.min_basket_rsd) out.push(t('promo.fact.min', { amount: money(p.min_basket_rsd) }));
  if (p.themes.length) out.push(t('promo.fact.themes', { themes: p.themes.join(', ') }));
  if (p.valid_until) out.push(t('promo.fact.until', { date: dateLong(p.valid_until) }));
  return out;
}
