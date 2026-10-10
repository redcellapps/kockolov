import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { config } from '../config.js';
import type { PushMessage } from './push.js';

/*
 * Notifications in the Android and iOS apps, through Firebase Cloud Messaging (HTTP v1 API).
 * Signs in with the Firebase service account (FCM_SERVICE_ACCOUNT): a short JWT is exchanged for an
 * access token, kept for its hour. No Firebase SDK needed on the server.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
let account: ServiceAccount | null | undefined;

/** The service account from FCM_SERVICE_ACCOUNT (file path, JSON or base64 JSON), or null when not set. */
export function fcmAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const raw = config.FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return (account = null);
  const text = raw.startsWith('{') ? raw : existsSync(raw) ? readFileSync(raw, 'utf8') : Buffer.from(raw, 'base64').toString('utf8');
  const a = JSON.parse(text) as ServiceAccount;
  if (!a.project_id || !a.client_email || !a.private_key) throw new Error('FCM_SERVICE_ACCOUNT nije ispravan ključ servisnog naloga');
  return (account = a);
}

export const fcmConfigured = () => {
  try {
    return fcmAccount() !== null;
  } catch {
    return false;
  }
};

let access: { token: string; until: number } | null = null;

async function accessToken(a: ServiceAccount): Promise<string> {
  if (access && access.until > Date.now() + 60_000) return access.token;
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: a.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: a.token_uri ?? TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(a.private_key).toString('base64url');
  const res = await fetch(a.token_uri ?? TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Firebase prijava nije uspela (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  access = { token: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return access.token;
}

/** The FCM message for one phone: text, the page to open, and the same tag to replace an older one. */
export function fcmMessage(token: string, msg: PushMessage) {
  const tag = msg.tag ?? 'kockolov';
  return {
    message: {
      token,
      notification: { title: msg.title, body: msg.body, ...(msg.icon ? { image: msg.icon } : {}) },
      data: { url: msg.url, tag },
      android: {
        collapse_key: tag,
        ttl: '86400s',
        notification: { tag, color: '#FFCF00', icon: 'ic_stat_kockolov', channel_id: 'cene' },
      },
      apns: {
        headers: { 'apns-collapse-id': tag.slice(0, 64) },
        payload: { aps: { 'thread-id': tag, sound: 'default' } },
      },
    },
  };
}

export type FcmSender = (token: string, msg: PushMessage) => Promise<{ status: number; error?: string }>;

const realSender: FcmSender = async (token, msg) => {
  const a = fcmAccount();
  if (!a) return { status: 503, error: 'FCM_SERVICE_ACCOUNT nije podešen' };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(a)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fcmMessage(token, msg)),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return { status: res.status };
  const body = (await res.json().catch(() => null)) as { error?: { status?: string; details?: { errorCode?: string }[] } } | null;
  return { status: res.status, error: body?.error?.details?.find((d) => d.errorCode)?.errorCode ?? body?.error?.status };
};

let sender: FcmSender = realSender;
/** For tests: replace the call to Firebase */
export function setFcmSender(s: FcmSender | null) {
  sender = s ?? realSender;
}

/**
 * The app was uninstalled or the token replaced: the phone won't get anything at this address again.
 * INVALID_ARGUMENT and SENDER_ID_MISMATCH also come from a wrong message or a server key from another
 * Firebase project; those count as failures (logged), so a setup mistake doesn't remove every phone at
 * once. A really dead token is still removed after 10 failures in a row.
 */
const GONE = new Set(['UNREGISTERED', 'NOT_FOUND']);

export async function sendFcm(token: string, msg: PushMessage): Promise<'sent' | 'gone' | 'failed'> {
  const r = await sender(token, msg);
  if (r.status >= 200 && r.status < 300) return 'sent';
  if (r.status === 404 || (r.error && GONE.has(r.error))) return 'gone';
  console.warn(`Firebase: slanje nije uspelo (${r.status}${r.error ? `, ${r.error}` : ''})`);
  return 'failed';
}
