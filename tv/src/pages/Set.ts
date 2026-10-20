import Blits from '@lightningjs/blits'
import { card, safe } from '../theme'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api, picture } from '../api/client'
import type { SetDetail, SetSummary } from '../api/types'
import { clip, discountPct, rsd } from '../lib/format'
import { dailyLowest, type DayPoint } from '../lib/history'
import { qrDataUrl } from '../lib/qr'
import { t } from '../i18n'
import TopBar from '../components/TopBar'
import Status from '../components/Status'
import OfferList, { type OfferItem } from '../components/OfferList'
import PriceChart from '../components/PriceChart'
import Row, { type RowItem } from '../components/Row'

const SITE = 'https://kockolov.rs'
const NAV = 0
const OFFERS = 1
const RELATED = 2
const RELATED_Y = 1080

export function offersToList(d: SetDetail): OfferItem[] {
  const inStock = d.offers.filter((o) => o.in_stock).sort((a, b) => a.price_rsd - b.price_rsd)
  const out = d.offers.filter((o) => !o.in_stock).sort((a, b) => a.price_rsd - b.price_rsd)
  const best = inStock[0]?.price_rsd
  return [...inStock, ...out].map((o) => ({
    key: String(o.id),
    shop: o.shop_name,
    seller: o.seller || '',
    price: o.price_rsd,
    inStock: o.in_stock,
    cheapest: o.in_stock && o.price_rsd === best,
  }))
}

export function summaryToCard(s: SetSummary): RowItem {
  return {
    key: s.set_num,
    setNum: s.set_num,
    name: s.name,
    price: s.best_price,
    reference: s.rrp_rsd,
    discount: s.discount_pct || discountPct(s.rrp_rsd, s.best_price),
    offers: s.offers_in_stock,
  }
}

