import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { t } from '../i18n'

const ITEMS = [
  { id: 'home', path: '/', label: t('nav.home') },
  { id: 'search', path: '/pretraga', label: t('nav.search') },
  { id: 'themes', path: '/teme', label: t('nav.themes') },
  { id: 'about', path: '/o-aplikaciji', label: t('nav.about') },
]

/** Logo + the four sections. Focusable: left/right choose, enter navigates, down returns focus to the page. */
export default Blits.Component('TopBar', {
  template: `
    <Element :w="1728" h="64" :x="96" :y="48">
      <Element src="assets/logo-512.png" w="56" h="56" y="4" rounded="14" />
      <Text :content="$appName" font="jakarta-extrabold" size="36" color="#ffffff" x="72" y="10" />
      <Text :content="$tagline" font="jakarta" size="22" color="#b6b2a1" x="290" y="20" />
      <Element x="1728" mount="{x: 1}" y="6">
        <Element :for="(item, index) in $items" :key="$item.id" :x="$positions[$index]" w="220" h="52" rounded="26"
          :color="$$hasFocus && $focused === $index ? '#ffcf00' : ($current === $item.id ? '#2f2d23' : '#00000000')">
          <Text :content="$item.label" font="jakarta-bold" size="26"
            :color="$$hasFocus && $focused === $index ? '#16150f' : ($current === $item.id ? '#ffffff' : '#b6b2a1')"
            x="110" y="11" mount="{x: 0.5}" />
        </Element>
      </Element>
    </Element>
  `,
  props: { current: 'home' },
  state() {
    const positions = ITEMS.map((_, i) => -(ITEMS.length - i) * 228 + 8)
    return {
      items: ITEMS,
      positions,
      focused: Math.max(0, ITEMS.findIndex((i) => i.id === this.current)),
      appName: t('app.name'),
      tagline: t('app.tagline'),
    }
  },
  hooks: {
    focus() {
      const i = ITEMS.findIndex((it) => it.id === this.current)
      if (i >= 0) this.focused = i
    },
  },
  input: {
    left() {
      this.focused = Math.max(0, this.focused - 1)
    },
    right() {
      this.focused = Math.min(ITEMS.length - 1, this.focused + 1)
    },
    down(e) {
      this.$parent.$focus(e)
    },
    enter() {
      const item = ITEMS[this.focused]
      if (item.id !== this.current) this.$router.to(item.path)
    },
  },
})
