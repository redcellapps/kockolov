import { query } from '../db.js';
import { normalizeText } from '../lib/normalize.js';

// Offers the admin doesn't want on the site: hidden one by one ('hidden') or by a phrase rule
// ('hidden_rule', e.g. "barbie" or "polovno"). Hidden offers have no set, so they show nowhere,
// and they stay out of the admin's list of unmatched offers.

export interface HideRule {
  id: number;
  phrase: string;
  shop_id: string | null;
}

export const HIDDEN_METHODS = ['hidden', 'hidden_rule'];

/** "Barbie" -> "barbie"; the same normalization as titles (no diacritics, no punctuation) */
export const normalizePhrase = (p: string) => normalizeText(p);

/** A rule hides a title that contains its phrase at the start of a word ("nerf" hides "Hasbro NERF Mega"). */
export function ruleHides(rule: Pick<HideRule, 'phrase' | 'shop_id'>, shopId: string, title: string): boolean {
  if (rule.shop_id && rule.shop_id !== shopId) return false;
  return ` ${normalizeText(title)} `.includes(` ${rule.phrase}`);
}

export async function loadRules(): Promise<HideRule[]> {
  return query<HideRule>('SELECT id, phrase, shop_id FROM hide_rules ORDER BY id');
}

/** Hides the current offers a new rule covers (manual links and offers hidden one by one stay as they are). */
export async function applyRule(rule: HideRule): Promise<{ hidden: number; hadSets: boolean }> {
  const rows = await query<{ id: number; shop_id: string; title: string; set_num: string | null }>(
    `SELECT id, shop_id, title, set_num FROM offers
      WHERE match_method IS DISTINCT FROM 'manual' AND match_method IS DISTINCT FROM 'hidden'
        AND match_method IS DISTINCT FROM 'hidden_rule' ${rule.shop_id ? 'AND shop_id = $1' : ''}`,
    rule.shop_id ? [rule.shop_id] : [],
  );
  const hit = rows.filter((r) => ruleHides(rule, r.shop_id, r.title));
  if (hit.length) {
    await query("UPDATE offers SET set_num = NULL, match_method = 'hidden_rule' WHERE id = ANY($1::bigint[])", [hit.map((r) => r.id)]);
  }
  return { hidden: hit.length, hadSets: hit.some((r) => r.set_num) };
}

/**
 * After a rule is deleted: offers it hid (and no other rule covers) go back to the review list;
 * the next crawl of their shop links them to sets again.
 */
export async function releaseRule(rule: HideRule, others: HideRule[]): Promise<number> {
  const rows = await query<{ id: number; shop_id: string; title: string }>(
    `SELECT id, shop_id, title FROM offers WHERE match_method = 'hidden_rule' ${rule.shop_id ? 'AND shop_id = $1' : ''}`,
    rule.shop_id ? [rule.shop_id] : [],
  );
  const free = rows.filter((r) => ruleHides(rule, r.shop_id, r.title) && !others.some((o) => ruleHides(o, r.shop_id, r.title)));
  if (free.length) await query('UPDATE offers SET match_method = NULL WHERE id = ANY($1::bigint[])', [free.map((r) => r.id)]);
  return free.length;
}
