import { config } from '../config.js';

/** Today's date (YYYY-MM-DD) in Belgrade, regardless of server timezone. */
export function todayLocal(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.TZ_NAME,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
