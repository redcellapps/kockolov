import type { FastifyReply } from 'fastify';
import { shopLabel } from '../mail/format.js';
import { cached, readyCard, staleCard, type SetCard } from './og.js';
import { version, type SetSeo } from './pages.js';

// Link-preview cards are drawn once and kept (see og.ts). A messenger asking for a card gets it at
// once: the finished one, or — while a new version is being drawn — the last one drawn for that page.

/** "-" separates a key's parts, so it can't appear inside them (set 71051-7, theme star-wars) */
export const keyPart = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');

export function setCardFor(s: SetSeo): { card: SetCard; prefix: string; key: string; alternatives: string[] } {
  const card: SetCard = {
    setNum: s.set_num,
    name: s.name,
    theme: s.theme_name,
    imageUrl: s.image_url,
    bestPrice: s.best_price,
    refPrice: s.rrp_rsd,
    shopLabel: s.best_shop ? shopLabel(s.best_shop, s.best_seller) : null,
    shops: s.shops_in_stock,
  };
  const prefix = `set-${keyPart(s.set_num)}-`;
  return { card, prefix, key: `${prefix}${version(card)}`, alternatives: s.alt_images ?? [] };
}

function jpeg(reply: FastifyReply, buf: Buffer, maxAge: number) {
  return reply.type('image/jpeg').header('Cache-Control', `public, max-age=${maxAge}`).send(buf);
}

/** Sends the card for key right away when it can; draws it otherwise. */
export async function sendCard(reply: FastifyReply, key: string, prefix: string, make: () => Promise<Buffer>) {
  const ready = await readyCard(key);
  if (ready) return jpeg(reply, ready, 86400);
  const fresh = cached(key, make, prefix);
  const stale = await staleCard(prefix);
  if (stale) {
    fresh.catch(() => {}); // finishes in the background; the next request gets it
    return jpeg(reply, stale, 600);
  }
  return jpeg(reply, await fresh, 86400);
}
