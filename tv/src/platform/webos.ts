import type { Platform } from './index'

// LG webOS TV (webostv.developer.lge.com → Guides → Remote Control, Back Button):
// - Back on the Magic Remote is keyCode 461 (0x1CD); appinfo.json has disableBackHistoryAPI: true,
//   so the app receives it instead of the platform walking the DOM history
// - the number keys arrive as 48–57 without registration
// - an app with its own exit dialog closes with window.close(); webOS.platformBack() (webOSTV.js)
//   is only for handing Back to the platform, which we don't do
// - the Magic Remote pointer is a mouse to the web engine; v1 ignores it (arrows work)

const BACK = 461

export default function webosPlatform(digits: Record<number, string>): Platform {
  return {
    id: 'webos',
    pointer: false,
    keymap: { ...digits, [BACK]: 'back' },
    init() {
      // nothing to register on webOS
    },
    exit() {
      window.close()
    },
  }
}
