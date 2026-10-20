import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api, clearCache } from '../api/client'
import { t } from '../i18n'
import { qrDataUrl } from '../lib/qr'
import { setSession, setFxRate } from '../lib/session'
import { setDisplayCurrency } from '../lib/format'
import { platform } from '../platform/current'
import TopBar from '../components/TopBar'

const POLL_MS = 3000

/**
 * "Prijava": the TV shows a 6-character code and a QR to kockolov.rs/tv?kod=…; the user confirms on
 * the phone; the TV polls until it gets its token, then goes to the home page as a member.
 */
export default Blits.Component('Pair', {
  components: { TopBar },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <TopBar ref="nav" current="login" />
      <Text :content="$title" font="jakarta-extrabold" size="48" color="#ffffff" x="96" y="150" />
      <Text :content="$intro" font="jakarta" size="26" color="#b6b2a1" x="96" y="220" maxwidth="1000" lineheight="38" />
      <!-- the code -->
      <Element :show="$state === 'code'" x="96" y="340" w="760" h="200" rounded="28" color="#23221a">
        <Text :content="$codeText" font="jakarta-extrabold" size="120" color="#ffcf00" x="380" y="28" mount="{x: 0.5}" letterspacing="14" />
      </Element>
      <Text :show="$state === 'code'" :content="$status" font="jakarta-semibold" size="24" color="#b6b2a1" x="96" y="570" />
      <Element :show="$state === 'code'" x="96" y="572" w="24" h="24" rounded="6" color="#ffcf00" :alpha="$blink" :x="$statusX" />
      <Text :show="$state === 'code'" :content="$expires" font="jakarta" size="22" color="#7d7a6c" x="96" y="612" />
      <!-- expired / error -->
      <Element :show="$state === 'expired' || $state === 'error'" x="96" y="340" w="760" h="200" rounded="28" color="#23221a">
        <Text :content="$state === 'error' ? $errorText : $expiredText" font="jakarta-semibold" size="28" color="#f87171" x="40" y="40" maxwidth="680" lineheight="38" />
        <Element x="40" y="120" w="260" h="60" rounded="30" color="#ffcf00">
          <Text :content="$newCode" font="jakarta-bold" size="26" color="#16150f" x="130" y="14" mount="{x: 0.5}" />
        </Element>
      </Element>
      <!-- done -->
      <Element :show="$state === 'done'" x="96" y="340" w="760" h="200" rounded="28" color="#23221a">
        <Text :content="$doneText" font="jakarta-extrabold" size="34" color="#4ade80" x="40" y="48" maxwidth="680" lineheight="44" />
      </Element>
      <!-- QR -->
      <Element :show="$state === 'code'" x="1480" y="150" w="344" h="400" rounded="26" color="#ffffff">
        <Element :src="$qr" x="32" y="32" w="280" h="280" />
        <Text :content="$qrLink" font="jakarta-bold" size="22" color="#16150f" x="172" y="330" mount="{x: 0.5}" />
      </Element>
      <Text :content="$benefit" font="jakarta" size="24" color="#b6b2a1" x="96" y="700" maxwidth="1200" lineheight="34" />
      <Text :content="$noAccount" font="jakarta" size="22" color="#7d7a6c" x="96" y="780" maxwidth="1200" lineheight="32" />
    </Element>
  `,
  state() {
    return {
      state: 'loading' as 'loading' | 'code' | 'expired' | 'error' | 'done',
      code: '',
      secret: '',
      qr: '',
      expiresAt: 0,
      expires: '',
      blink: 1,
      statusX: 0,
      pollTimer: null as ReturnType<typeof setTimeout> | null,
      title: t('pair.title'),
      intro: t('pair.intro'),
      status: t('pair.waiting'),
      expiredText: t('pair.expired'),
      errorText: t('pair.error'),
      newCode: t('pair.new'),
      doneText: '',
      benefit: t('pair.benefit'),
      noAccount: t('pair.noAccount'),
    }
  },
  computed: {
    codeText(): string {
      return this.code ? `${this.code.slice(0, 3)} ${this.code.slice(3)}` : ''
    },
    qrLink(): string {
      return 'kockolov.rs/tv'
    },
  },
  hooks: {
    ready() {
      this.start()
      this.$setInterval(() => {
        if (this.state !== 'code') return
        this.blink = this.blink ? 0.2 : 1
        const left = Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 60000))
        this.expires = t('pair.expires', { min: left })
        if (Date.now() > this.expiresAt) this.state = 'expired'
      }, 1000)
    },
    focus() {
      // the page itself holds the focus only when there is a button to press
      if (this.state !== 'expired' && this.state !== 'error') this.$select('nav').$focus()
    },
    destroy() {
      if (this.pollTimer) clearTimeout(this.pollTimer)
    },
  },
  methods: {
    async start() {
      this.state = 'loading'
      try {
        const p = await api.pair(platform().id)
        this.code = p.code
        this.secret = p.secret
        this.expiresAt = Date.now() + p.expiresIn * 1000
        this.expires = t('pair.expires', { min: Math.ceil(p.expiresIn / 60) })
        this.state = 'code'
        qrDataUrl(p.url, 560).then((qr) => {
          this.$setTimeout(() => {
            this.qr = qr
          }, 50)
        })
        this.poll()
      } catch (e) {
        this.$log.error('pair', e)
        this.state = 'error'
      }
    },
    poll() {
      if (this.pollTimer) clearTimeout(this.pollTimer)
      this.pollTimer = this.$setTimeout(async () => {
        if (this.state !== 'code') return
        try {
          const r = await api.pairStatus(this.code, this.secret)
          if (r.status === 'confirmed' && r.token && r.user) {
            setSession({ token: r.token, user: r.user })
            clearCache()
            await this.applyAccount()
            this.doneText = t('pair.done', { name: r.user.name })
            this.state = 'done'
            this.$setTimeout(() => this.$router.to('/'), 2000)
            return
          }
          if (r.status === 'expired') {
            this.state = 'expired'
            return
          }
        } catch (e) {
          const status = (e as { status?: number }).status
          if (status === 404) {
            this.state = 'expired'
            return
          }
          // network hiccup: keep polling
        }
        this.poll()
      }, POLL_MS)
    },
    async applyAccount() {
      try {
        const me = await api.me()
        if (me.user) {
          setFxRate(me.fx.eur.rate)
          setDisplayCurrency(me.user.currency, me.fx.eur.rate)
        }
      } catch (e) {
        this.$log.warn('me', e)
      }
    },
  },
  watch: {
    state(v: string) {
      if (v === 'expired' || v === 'error') this.$focus()
      else if (v === 'code') this.$select('nav').$focus()
    },
  },
  input: {
    enter() {
      if (this.state === 'expired' || this.state === 'error') this.start()
    },
    up() {
      this.$select('nav').$focus()
    },
    down() {},
    left() {},
    right() {},
  },
})
