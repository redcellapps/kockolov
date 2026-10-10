import { useSyncExternalStore } from 'react';
import { api } from './api';
import { appPlatform, isApp } from './platform';

/*
 * Installable site + push notifications, browser side.
 * The service worker (public/sw.js) runs only in the real build: not in `vite dev` and not in the demo.
 */

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export interface PwaState {
  /** Chrome/Edge/Samsung offered to install the site: our own button can show the prompt */
  canInstall: boolean;
  /** opened from the home screen (installed app) */
  standalone: boolean;
  /** iPhone or iPad: install only through Share → Add to Home Screen, push only after that */
  ios: boolean;
  /** this browser can receive push notifications right now */
  pushSupported: boolean;
}

const enabled = !import.meta.env.VITE_DEMO && typeof window !== 'undefined';
let deferred: InstallPromptEvent | null = null;
let state: PwaState = read();
const listeners = new Set<() => void>();

function read(): PwaState {
  // the Android/iOS app: already "installed", notifications through Firebase
  if (isApp) return { canInstall: false, standalone: true, ios: appPlatform === 'ios', pushSupported: true };
  if (!enabled) return { canInstall: false, standalone: false, ios: false, pushSupported: false };
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.userAgent.includes('Macintosh') && nav.maxTouchPoints > 1);
  return {
    canInstall: deferred !== null,
    standalone: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
    ios,
    pushSupported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  };
}

function emit() {
  state = read();
  listeners.forEach((l) => l());
}

/** Called once at start-up: registers the service worker and listens for the install offer. */
export function startPwa() {
  if (!enabled || isApp) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // no automatic mini-bar: the site shows its own button where it makes sense
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Shows the browser's install dialog; true when the user accepted. */
export async function installApp(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === 'accepted';
}

// ---- push notifications ----

export type PushStatus = 'unsupported' | 'denied' | 'off' | 'on';

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!state.pushSupported) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

const native = () => import('../native/push');

/** Whether this device gets notifications (and whether it still can). */
export async function pushStatus(): Promise<PushStatus> {
  if (isApp) return (await native()).nativePushStatus();
  const reg = await registration();
  if (!reg) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = Notification.permission === 'granted' ? await reg.pushManager.getSubscription() : null;
  return sub ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

/** Asks for permission (must follow a tap), subscribes this device and tells the server. */
export async function enablePush(): Promise<PushStatus> {
  if (isApp) return (await native()).enableNativePush();
  const reg = await registration();
  if (!reg) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const { key } = await api<{ key: string }>('/api/push/key');
  const appKey = keyBytes(key);
  let sub = await reg.pushManager.getSubscription();
  // a subscription made with an older server key can't receive anything any more
  if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
  await api('/api/me/push', { method: 'POST', json: { subscription: sub.toJSON() } });
  return 'on';
}

/** Stops notifications on this device (other devices keep theirs). */
export async function disablePush(): Promise<PushStatus> {
  if (isApp) return (await native()).disableNativePush();
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await api('/api/me/push', { method: 'DELETE', json: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  }
  return reg ? 'off' : 'unsupported';
}

/**
 * Re-sends this device's subscription after sign-in, so the server ties it to the account
 * that is signed in now (the phone may have been used with another account before).
 */
export async function syncPush(): Promise<void> {
  if (isApp) return (await native()).syncNativePush();
  if ((await pushStatus()) !== 'on') return;
  const sub = await (await registration())!.pushManager.getSubscription();
  if (sub) await api('/api/me/push', { method: 'POST', json: { subscription: sub.toJSON() } }).catch(() => undefined);
}

/** Before signing out: this device stops getting the account's notifications. */
export async function forgetPushOnSignOut(): Promise<void> {
  if (isApp) return (await native()).forgetNativePush();
  const reg = await registration().catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (sub) await api('/api/me/push', { method: 'DELETE', json: { endpoint: sub.endpoint } }).catch(() => undefined);
}

/** This device's address for a sample notification (browser endpoint, or the app's Firebase token). */
export async function pushAddress(): Promise<string | undefined> {
  if (isApp) return (await (await native()).nativePushToken()) ?? undefined;
  const reg = await registration();
  return (await reg?.pushManager.getSubscription())?.endpoint;
}
