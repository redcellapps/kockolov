/*
 * Where the web app runs: in a browser (kockolov.rs), or inside the Android/iOS app, which shows the
 * same pages from the phone (capacitor://localhost, https://localhost) and calls the API at kockolov.rs.
 * The native bridge puts window.Capacitor in place before any script runs, so this is known at once.
 */

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };
const cap = (typeof window !== 'undefined' ? (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor : undefined) ?? undefined;

/** Inside the Android/iOS app */
export const isApp: boolean = !!cap?.isNativePlatform?.();
export const appPlatform: 'android' | 'ios' | null = isApp ? (cap?.getPlatform?.() === 'ios' ? 'ios' : 'android') : null;

/** The API's address: the same site in a browser, kockolov.rs (or VITE_API_BASE) in the app */
export const API_BASE: string = isApp ? (import.meta.env.VITE_API_BASE ?? 'https://kockolov.rs').replace(/\/$/, '') : '';

/** A server path (/media/…) as a full address the app can load */
export const serverUrl = (u: string): string => (isApp && u.startsWith('/') ? `${API_BASE}${u}` : u);

// ---- the app's sign-in token, kept on the phone ----

const TOKEN_KEY = 'kockolov.token';
let token: string | null = null;

// A Capacitor plugin object must never be the result of an async function: awaiting it asks for its
// .then, which the plugin proxy treats as a native method ("Preferences.then() is not implemented").
// So the module is imported and the plugin used right there.

/** Reads the saved token before the first API call (app only). */
export async function loadAppToken(): Promise<void> {
  if (!isApp) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    token = (await Preferences.get({ key: TOKEN_KEY })).value;
  } catch {
    token = null;
  }
}

export const appToken = () => token;

export async function setAppToken(t: string | null): Promise<void> {
  token = t;
  if (!isApp) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await (t ? Preferences.set({ key: TOKEN_KEY, value: t }) : Preferences.remove({ key: TOKEN_KEY }));
  } catch {
    /* kept in memory for this run */
  }
}
