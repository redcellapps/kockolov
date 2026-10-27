import Blits from '@lightningjs/blits'
import App from './App'
import { fonts } from './theme'
import { loadPlatform } from './platform'
import { setPlatform } from './platform/current'
import { loadSession, setFxRate, setSession, signedIn, updateUser } from './lib/session'
import { setDisplayCurrency } from './lib/format'
import { api } from './api/client'

const platform = loadPlatform()
setPlatform(platform)
platform.init()

// the account paired earlier: check the token still works and pick up the currency + today's rate
loadSession()
if (signedIn()) {
  api
    .me()
    .then((me) => {
      if (!me.user) {
        setSession(null) // removed from the account page, or expired
        return
      }
      updateUser({ name: me.user.name, currency: me.user.currency })
      setFxRate(me.fx.eur.rate)
      setDisplayCurrency(me.user.currency, me.fx.eur.rate)
    })
    .catch(() => {
      // offline: keep the stored session, prices stay in RSD until the next start
    })
}

const font = (family: string, file: string) => ({
  family,
  type: 'msdf' as const,
  file: `fonts/${file}.ttf`, // not shipped; the atlases below are generated once (fonts-src/generate.mjs)
  json: `fonts/${file}.msdf.json`,
  png: `fonts/${file}.msdf.png`,
})

Blits.Launch(App, 'app', {
  w: 1920,
  h: 1080,
  debugLevel: import.meta.env.DEV ? 1 : 0,
  renderQuality: 'high',
  canvasColor: '#16150f',
  defaultFont: fonts.regular,
  fonts: [
    font(fonts.regular, 'PlusJakartaSans-Regular'),
    font(fonts.semibold, 'PlusJakartaSans-SemiBold'),
    font(fonts.bold, 'PlusJakartaSans-Bold'),
    font(fonts.extrabold, 'PlusJakartaSans-ExtraBold'),
  ],
  keymap: platform.keymap,
  inputThrottle: 0,
  holdTimeout: 50,
  enableMouse: false,
  // keep texture memory modest: a 2018 TV has little to spare
  gpuMemory: { max: 160, target: 0.75, cleanupInterval: 5000, baseline: 20, strict: false },
})
