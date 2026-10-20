import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api, clearCache } from '../api/client'
import { t } from '../i18n'
import { setSession, user } from '../lib/session'
import { setDisplayCurrency } from '../lib/format'
import TopBar from '../components/TopBar'

/** "Nalog": who is signed in, the currency, and the only action a TV needs — sign this TV out. */
export default Blits.Component('Account', {
  components: { TopBar },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <TopBar ref="nav" current="account" />
      <Text :content="$title" font="jakarta-extrabold" size="48" color="#ffffff" x="96" y="150" />
      <Element x="96" y="240" w="900" h="300" rounded="28" color="#23221a">
        <Text :content="$who" font="jakarta-bold" size="32" color="#ffffff" x="40" y="40" />
        <Text :content="$currency" font="jakarta" size="26" color="#b6b2a1" x="40" y="96" />
        <Text :content="$hint" font="jakarta" size="22" color="#7d7a6c" x="40" y="146" maxwidth="820" lineheight="32" />
        <Element x="40" y="212" w="340" h="64" rounded="32" :color="$$hasFocus ? '#ffcf00' : '#2f2d23'"
          :scale.transition="{value: $$hasFocus ? 1.04 : 1, duration: 160}">
          <Text :content="$logout" font="jakarta-bold" size="26" :color="$$hasFocus ? '#16150f' : '#ffffff'" x="170" y="16" mount="{x: 0.5}" />
        </Element>
        <Text :content="$logoutHint" font="jakarta" size="20" color="#7d7a6c" x="400" y="232" />
      </Element>
    </Element>
  `,
  state() {
    const u = user()
    return {
      title: t('account.title'),
      who: t('account.signedInAs', { name: u ? u.name : '' }),
      currency: t('account.currency', { currency: u ? u.currency : 'RSD' }),
      hint: t('account.hint'),
      logout: t('account.logout'),
      logoutHint: t('account.logout.hint'),
    }
  },
  hooks: {
    focus() {
      // the sign-out button is the page itself
    },
  },
  methods: {
    async signOut() {
      try {
        await api.logout()
      } catch (e) {
        this.$log.warn('logout', e)
      }
      setSession(null)
      setDisplayCurrency('RSD', 1)
      clearCache()
      this.$router.to('/')
    },
  },
  input: {
    enter() {
      this.signOut()
    },
    up() {
      this.$select('nav').$focus()
    },
    down() {},
    left() {},
    right() {},
  },
})
