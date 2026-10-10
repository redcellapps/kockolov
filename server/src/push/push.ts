import webpush from 'web-push';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { sendFcm } from './fcm.js';

/** What the service worker (web/public/sw.js) turns into a notification */
export interface PushMessage {
  title: string;
  body: string;
  /** page opened by a tap, e.g. /set/75192 */
  url: string;
  /** a newer message with the same tag replaces the older one on the phone */
  tag?: string;
  /** picture next to the text (Android, Windows); iPhone always shows the app icon */
  icon?: string;
}

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  /** 'web': a browser's push address (endpoint + keys); 'fcm': the app's Firebase token (endpoint) */
  kind: 'web' | 'fcm';
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

/** For tests: replace the real sender (which talks to Google/Apple/Mozilla) */
type Sender = (sub: webpush.PushSubscription, payload: string, opts: webpush.RequestOptions) => Promise<{ statusCode: number }>;
let sender: Sender = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts);
export function setPushSender(s: Sender | null) {
  sender = s ?? ((sub, payload, opts) => webpush.sendNotification(sub, payload, opts));
}

let keys: Promise<{ publicKey: string; privateKey: string }> | null = null;

/**
 * The server's push key pair (VAPID). From the environment if set, otherwise made once and kept in the
 * database, so the web app and the worker use the same pair and phones stay subscribed across deploys.
 */
export function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  keys ??= (async () => {
    if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
      return { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY };
    }
    const made = webpush.generateVAPIDKeys();
    // whoever is first wins; the other process reads the stored pair
    await query(`INSERT INTO app_secrets (name, value) VALUES ('vapid', $1) ON CONFLICT (name) DO NOTHING`, [JSON.stringify(made)]);
    const row = await one<{ value: string }>(`SELECT value FROM app_secrets WHERE name = 'vapid'`);
    return JSON.parse(row!.value) as { publicKey: string; privateKey: string };
  })().catch((err) => {
    keys = null;
    throw err;
  });
  return keys;
}

const subject = () => config.VAPID_SUBJECT || `mailto:${config.CONTACT_EMAIL}`;

/**
 * Sends one message to one device. A device that is gone (uninstalled, permission withdrawn) is
 * removed; one that fails for other reasons is removed after 10 failures in a row.
 */
export async function sendPush(sub: PushSubscriptionRow, msg: PushMessage): Promise<'sent' | 'gone' | 'failed'> {
  if (sub.kind === 'fcm') return recordResult(sub, await sendFcm(sub.endpoint, msg).catch(() => 'failed' as const));
  const { publicKey, privateKey } = await vapidKeys();
  try {
    await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh ?? '', auth: sub.auth ?? '' } }, JSON.stringify(msg), {
      vapidDetails: { subject: subject(), publicKey, privateKey },
      // a phone that's off for a day still gets it when it comes back, but not days later
      TTL: 24 * 3600,
      urgency: 'normal',
      timeout: 15_000,
    });
    return recordResult(sub, 'sent');
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return recordResult(sub, status === 404 || status === 410 ? 'gone' : 'failed');
  }
}

async function recordResult(sub: PushSubscriptionRow, r: 'sent' | 'gone' | 'failed') {
  if (r === 'sent') await query('UPDATE push_subscriptions SET last_ok_at = now(), failures = 0 WHERE id = $1', [sub.id]);
  else if (r === 'gone') await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
  else {
    await query('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1', [sub.id]);
    await query('DELETE FROM push_subscriptions WHERE id = $1 AND failures >= 10', [sub.id]);
  }
  return r;
}

/** Sends to every device of a user (or only the given one); returns how many got it. */
export async function sendPushToUser(userId: number, msg: PushMessage, endpoint?: string) {
  const subs = await query<PushSubscriptionRow>(
    `SELECT id, user_id, kind, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 ${endpoint ? 'AND endpoint = $2' : ''}`,
    endpoint ? [userId, endpoint] : [userId],
  );
  const out = { devices: subs.length, sent: 0, gone: 0, failed: 0 };
  for (const s of subs) out[await sendPush(s, msg)]++;
  return out;
}
