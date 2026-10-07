import { config } from '../config.js';
import { query } from '../db.js';
import { setCardFor } from './cards.js';
import { cached, readyCard, renderSetCard } from './og.js';
import { loadSet } from './pages.js';

// Prepares the link-preview image of every set on the public site ahead of time, so the first person
// to share a set already gets its picture (messengers don't wait for a card to be drawn). After the
// first round only cards whose price, picture or shop changed are drawn again.

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
let running = false;

export async function warmSetCards(opts: { log?: (m: string) => void; pauseMs?: number } = {}): Promise<{ total: number; drawn: number; failed: number }> {
  const log = opts.log ?? (() => {});
  if (running || !config.PUBLIC_MODE) return { total: 0, drawn: 0, failed: 0 };
  running = true;
  try {
    // today's best buys first: those are the links people share most
    const sets = await query<{ set_num: string }>(
      `SELECT o.set_num FROM public_offers o
         LEFT JOIN deals d ON d.set_num = o.set_num AND d.audience = 'public' AND d.day = (SELECT max(day) FROM deals WHERE audience = 'public')
        WHERE o.active AND o.in_stock AND o.set_num IS NOT NULL
        GROUP BY o.set_num ORDER BY min(d.rank) NULLS LAST, o.set_num`,
    );
    let drawn = 0;
    let failed = 0;
    for (const { set_num } of sets) {
      const s = await loadSet(set_num);
      if (!s) continue;
      const { card, key, prefix, alternatives } = setCardFor(s);
      if (await readyCard(key)) continue;
      try {
        await cached(key, () => renderSetCard(card, alternatives), prefix);
        drawn++;
      } catch (err) {
        failed++;
        log(`kartica za ${set_num}: ${(err as Error).message}`);
      }
      await pause(opts.pauseMs ?? 150); // leave the CPU to visitors
    }
    if (drawn || failed) log(`slike za deljenje: ${drawn} nacrtano, ${failed} neuspešno, ${sets.length} setova ukupno`);
    return { total: sets.length, drawn, failed };
  } finally {
    running = false;
  }
}

/** Starts the rounds: shortly after start, then every OG_WARM_MINUTES (new prices after the morning crawl). */
export function startCardWarmup(log: (m: string) => void): void {
  if (!config.PUBLIC_MODE || config.OG_WARM_MINUTES <= 0) return;
  const round = () => void warmSetCards({ log }).catch((err) => log(`slike za deljenje: ${(err as Error).message}`));
  setTimeout(round, 30_000).unref();
  setInterval(round, config.OG_WARM_MINUTES * 60_000).unref();
}
