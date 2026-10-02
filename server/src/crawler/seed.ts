import { query, type Queryable, pool } from '../db.js';
import { THEMES } from '../lib/themes.js';
import { allAdapters } from './adapters/index.js';

/** Keep shops and themes tables in sync with code (idempotent, runs at every start). */
export async function seedReferenceData(db: Queryable = pool): Promise<void> {
  for (const a of allAdapters()) {
    await query(
      `INSERT INTO shops (id, name, url, kind, members_only) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, kind = EXCLUDED.kind, members_only = EXCLUDED.members_only`,
      [a.shop.id, a.shop.name, a.shop.url, a.shop.kind, !!a.shop.membersOnly],
      db,
    );
  }
  let i = 0;
  for (const t of THEMES) {
    await query(
      `INSERT INTO themes (slug, name, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [t.slug, t.name, i++],
      db,
    );
  }
}
