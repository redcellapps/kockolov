// The home page's featured deal rotates instead of always showing rank 1: it cycles through the
// strongest few deals of the day, one per time slot, the same for every visitor (cacheable,
// shareable) and never the same set in two consecutive slots.

export const FEATURED_POOL = 8; // look at the top N deals
export const FEATURED_MIN_SCORE = 0.6; // …but only those scoring at least 60% of the best one
export const FEATURED_SLOT_MS = 4 * 60 * 60 * 1000; // a new pick every 4 hours

/** `score` is a Postgres numeric, which pg hands over as a string */
export function pickFeatured<T extends { set_num: string; score: number | string }>(deals: T[], now: Date = new Date()): T | null {
  const pool = deals.slice(0, FEATURED_POOL);
  if (!pool.length) return null;
  const floor = Number(pool[0].score) * FEATURED_MIN_SCORE;
  const eligible = pool.filter((d, i) => i === 0 || Number(d.score) >= floor);
  const slot = Math.floor(now.getTime() / FEATURED_SLOT_MS);
  return eligible[slot % eligible.length];
}
