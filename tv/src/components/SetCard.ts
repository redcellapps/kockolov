import Blits from '@lightningjs/blits'
import { card } from '../theme'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { picture } from '../api/client'
import { clip, money } from '../lib/format'
import { t, tn } from '../i18n'

/** One LEGO set in a row or grid: picture, name, best price, discount badge. 280×360. */
export default Blits.Component('SetCard', {
  template: `
    <Element :w="$w" :h="$h" :rounded="20" :color="$$hasFocus ? '#2f2d23' : '#23221a'"
      :scale.transition="{value: $$hasFocus ? 1.04 : 1, duration: 160}"
      :border="{w: 6, color: $$hasFocus ? '#ffcf00' : '#00000000'}">
      <!-- picture box -->
      <Element x="16" y="16" :w="$w - 32" h="200" rounded="14" color="#ffffff">
        <Element x="12" y="12" :w="$w - 56" h="176" rounded="10" color="#f1efe6" />
        <Element :src="$src" x="12" y="12" :w="$w - 56" h="176" :show="!$failed" @loaded="$onLoaded" @error="$onError" />
      </Element>
      <!-- discount badge -->
      <Element :show="$discount > 0" x="26" y="26" w="88" h="40" rounded="12" color="#ffcf00">
        <Text :content="$discountText" font="jakarta-extrabold" size="24" color="#16150f" x="44" y="6" mount="{x: 0.5}" />
      </Element>
      <!-- name, two lines max -->
      <Text :content="$title" font="jakarta-semibold" size="24" color="#ffffff" x="20" y="224" :maxwidth="$w - 40" maxlines="2" lineheight="30" />
      <!-- price -->
      <Text :content="$priceText" font="jakarta-extrabold" size="30" color="#ffcf00" x="20" y="288" />
      <Text :content="$note || $meta" font="jakarta" size="20" :color="$note ? ($cheaper ? '#4ade80' : '#b6b2a1') : '#b6b2a1'" x="20" y="324" :maxwidth="$w - 40" maxlines="1" />
    </Element>
  `,
  props: {
    setNum: '',
    name: '',
    price: 0 as number | null,
    reference: 0 as number | null,
    discount: 0,
    offers: 0,
    note: '', // replaces the meta line (the watchlist shows the price change here)
    cheaper: false,
    w: card.w,
    h: card.h,
  },
  state() {
    return { failed: false }
  },
  computed: {
    src(): string {
      return this.setNum ? picture(String(this.setNum), 320) : ''
    },
    title(): string {
      return clip(String(this.name || ''), 44)
    },
    priceText(): string {
      return money(this.price as number | null)
    },
    discountText(): string {
      return t('card.discount', { pct: this.discount })
    },
    meta(): string {
      const parts: string[] = [t('set.number', { num: this.setNum })]
      if (this.offers) parts.push(tn('card.offers', Number(this.offers)))
      return parts.join(' · ')
    },
  },
  methods: {
    onLoaded() {
      this.failed = false
    },
    onError() {
      this.failed = true
    },
  },
})
