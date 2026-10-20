import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api } from '../api/client'
import { t } from '../i18n'
import { qrDataUrl } from '../lib/qr'
import { platform } from '../platform/current'
import TopBar from '../components/TopBar'

const PRIVACY_URL = 'https://kockolov.rs/privatnost'
const PLATFORM_NAMES: Record<string, string> = { tizen: 'Samsung Tizen', webos: 'LG webOS', browser: 'pregledač' }

/** Short description, LEGO® notice, privacy QR, version. Only the top bar takes focus. */
export default Blits.Component('About', {
  components: { TopBar },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <TopBar ref="nav" current="about" />
      <Element x="96" y="150">
        <Element src="assets/logo-512.png" w="120" h="120" rounded="28" />
        <Text :content="$appName" font="jakarta-extrabold" size="56" color="#ffffff" x="150" y="12" />
        <Text :content="$tagline" font="jakarta" size="28" color="#b6b2a1" x="150" y="80" />
        <Text :content="$text" font="jakarta" size="28" color="#ffffff" y="190" maxwidth="1180" lineheight="42" />
        <Text :content="$shopsText" font="jakarta" size="24" color="#b6b2a1" y="350" maxwidth="1180" lineheight="34" />
        <Text :content="$legal" font="jakarta" size="20" color="#7d7a6c" y="470" maxwidth="1180" lineheight="28" />
        <Text :content="$contact" font="jakarta-semibold" size="24" color="#ffcf00" y="560" />
        <Text :content="$credit" font="jakarta" size="22" color="#b6b2a1" y="600" />
        <Text :content="$version" font="jakarta" size="20" color="#7d7a6c" y="640" />
      </Element>
      <!-- privacy QR -->
      <Element x="1480" y="150" w="344" h="420" rounded="26" color="#ffffff">
        <Element :src="$qr" x="32" y="32" w="280" h="280" />
        <Text :content="$privacy" font="jakarta-bold" size="26" color="#16150f" x="172" y="326" mount="{x: 0.5}" />
        <Text :content="$privacyHint" font="jakarta" size="18" color="#5d5a4c" x="172" y="364" mount="{x: 0.5}" />
      </Element>
    </Element>
  `,
  state() {
    return {
      qr: '',
      shopsText: '',
      appName: t('app.name'),
      tagline: t('app.tagline'),
      text: t('about.text'),
      legal: t('about.legal'),
      privacy: t('about.privacy'),
      privacyHint: t('about.privacy.hint'),
      contact: t('about.contact'),
      credit: t('about.credit'),
      version: t('about.version', { version: __APP_VERSION__, platform: PLATFORM_NAMES[platform().id] || platform().id }),
    }
  },
  hooks: {
    ready() {
      // hooks stay synchronous: an async ready() left the page at the transition's starting alpha
      qrDataUrl(PRIVACY_URL, 560).then((qr) => {
        this.$setTimeout(() => {
          this.qr = qr
        }, 50)
      })
      this.load()
    },
    focus() {
      this.$select('nav').$focus()
    },
  },
  methods: {
    async load() {
      try {
        const [shops, stats] = await Promise.all([api.shops(), api.stats()])
        this.shopsText = t('about.shops', { shops: shops.map((s) => s.name).join(', '), more: stats.members_shops })
      } catch (e) {
        this.$log.warn('about', e)
      }
    },
  },
  input: {
    down() {},
    left() {},
    right() {},
  },
})
