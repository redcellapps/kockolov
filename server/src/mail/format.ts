// Formatting helpers shared by e-mails (the web app has its own copy in web/src/lib/format.ts)
import { allAdapters } from '../crawler/adapters/index.js';

/** Short names where they differ from the shop's own name in its adapter */
export const SHOP_NAMES: Record<string, string> = {
  lstore: 'LEGO® Store',
  kockarium: 'Kockarium',
  ananas: 'Ananas',
};

let adapterNames: Map<string, string> | null = null;
/** Display name of a shop: the short name above, else the adapter's name, else the id. */
export function shopName(id: string): string {
  if (SHOP_NAMES[id]) return SHOP_NAMES[id];
  adapterNames ??= new Map(allAdapters().map((a) => [a.shop.id, a.shop.name]));
  return adapterNames.get(id) ?? id;
}

export function rsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${new Intl.NumberFormat('sr-RS', { maximumFractionDigits: 0 }).format(n)} RSD`;
}

export function shopLabel(shop: string, seller?: string | null): string {
  const name = shopName(shop);
  return seller ? `${name} · ${seller}` : name;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type Reason =
  | { type: 'vs_rrp'; pct: number; amount: number }
  | { type: 'vs_next'; pct: number; amount: number; shop: string; seller: string }
  | { type: 'shop_sale'; pct: number }
  | { type: 'new_low'; days: number }
  | { type: 'only_offer' };

export function reasonText(r: Reason, money: (n: number) => string = rsd): string {
  switch (r.type) {
    case 'vs_rrp':
      return `${r.pct}% jeftinije nego u LEGO® Store-u (ušteda ${money(r.amount)})`;
    case 'vs_next':
      return `${money(r.amount)} jeftinije od sledeće ponude (${shopLabel(r.shop, r.seller)})`;
    case 'shop_sale':
      return `Na akciji −${r.pct}%`;
    case 'new_low':
      return 'Najniža cena otkako pratimo ovaj set';
    default:
      return '';
  }
}
