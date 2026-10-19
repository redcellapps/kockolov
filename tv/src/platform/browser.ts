import type { Platform } from './index'

// Development in a desktop browser: Escape and Backspace act as the remote's Back key,
// the mouse stands in for LG's Magic Remote.

export default function browserPlatform(digits: Record<number, string>): Platform {
  return {
    id: 'browser',
    pointer: true,
    keymap: { ...digits, 27: 'back', 8: 'back' },
    init() {},
    exit() {
      window.close()
    },
  }
}
