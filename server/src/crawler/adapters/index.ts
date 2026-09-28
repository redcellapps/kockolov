import { config } from '../../config.js';
import type { ShopAdapter } from '../types.js';
import { ananasAdapter } from './ananas.js';
import { kockariumAdapter } from './kockarium.js';
import { lstoreAdapter } from './lstore.js';

export function allAdapters(): ShopAdapter[] {
  return [
    lstoreAdapter(config.LSTORE_BASE_URL),
    kockariumAdapter(config.KOCKARIUM_BASE_URL),
    ananasAdapter(config.ANANAS_BASE_URL),
  ];
}

export function adaptersFor(ids?: string[]): ShopAdapter[] {
  const all = allAdapters();
  const wanted = ids?.length ? ids : config.CRAWLER_SHOPS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (!wanted?.length) return all;
  const unknown = wanted.filter((id) => !all.some((a) => a.shop.id === id));
  if (unknown.length) throw new Error(`Unknown shop(s): ${unknown.join(', ')}. Known: ${all.map((a) => a.shop.id).join(', ')}`);
  return all.filter((a) => wanted.includes(a.shop.id));
}
