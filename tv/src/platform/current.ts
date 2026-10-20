import type { Platform } from './index'

let current: Platform | null = null

export function setPlatform(p: Platform) {
  current = p
}

/** The platform chosen at launch (src/index.ts) */
export function platform(): Platform {
  if (!current) throw new Error('platform not initialised')
  return current
}
