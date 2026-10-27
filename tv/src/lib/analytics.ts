import { platform } from '../platform/current'

/*
 * Visitor statistics for the TV app: the same self-hosted Umami as the site, no cookies, no personal data.
 * The TV talks to Umami's send endpoint directly (no tracker script on a TV), tagged tv-tizen / tv-webos
 * so the pages opened on televisions can be told apart from the site, the installed site and the phone apps.
 * Only the route is sent (e.g. /set/75192), never a search query; the hostname is kockolov.rs like on the
 * site so everything lands in one Umami website. Off until the server hands out an address (/api/auth/me).
 */

export interface AnalyticsConfig {
  url: string
  id: string
}

let cfg: AnalyticsConfig | null = null
let lastPath = ''
let pendingPath = ''

export function configureAnalytics(c: AnalyticsConfig | null | undefined): void {
  cfg = c && c.url && c.id ? { url: c.url.replace(/\/$/, ''), id: c.id } : null
  if (cfg && pendingPath) {
    const p = pendingPath
    pendingPath = ''
    trackPage(p)
  }
}

export function analyticsOn(): boolean {
  return cfg !== null
}

/** The tag Umami groups the views by: tv-tizen, tv-webos (tv-browser while developing) */
export function analyticsTag(): string {
  return `tv-${platform().id}`
}

function post(payload: Record<string, unknown>): void {
  if (!cfg) return
  try {
    fetch(`${cfg.url}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'event', payload: { website: cfg.id, hostname: 'kockolov.rs', screen: '1920x1080', language: 'sr', tag: analyticsTag(), ...payload } }),
    }).catch(() => {
      // statistics are never allowed to disturb the app
    })
  } catch {
    // old TV without fetch: no statistics
  }
}

/** '#/set/72046?x=1' → '/set/72046': the route only, as the same page is addressed on the site */
export function cleanPath(path: string): string {
  const p = path.replace(/^#/, '').split('?')[0].toLowerCase()
  return p.startsWith('/') ? p : `/${p}`
}

/** One page view per route change; the first one waits until the address arrives from the server */
export function trackPage(path: string): void {
  const url = cleanPath(path)
  if (!cfg) {
    pendingPath = url
    return
  }
  if (url === lastPath) return
  const referrer = lastPath
  lastPath = url
  post({ url, referrer, title: 'Kockolov TV' })
}

/** A named action, e.g. the TV got paired with an account */
export function trackEvent(name: string, data?: Record<string, unknown>): void {
  post({ url: lastPath || '/', name, data })
}
