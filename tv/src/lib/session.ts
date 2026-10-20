// The signed-in account on this TV: the token from pairing, kept in localStorage, plus what the
// pages need to know about the user (name, currency). Nothing here talks to the network.

export interface SessionUser {
  name: string
  currency: 'RSD' | 'EUR'
}

const KEY = 'kockolov.tv.session'

interface Stored {
  token: string
  user: SessionUser
}

let current: Stored | null = null
let fxRate = 0 // RSD for 1 EUR, from /api/auth/me
const listeners = new Set<() => void>()

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Stored
    return s && typeof s.token === 'string' && s.user ? s : null
  } catch {
    return null
  }
}

export function loadSession(): void {
  current = read()
}

export const token = (): string | null => (current ? current.token : null)
export const user = (): SessionUser | null => (current ? current.user : null)
export const signedIn = (): boolean => current !== null

export function setSession(s: Stored | null): void {
  current = s
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    // storage may be unavailable; the session then lasts until the app is closed
  }
  listeners.forEach((fn) => fn())
}

export function updateUser(u: Partial<SessionUser>): void {
  if (!current) return
  setSession({ ...current, user: { ...current.user, ...u } })
}

export function setFxRate(rate: number): void {
  fxRate = rate > 0 ? rate : fxRate
}
export const eurRate = (): number => fxRate

/** Called when the account signs in or out; returns the unsubscribe function */
export function onSessionChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
