import type { Platform } from './index'

// LG webOS TV. The remote's Back key arrives as keyCode 461; the number keys as 48–57 without any
// registration. The Magic Remote pointer is an ordinary mouse to the web engine, so Blits' mouse
// support (hover = focus, click = OK) covers it.
// Leaving the app: webOS.platformBack() when webOSTV.js is bundled (it is, in the .ipk), else window.close().
// Reference: webOS TV Developer → Web App → Remote Control / Back Button, webOSTV.js API.

declare const webOS: { platformBack?: () => void } | undefined

const BACK = 461

export default function webosPlatform(digits: Record<number, string>): Platform {
  return {
    id: 'webos',
    pointer: true,
    keymap: { ...digits, [BACK]: 'back' },
    init() {
      // nothing to register on webOS
    },
    exit() {
      try {
        if (typeof webOS !== 'undefined' && webOS && typeof webOS.platformBack === 'function') {
          webOS.platformBack()
          return
        }
      } catch (e) {
        console.warn('platformBack failed', e)
      }
      window.close()
    },
  }
}
