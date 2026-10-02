/**
 * Who is looking: anonymous visitors (and search engines, link previews) see the public shops;
 * signed-in users also see the members-only shops. Each audience has its own best-buy list.
 */
export type Audience = 'public' | 'members';

export const audienceOf = (user: unknown): Audience => (user ? 'members' : 'public');

/** Table (or view) with the offers this audience may see. Fixed identifiers, safe to interpolate. */
export const offersFor = (a: Audience) => (a === 'members' ? 'offers' : 'public_offers');

/** SQL condition selecting the latest best-buy list for this audience (alias optional). */
export const latestDeals = (a: Audience, alias = '') => {
  const col = alias ? `${alias}.` : '';
  return `${col}audience = '${a}' AND ${col}day = (SELECT max(day) FROM deals WHERE audience = '${a}')`;
};
