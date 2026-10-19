import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { picture } from '../api/client'
import { clip, discountPct, rsd, savingText } from '../lib/format'
import { t } from '../i18n'

/** The deal of the day as one big frame on the home page: picture, name, price vs LEGO Store, shop. 1728×400. */
export default Blits.Component('Hero', {
  template: `
    <Element :w="1728" h="400" rounded="28" :color="$$hasFocus ? '#2f2d23' : '#23221a'"
      :border="{w: 6, color: $$hasFocus ? '#ffcf00' : '#00000000'}">
      <!-- picture -->
      <Element x="24" y="24" w="352" h="352" rounded="22" color="#ffffff">
        <Element x="16" y="16" w="320" h="320" rounded="16" color="#f1efe6" />
        <Element :src="$src" x="16" y="16" w="320" h="320" :show="!$failed" @loaded="$onLoaded" @error="$onError" />
      </Element>
      <!-- texts -->
      <Element x="420" y="40">
        <Element w="330" h="42" rounded="21" color="#ffcf00">
          <Text :content="$label" font="jakarta-extrabold" size="22" color="#16150f" x="165" y="8" mount="{x: 0.5}" />
        </Element>
        <Text :content="$title" font="jakarta-extrabold" size="52" color="#ffffff" y="62" maxwidth="1000" maxlines="2" lineheight="60" />
        <Text :content="$subtitle" font="jakarta" size="26" color="#b6b2a1" :y="$subtitleY" />
      </Element>
      <!-- price block -->
      <Element x="420" y="262">
        <Text :content="$priceText" font="jakarta-extrabold" size="64" color="#ffcf00" y="0" @loaded="$priceLoaded" />
        <Element :show="$saving !== ''" :x="$savingX" y="18" h="44" :w="$savingW" rounded="22" color="#4ade80">
          <Text :content="$saving" font="jakarta-bold" size="24" color="#16150f" :x="$savingW / 2" y="8" mount="{x: 0.5}" @loaded="$savingLoaded" />
        </Element>
        <Text :content="$rrpText" font="jakarta" size="24" color="#b6b2a1" y="84" @loaded="$rrpLoaded" />
        <Text :content="$shopText" font="jakarta-semibold" size="24" color="#ffffff" :x="$shopX" y="84" />
      </Element>
      <!-- CTA -->
      <Element :x="1728 - 24 - 260" y="300" w="260" h="68" rounded="34" :color="$$hasFocus ? '#ffcf00' : '#2f2d23'">
        <Text :content="$cta" font="jakarta-bold" size="28" :color="$$hasFocus ? '#16150f' : '#ffffff'" x="130" y="16" mount="{x: 0.5}" />
      </Element>
    </Element>
  `,
  props: {
    setNum: '',
    name: '',
    theme: '',
    price: 0 as number | null,
    reference: 0 as number | null,
    shop: '',
    seller: '',
  },
  state() {
    return {
      failed: false,
      savingW: 420,
      savingX: 300,
      shopX: 0,
      label: t('home.top.label'),
      cta: t('home.top.cta'),
      subtitleY: 128,
    }
  },
  computed: {
    src(): string {
      return this.setNum ? picture(String(this.setNum), 640) : ''
    },
    title(): string {
      return clip(String(this.name || ''), 70)
    },
    subtitle(): string {
      const parts = [t('set.number', { num: this.setNum })]
      if (this.theme) parts.push(String(this.theme))
      return parts.join(' · ')
    },
    priceText(): string {
      return rsd(this.price as number | null)
    },
    saving(): string {
      return savingText(this.reference as number | null, this.price as number | null)
    },
    rrpText(): string {
      return discountPct(this.reference as number | null, this.price as number | null) > 0
        ? t('home.top.rrp', { amount: rsd(this.reference as number | null) })
        : ''
    },
    shopText(): string {
      if (!this.shop) return ''
      const name = this.seller ? `${this.shop} (${this.seller})` : String(this.shop)
      return t('home.top.at', { shop: name })
    },
  },
  watch: {
    setNum() {
      this.failed = false
    },
  },
  methods: {
    onLoaded() {
      this.failed = false
    },
    onError() {
      this.failed = true
    },
    savingLoaded(dim: { w: number; h: number }) {
      this.savingW = Math.round(dim.w + 40)
    },
    priceLoaded(dim: { w: number; h: number }) {
      this.savingX = Math.round(dim.w + 24)
    },
    rrpLoaded(dim: { w: number; h: number }) {
      this.shopX = this.rrpText ? Math.round(dim.w + 28) : 0
    },
  },
})
