import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { api } from '../lib/api';
import { appPlatform } from '../lib/platform';
import type { PushStatus } from '../lib/pwa';

/*
 * Notifications in the Android/iOS app, through Firebase Cloud Messaging. Loaded only inside the app.
 * The phone's Firebase token is sent to the server like a browser's push subscription.
 */

let current: string | null = null;

async function permission(): Promise<PermissionState | 'prompt-with-rationale'> {
  return (await FirebaseMessaging.checkPermissions()).receive;
}

async function register(token: string, replaces?: string | null) {
  current = token;
  await api('/api/me/push', { method: 'POST', json: { fcm: { token, platform: appPlatform ?? 'android' }, replaces: replaces ?? undefined } });
}

export async function nativePushStatus(): Promise<PushStatus> {
  try {
    const p = await permission();
    if (p === 'denied') return 'denied';
    if (p !== 'granted') return 'off';
    return localStorageFlag() ? 'on' : 'off';
  } catch {
    // no Firebase configuration in this build
    return 'unsupported';
  }
}

export async function enableNativePush(): Promise<PushStatus> {
  try {
    let p = await permission();
    if (p !== 'granted') p = (await FirebaseMessaging.requestPermissions()).receive;
    if (p !== 'granted') return p === 'denied' ? 'denied' : 'off';
    const { token } = await FirebaseMessaging.getToken();
    await register(token);
    setFlag(true);
    return 'on';
  } catch {
    return 'unsupported';
  }
}

export async function disableNativePush(): Promise<PushStatus> {
  try {
    const token = current ?? (await FirebaseMessaging.getToken()).token;
    await api('/api/me/push', { method: 'DELETE', json: { endpoint: token } }).catch(() => undefined);
    await FirebaseMessaging.deleteToken().catch(() => undefined);
  } catch {
    /* nothing registered */
  }
  current = null;
  setFlag(false);
  return 'off';
}

/** This phone's address for a sample notification */
export async function nativePushToken(): Promise<string | null> {
  try {
    return current ?? (await FirebaseMessaging.getToken()).token;
  } catch {
    return null;
  }
}

/** After sign-in: ties this phone's token to the account signed in now. */
export async function syncNativePush(): Promise<void> {
  if ((await nativePushStatus()) !== 'on') return;
  const t = await nativePushToken();
  if (t) await register(t).catch(() => undefined);
}

export async function forgetNativePush(): Promise<void> {
  const t = await nativePushToken();
  if (t) await api('/api/me/push', { method: 'DELETE', json: { endpoint: t } }).catch(() => undefined);
}

/**
 * Once at start-up: a tap on a notification opens its page, and a new token (Firebase rotates them)
 * replaces the old one on the server.
 */
export async function startNativePush(open: (path: string) => void): Promise<void> {
  try {
    await FirebaseMessaging.addListener('notificationActionPerformed', (e) => {
      const url = (e.notification.data as { url?: string } | undefined)?.url;
      if (url && url.startsWith('/')) open(url);
    });
    await FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
      if (localStorageFlag() && token !== current) void register(token, current).catch(() => undefined);
    });
  } catch {
    /* no Firebase configuration in this build */
  }
}

// whether the person turned notifications on in the app (the permission alone also covers other apps' prompts)
const FLAG = 'kl-native-push';
function localStorageFlag(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}
function setFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
}
