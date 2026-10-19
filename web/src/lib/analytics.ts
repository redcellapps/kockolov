import { appPlatform } from './platform';

/*
 * Visitor statistics with Umami (self-hosted, no cookies, no personal data). The page views of the site, the
 * installed site (PWA) and the Android/iOS apps all go to the same Umami website and are told apart by a tag:
 * web, pwa, app-android, app-ios. Search words and other query strings are never sent: only the path, the
 * theme and the campaign parameters (utm_*) that say where a visitor came from.
 * Off in the in-browser demo, for admins, for visitors with "Do Not Track" and while no address is set.
 */

type Umami = { track: (arg?: string | ((p: Record<string, unknown>) => Record<string, unknown>), data?: Record<string, unknown>) => void };
const umami = () => (window as unknown as { umami?: Umami }).umami;

const KEEP = new Set(['theme', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
let started = false;
let lastPath = '';
let queue: (() => void)[] = [];

function tag(): string {
  if (appPlatform) return `app-${appPlatform}`;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true ? 'pwa' : 'web';
}

/** Path plus the few query parameters that are worth keeping. */
function cleanUrl(): string {
  const q = new URLSearchParams(location.search);
  const keep = new URLSearchParams();
  for (const [k, v] of q) if (KEEP.has(k)) keep.set(k, v);
  const s = keep.toString();
  return location.pathname + (s ? `?${s}` : '');
}

let pending = false;

export function startAnalytics(cfg: { url: string; id: string } | null | undefined, isAdmin: boolean) {
  if (started || !cfg || isAdmin || import.meta.env.VITE_DEMO || typeof document === 'undefined') return;
  if (navigator.doNotTrack === '1') return;
  started = true;
  const s = document.createElement('script');
  s.defer = true;
  s.src = `${cfg.url}/script.js`;
  s.dataset.websiteId = cfg.id;
  s.dataset.hostUrl = cfg.url;
  s.dataset.autoTrack = 'false';
  s.dataset.tag = tag();
  s.onload = () => {
    const run = queue;
    queue = [];
    run.forEach((f) => f());
  };
  document.head.appendChild(s);
  // the page that was already open when the server's answer arrived
  if (pending) {
    pending = false;
    trackPage();
  }
}

function whenReady(f: () => void) {
  if (umami()) f();
  else queue.push(f);
}

/** One page view per change of address (the app is a single page, so this is called on every navigation). */
export function trackPage() {
  if (!started) {
    pending = true; // sent as soon as statistics start
    return;
  }
  const url = cleanUrl();
  if (url === lastPath) return;
  const referrer = lastPath || document.referrer;
  lastPath = url;
  whenReady(() => umami()?.track((p) => ({ ...p, hostname: 'kockolov.rs', url, referrer, title: document.title })));
}

/** A named action: sign-up, share, click to a shop. */
export function trackEvent(name: string, data?: Record<string, unknown>) {
  if (started) whenReady(() => umami()?.track(name, data));
}
