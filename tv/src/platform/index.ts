// The thin per-platform layer: key codes, registering extra remote keys, leaving the app.
// Everything else in the app is platform-independent.
import tizen from './tizen'
import webos from './webos'
import browser from './browser'

export type PlatformId = 'tizen' | 'webos' | 'browser'

export interface Platform {
  id: PlatformId
  /** Blits keymap additions: keyCode → input name (left/right/up/down/enter/back/0…9) */
  keymap: Record<number, string>
  /** Called once at launch (Tizen: register the number keys with tvinputdevice) */
  init(): void
  /** Close the app the way the platform expects */
  exit(): void
  /** Magic remote (LG): hover focuses, click = OK */
  pointer: boolean
}

const DIGITS: Record<number, string> = {}
for (let i = 0; i <= 9; i++) DIGITS[48 + i] = String(i) // 0–9 on the remote (and the top row of a keyboard)
for (let i = 0; i <= 9; i++) DIGITS[96 + i] = String(i) // numpad, for development

export function detectPlatform(): PlatformId {
  if (typeof window === 'undefined') return 'browser'
  const w = window as unknown as { tizen?: unknown; webOS?: unknown; PalmSystem?: unknown }
  const ua = navigator.userAgent
  if (w.tizen !== undefined || /Tizen/i.test(ua)) return 'tizen'
  if (w.webOS !== undefined || w.PalmSystem !== undefined || /Web0S|webOS/i.test(ua)) return 'webos'
  return 'browser'
}

// static imports on purpose: the legacy (ES5) build has no dynamic import, and the files are tiny
export function loadPlatform(id: PlatformId = detectPlatform()): Platform {
  if (id === 'tizen') return tizen(DIGITS)
  if (id === 'webos') return webos(DIGITS)
  return browser(DIGITS)
}