export default Blits.Component('SetPage', {
  components: { TopBar, Status, OfferList, PriceChart, Row },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <Status :show="$status !== 'ready'" :state="$status" />
      <Element :y.transition="{value: $scrollY, duration: 260, easing: 'ease-out'}">
        <TopBar ref="nav" current="" />
        <Element :show="$status === 'ready'">
        <!-- picture -->
        <Element x="96" y="140" w="460" h="460" rounded="26" color="#ffffff">
          <Element x="20" y="20" w="420" h="420" rounded="18" color="#f1efe6" />
          <Element :src="$src" x="20" y="20" w="420" h="420" :show="!$failed" @loaded="$onLoaded" @error="$onError" />
        </Element>
        <!-- texts -->
        <Element x="596" y="140">
          <Element :show="$theme !== ''" w="0" h="40" :w="$themeW" rounded="20" color="#2f2d23">
            <Text :content="$theme" font="jakarta-bold" size="20" color="#ffffff" x="18" y="8" @loaded="$themeLoaded" />
          </Element>
          <Text :content="$numberText" font="jakarta-semibold" size="22" color="#b6b2a1" :x="$themeW + 18" y="8" />
          <Text :content="$dealText" font="jakarta-bold" size="22" color="#ffcf00" :x="$dealX" y="8" />
          <Text :content="$title" font="jakarta-extrabold" size="50" color="#ffffff" y="58" maxwidth="960" maxlines="2" lineheight="58" />
          <Text :content="$bestLabel" font="jakarta-semibold" size="22" color="#b6b2a1" y="196" />
          <Text :content="$priceText" font="jakarta-extrabold" size="68" color="#ffcf00" y="222" @loaded="$priceLoaded" />
          <Text :content="$atText" font="jakarta" size="26" color="#ffffff" :x="$atX" y="256" maxwidth="560" maxlines="1" />
          <Element :show="$saving !== ''" y="318" h="48" :w="$savingW" rounded="24" color="#4ade80">
            <Text :content="$saving" font="jakarta-bold" size="24" color="#16150f" :x="$savingW / 2" y="10" mount="{x: 0.5}" @loaded="$savingLoaded" />
          </Element>
          <Text :content="$rrpText" font="jakarta" size="24" color="#b6b2a1" y="386" />
          <Text :content="$lowText" font="jakarta" size="22" color="#7d7a6c" y="424" />
        </Element>
        <!-- QR -->
        <Element x="1600" y="140" w="224" h="300" rounded="22" color="#ffffff">
          <Element :src="$qr" x="12" y="12" w="200" h="200" />
          <Text :content="$qrTitle" font="jakarta-bold" size="22" color="#16150f" x="112" y="226" mount="{x: 0.5}" />
          <Text :content="$qrLink" font="jakarta" size="16" color="#5d5a4c" x="112" y="258" mount="{x: 0.5}" />
        </Element>
        <!-- offers + chart -->
        <OfferList ref="offers" x="96" y="636" :items="$offers" w="1000" h="396" visible="4" />
        <PriceChart x="1140" y="636" w="684" h="384" :points="$points" :reference="$reference" />
        <!-- related -->
        <Row ref="related" :show="$related.length > 0" x="96" y="1080" :title="$relatedTitle" :items="$related" kind="SetCard"
          cardW="280" cardH="360" h="456" />
        <Text :content="$disclaimer" font="jakarta" size="18" color="#7d7a6c" x="96" :y="1536" />
        </Element>
      </Element>
    </Element>
  `,
  props: { setnum: '' }, // lowercase: the router lowercases paths and param names
  state() {
    return {
      status: 'loading' as 'loading' | 'error' | 'ready',
      section: OFFERS,
      failed: false,
      name: '',
      theme: '',
      themeW: 0,
      dealRank: 0,
      price: null as number | null,
      reference: null as number | null,
      shop: '',
      lowestEver: null as number | null,
      lowest30: null as number | null,
      offers: [] as OfferItem[],
      points: [] as DayPoint[],
      related: [] as RowItem[],
      qr: '',
      atX: 300,
      savingW: 420,
      bestLabel: t('set.bestPrice'),
      qrTitle: t('set.qr.title'),
      disclaimer: t('set.disclaimer'),
      relatedTitle: '',
    }
  },
  computed: {
    src(): string {
      return this.setnum ? picture(String(this.setnum), 640) : ''
    },
    title(): string {
      return clip(this.name, 80)
    },
    numberText(): string {
      return t('set.number', { num: this.setnum })
    },
    dealText(): string {
      return this.dealRank ? t('set.dealToday', { rank: this.dealRank }) : ''
    },
    dealX(): number {
      return this.themeW + 18 + String(this.numberText).length * 12 + 24
    },
    priceText(): string {
      return rsd(this.price)
    },
    atText(): string {
      return this.shop ? t('set.at', { shop: this.shop }) : ''
    },
    saving(): string {
      const pct = discountPct(this.reference, this.price)
      if (!pct || !this.reference || !this.price) return ''
      return t('set.youSave', { amount: rsd(this.reference - this.price), pct })
    },
    rrpText(): string {
      return this.reference ? t('set.rrp', { amount: rsd(this.reference) }) : t('set.rrp.unknown')
    },
    lowText(): string {
      const parts: string[] = []
      if (this.lowestEver) parts.push(t('set.lowestEver', { amount: rsd(this.lowestEver) }))
      if (this.lowest30 && this.lowest30 !== this.lowestEver) parts.push(t('set.lowest30', { amount: rsd(this.lowest30) }))
      return parts.join(' · ')
    },
    qrLink(): string {
      return `kockolov.rs/set/${this.setnum}`
    },
    scrollY(): number {
      return this.section === RELATED ? -(RELATED_Y + card.h + 76 + 48 - safe.bottom) : 0
    },
  },
  hooks: {
    ready() {
      this.$listen('select', (item: RowItem) => {
        if (item.setNum) this.$router.to(`/set/${item.setNum}`)
      })
      this.load()
    },
    focus() {
      // while loading, park the focus on the top bar so keys don't land on the previous (kept-alive) page
      if (this.status === 'ready') this.focusSection()
      else this.$select('nav').$focus()
    },
  },
  watch: {
    section() {
      this.focusSection()
    },
    status(v: string) {
      if (v === 'ready') this.$setTimeout(() => this.focusSection(), 0)
    },
  },
  methods: {
    async load() {
      this.status = 'loading'
      try {
        const setNum = String(this.setnum)
        const [d, qr] = await Promise.all([api.set(setNum), qrDataUrl(`${SITE}/set/${setNum}`, 400)])
        this.name = d.set.name
        this.theme = d.set.theme_name || ''
        this.themeW = this.theme ? 0 : -18
        this.dealRank = d.deal?.rank || 0
        this.reference = d.set.rrp_rsd
        const list = offersToList(d)
        this.offers = list
        const best = list.find((o) => o.inStock)
        this.price = best ? best.price : null
        this.shop = best ? (best.seller ? `${best.shop} (${best.seller})` : best.shop) : ''
        this.lowestEver = d.stats?.lowest_ever ?? null
        this.lowest30 = d.stats?.lowest_30d ?? null
        this.points = dailyLowest(d.history, 90)
        this.related = d.related.map(summaryToCard)
        this.relatedTitle = t('set.related', { theme: this.theme })
        this.status = 'ready'
        // set the QR texture once the page is shown: a texture given to a hidden node is sometimes never loaded
        this.$setTimeout(() => {
          this.qr = qr
        }, 50)
      } catch (e) {
        this.$log.error('set', e)
        this.status = 'error'
      }
    },
    focusSection() {
      const ref = this.section === NAV ? 'nav' : this.section === OFFERS ? 'offers' : 'related'
      const el = this.$select(ref)
      if (el && el.$focus) el.$focus()
    },
    onLoaded() {
      this.failed = false
    },
    onError() {
      this.failed = true
    },
    themeLoaded(dim: { w: number }) {
      this.themeW = Math.round(dim.w + 36)
    },
    priceLoaded(dim: { w: number }) {
      this.atX = Math.round(dim.w + 20)
    },
    savingLoaded(dim: { w: number }) {
      this.savingW = Math.round(dim.w + 44)
    },
  },
  input: {
    up() {
      if (this.section > NAV) this.section--
      else this.focusSection()
    },
    down() {
      let next = this.section
      if (this.status === 'ready' && this.section < RELATED) next++
      if (next === RELATED && this.related.length === 0) next = this.section
      if (next !== this.section) this.section = next
      else this.focusSection()
    },
    enter() {
      if (this.status === 'error') this.load()
    },
    left() {},
    right() {},
  },
})
