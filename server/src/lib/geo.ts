import geoip from 'geoip-country';
import { query } from '../db.js';

/** Two-letter country code for an IP address (null for private, local or unknown addresses) */
export function countryOf(ip: string | null | undefined): string | null {
  if (!ip) return null;
  try {
    const clean = ip.replace(/^::ffff:/i, ''); // IPv4 seen through an IPv6 socket
    return geoip.lookup(clean)?.country ?? null;
  } catch {
    return null;
  }
}

/**
 * Remember which country an account just signed in from. Only the country code is stored, never the IP.
 * Best effort: a failed lookup keeps the previous value, and an error here must never break a sign-in.
 */
export async function recordCountry(userId: number, ip: string | null | undefined): Promise<void> {
  const country = countryOf(ip);
  if (!country) return;
  try {
    await query('UPDATE users SET country = $2, country_at = now() WHERE id = $1', [userId, country]);
  } catch {
    /* ignore */
  }
}
