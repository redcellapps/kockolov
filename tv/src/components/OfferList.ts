import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import OfferRow from './OfferRow'
import { t, tn } from '../i18n'

export interface OfferItem {
  key: string
  shop: string
  seller: string
  price: number
  inStock: boolean
  cheapest: boolean
}

const ROW_H = 72
const GAP = 10

/** The offers of a set, cheapest first; up/down move through them, the list scrolls after `visible` rows. */
export default Blits.Component('OfferList', {
  components: { OfferRow },
  template: `
    <Element :w="$w" :h="$h">
      <Text :content="$title" font="jakarta-bold" size="34" color="#ffffff" />
      <Text :content="$moreText" font="jakarta" size="20" color="#b6b2a1" :x="$w" y="12" mount="{x: 1}" />
      <Element y="56" :w="$w + 20" :h="$h - 56" x="-10" clipping="true">
        <Element :y.transition="{value: $listY, duration: 200, easing: 'ease-out'}" x="10">
          <OfferRow :for="(item, index) in $items" :key="$item.key" ref="row" :y="$index * 82"
            :shop="$item.shop" :seller="$item.seller" :price="$item.price" :inStock="$item.inStock" :cheapest="$item.cheapest" :w="$w" />
        </Element>
      </Element>
    </Element>
  `,
  props: { items: [] as OfferItem[], w: 1000, h: 400, visible: 4 },
  state() {
    return { focused: 0, title: t('set.offers.title') }
  },
  computed: {
    listY(): number {
      const first = Math.max(0, Math.min(this.focused - (this.visible - 1), (this.items as OfferItem[]).length - this.visible))
      return 4 - first * (ROW_H + GAP)
    },
    moreText(): string {
      const hidden = (this.items as OfferItem[]).length - this.visible
      return hidden > 0 ? tn('set.offers.more', hidden) : ''
    },
  },
  hooks: {
    focus() {
      this.$trigger('focused')
    },
  },
  watch: {
    focused(v: number) {
      const el = this.$select('row' + v)
      if (el && el.$focus) el.$focus()
    },
  },
  input: {
    up(e) {
      if (this.focused > 0) this.focused--
      else this.$parent.$focus(e)
    },
    down(e) {
      if (this.focused < (this.items as OfferItem[]).length - 1) this.focused++
      else this.$parent.$focus(e)
    },
    enter() {
      // nothing to buy on a TV: the QR code opens the set on the phone
    },
  },
})
