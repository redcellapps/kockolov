import Blits from '@lightningjs/blits'
import App from './App'
import { fonts } from './theme'
import { loadPlatform } from './platform'
import { setPlatform } from './platform/current'

const platform = loadPlatform()
setPlatform(platform)
platform.init()

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
