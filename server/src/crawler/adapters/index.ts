import { config } from '../../config.js';
import type { ShopAdapter } from '../types.js';
import { ananasAdapter } from './ananas.js';
import { bigbangAdapter } from './bigbang.js';
import { ekupiAdapter } from './ekupi.js';
import { eplanetaAdapter } from './eplaneta.js';
import { kliklakAdapter } from './kliklak.js';
import { kockaAdapter } from './kocka.js';
import { kockariumAdapter } from './kockarium.js';
import { lstoreAdapter } from './lstore.js';
import { babyparkAdapter, dexyAdapter, kockalendAdapter } from './nbshop.js';
import { oddoAdapter } from './oddo.js';
import { pertiniAdapter } from './pertini.js';
import { shoppsterAdapter } from './shoppster.js';
import { tehnomanijaAdapter } from './tehnomanija.js';
import { abckockaAdapter, toyzzzAdapter } from './woocommerce.js';

/** Base URL override for one shop (config SHOP_BASE_URLS), else the adapter's default */
function baseFor(id: string): string | undefined {
  for (const pair of config.SHOP_BASE_URLS?.split(',') ?? []) {
    const [k, v] = pair.split('=').map((x) => x.trim());
    if (k === id && v) return v.replace(/\/$/, '');
  }
  return undefined;
}

export function allAdapters(): ShopAdapter[] {
  return [
    // public: everyone sees these prices
    lstoreAdapter(config.LSTORE_BASE_URL),
    kockariumAdapter(config.KOCKARIUM_BASE_URL),
    ananasAdapter(config.ANANAS_BASE_URL),
    // members only: prices shown to signed-in users
    bigbangAdapter(baseFor('bigbang')),
    ekupiAdapter(baseFor('ekupi')),
    dexyAdapter(baseFor('dexy')),
    kockalendAdapter(baseFor('kockalend')),
    kockaAdapter(baseFor('kocka')),
    tehnomanijaAdapter(baseFor('tehnomanija')),
    shoppsterAdapter(baseFor('shoppster')),
    toyzzzAdapter(baseFor('toyzzz')),
    pertiniAdapter(baseFor('pertini')),
    abckockaAdapter(baseFor('abckocka')),
    babyparkAdapter(baseFor('babypark')),
    eplanetaAdapter(baseFor('eplaneta')),
    oddoAdapter(baseFor('oddo')),
    kliklakAdapter(baseFor('kliklak')),
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
