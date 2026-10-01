import { config } from './config.js';
import { one, query } from './db.js';

/**
 * Euro exchange rate for showing prices in EUR. Prices are always stored and compared in RSD;
 * the rate only changes how they are displayed. Source: the National Bank of Serbia's middle
 * rate, read once a day from kurs.resenje.org (a free mirror of the NBS list).
 */

export interface EurRate {
  /** RSD for 1 EUR */
  rate: number;
  /** day of the NBS list, or null while only the fallback is known */
  day: string | null;
}

let cache: { value: EurRate; at: number } | null = null;

export async function eurRate(): Promise<EurRate> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.value;
  const row = await one<{ rate: number; day: string }>(
    "SELECT rate, day FROM fx_rates WHERE currency = 'EUR' ORDER BY day DESC LIMIT 1",
  );
  const value = row ? { rate: Number(row.rate), day: row.day } : { rate: config.EUR_RSD_FALLBACK, day: null };
  cache = { value, at: Date.now() };
  return value;
}

/** Fetches today's rate and stores it. Keeps the last known rate when the source is down. */
export async function refreshEurRate(log: (m: string) => void = console.log): Promise<EurRate | null> {
  try {
    const res = await fetch(config.FX_URL, {
      headers: { 'User-Agent': config.CRAWLER_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { code?: string; date?: string; exchange_middle?: number };
    const rate = Number(data.exchange_middle);
    // the dinar has been within a few percent of 117 for years; anything far off is a bad answer
    if (data.code !== 'EUR' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? '') || !(rate > 90 && rate < 150)) {
      throw new Error(`unexpected answer ${JSON.stringify(data).slice(0, 120)}`);
    }
    await query(
      `INSERT INTO fx_rates (day, currency, rate, source) VALUES ($1, 'EUR', $2, 'nbs')
       ON CONFLICT (day, currency) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = now()`,
      [data.date, rate],
    );
    cache = null;
    log(`kurs: 1 EUR = ${rate} RSD (NBS, ${data.date})`);
    return { rate, day: data.date! };
  } catch (err) {
    log(`kurs: preuzimanje nije uspelo (${(err as Error).message}); ostaje poslednji poznati kurs`);
    return null;
  }
}

/** Formats an RSD amount for someone who reads prices in `currency`. */
export function moneyFormatter(currency: 'RSD' | 'EUR', rate: number) {
  const rsdFmt = new Intl.NumberFormat('sr-RS', { maximumFractionDigits: 0 });
  const eurFmt = new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '—';
    return currency === 'EUR' ? eurFmt.format(n / rate) : `${rsdFmt.format(n)} RSD`;
  };
}
