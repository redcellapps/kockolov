import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { rsd } from '../lib/format'
import { t } from '../i18n'

/** One shop's offer: name (and marketplace seller), stock, price. Focusable row, 1000×72. */
export default Blits.Component('OfferRow', {
  template: `
    <Element :w="$w" h="72" rounded="16" :color="$$hasFocus ? '#2f2d23' : '#23221a'"
      :border="{w: 6, color: $$hasFocus ? '#ffcf00' : '#00000000'}">
      <Element x="22" y="28" w="16" h="16" rounded="8" :color="$inStock ? '#4ade80' : '#7d7a6c'" />
      <Text :content="$shopText" font="jakarta-bold" size="26" color="#ffffff" x="56" y="20" :maxwidth="$w - 600" maxlines="1" />
      <Element :show="$cheapest" :x="$w - 560" y="20" w="150" h="34" rounded="17" color="#ffcf00">
        <Text :content="$cheapestText" font="jakarta-extrabold" size="18" color="#16150f" x="75" y="7" mount="{x: 0.5}" />
      </Element>
      <Text :content="$stockText" font="jakarta" size="20" :color="$inStock ? '#b6b2a1' : '#7d7a6c'" :x="$w - 230" y="24" mount="{x: 1}" />
      <Text :content="$priceText" font="jakarta-extrabold" size="30" :color="$inStock ? '#ffffff' : '#7d7a6c'" :x="$w - 24" y="16" mount="{x: 1}" />
    </Element>
  `,
  props: { shop: '', seller: '', price: 0, inStock: true, cheapest: false, w: 1000 },
  computed: {
    shopText(): string {
      return this.seller ? `${this.shop} · ${this.seller}` : String(this.shop)
    },
    priceText(): string {
      return rsd(Number(this.price))
    },
    stockText(): string {
      return this.inStock ? t('set.offers.inStock') : t('set.offers.outOfStock')
    },
    cheapestText(): string {
      return t('set.offers.cheapest')
    },
  },
})
