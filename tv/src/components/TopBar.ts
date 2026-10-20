import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { t } from '../i18n'
import { onSessionChange, signedIn } from '../lib/session'

interface Item {
  id: string
  path: string
  label: string
  w: number
}

const W = 200
const W_ABOUT = 190
const GAP = 8

/** Menu items for the current sign-in state: watchlist + account for members, "Prijava" for visitors */
export function menuItems(): Item[] {
  const items: Item[] = [
    { id: 'home', path: '/', label: t('nav.home'), w: W },
    { id: 'search', path: '/pretraga', label: t('nav.search'), w: W },
    { id: 'themes', path: '/teme', label: t('nav.themes'), w: W },
  ]
  if (signedIn()) items.push({ id: 'watchlist', path: '/praceno', label: t('nav.watchlist'), w: W })
  items.push({ id: 'about', path: '/o-aplikaciji', label: t('nav.about'), w: W_ABOUT })
  items.push(signedIn() ? { id: 'account', path: '/nalog', label: t('nav.account'), w: W } : { id: 'login', path: '/prijava', label: t('nav.login'), w: W })
  return items
}

function positions(items: Item[]): number[] {
  // right-aligned: the last item ends at x = 0 (the container is mounted at the right edge)
  const out: number[] = []
  let x = 0
  for (let i = items.length - 1; i >= 0; i--) {
    x -= items[i].w
    out[i] = x
    x -= GAP
  }
  return out
}

/** Logo + the sections. Focusable: left/right choose, enter navigates, down returns focus to the page. */
export default Blits.Component('TopBar', {
  template: `
    <Element :w="1728" h="64" :x="96" :y="48">
      <Element src="assets/logo-512.png" w="56" h="56" y="4" rounded="14" />
      <Text :content="$appName" font="jakarta-extrabold" size="36" color="#ffffff" x="72" y="10" />
      <Text :content="$tagline" font="jakarta" size="22" color="#b6b2a1" x="290" y="20" :show="$items.length < 6" />
      <Element x="1728" mount="{x: 1}" y="6">
        <Element :for="(item, index) in $items" :key="$item.id" :x="$positions[$index]" :w="$item.w" h="52" rounded="26"
          :color="$$hasFocus && $focused === $index ? '#ffcf00' : ($current === $item.id ? '#2f2d23' : ($item.id === 'login' ? '#23221a' : '#00000000'))">
          <Text :content="$item.label" font="jakarta-bold" size="26"
            :color="$$hasFocus && $focused === $index ? '#16150f' : ($current === $item.id ? '#ffffff' : ($item.id === 'login' ? '#ffcf00' : '#b6b2a1'))"
            :x="$item.w / 2" y="11" mount="{x: 0.5}" />
        </Element>
      </Element>
    </Element>
  `,
  props: { current: 'home' },
  state() {
    const items = menuItems()
    return {
      items,
      positions: positions(items),
      focused: Math.max(0, items.findIndex((i) => i.id === this.current)),
      appName: t('app.name'),
      tagline: t('app.tagline'),
    }
  },
  hooks: {
    init() {
      // re-read the items when the account signs in or out
      const off = onSessionChange(() => {
        const items = menuItems()
        this.items = items
        this.positions = positions(items)
        this.focused = Math.min(this.focused, items.length - 1)
      })
      ;(this as unknown as { _offSession?: () => void })._offSession = off
    },
    destroy() {
      const off = (this as unknown as { _offSession?: () => void })._offSession
      if (off) off()
    },
    focus() {
      const i = (this.items as Item[]).findIndex((it) => it.id === this.current)
      if (i >= 0) this.focused = i
    },
  },
  input: {
    left() {
      this.focused = Math.max(0, this.focused - 1)
    },
    right() {
      this.focused = Math.min((this.items as Item[]).length - 1, this.focused + 1)
    },
    down(e) {
      this.$parent.$focus(e)
    },
    enter() {
      const item = (this.items as Item[])[this.focused]
      if (item && item.id !== this.current) this.$router.to(item.path)
    },
  },
})
