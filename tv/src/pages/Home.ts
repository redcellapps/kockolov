import Blits from '@lightningjs/blits'
import { safe } from '../theme'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api } from '../api/client'
import type { Deal, Theme } from '../api/types'
import { discountPct, displayCurrency, num, relativeDay } from '../lib/format'
import { t } from '../i18n'
import TopBar from '../components/TopBar'
import Hero from '../components/Hero'
import Row, { type RowItem } from '../components/Row'
import Status from '../components/Status'
import ExitDialog from '../components/ExitDialog'
import { platform } from '../platform/current'
import { signedIn } from '../lib/session'
import { watchedToCard } from './Watchlist'

// Sections top to bottom; up/down moves between them, the page slides so the active one is in view
const NAV = 0
const HERO = 1
const DEALS = 2
const WATCHED = 3 // only when a watched set got cheaper (members)
const THEMES = 4

export function dealToCard(d: Deal): RowItem {
  return {
    key: d.set_num,
    setNum: d.set_num,
    name: d.name,
    price: d.best_price_rsd,
    reference: d.reference_price_rsd ?? d.rrp_rsd,
    discount: discountPct(d.reference_price_rsd ?? d.rrp_rsd, d.best_price_rsd),
    offers: d.offers_in_stock,
  }
}

export function themeToCard(th: Theme): RowItem {
  return { key: th.slug, slug: th.slug, name: th.name, count: th.count }
}

export default Blits.Component('Home', {
  components: { TopBar, Hero, Row, Status, ExitDialog },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <Element :alpha="$exiting ? 0.25 : 1">
        <Status :show="$status !== 'ready'" :state="$status" />
        <Element :y.transition="{value: $scrollY, duration: 260, easing: 'ease-out'}">
          <TopBar ref="nav" current="home" />
          <Element :show="$status === 'ready'">
          <Hero ref="hero" x="96" y="140"
            :setNum="$top.setNum" :name="$top.name" :theme="$top.theme" :price="$top.price"
            :reference="$top.reference" :shop="$top.shop" :seller="$top.seller" />
          <Row ref="deals" x="96" y="580" :title="$dealsTitle" :items="$deals" kind="SetCard"
            cardW="280" cardH="360" h="456" />
          <Row ref="watched" :show="$watched.length > 0" x="96" y="1100" :title="$watchedTitle" :items="$watched" kind="SetCard"
            cardW="280" cardH="360" h="456" />
          <Row ref="themes" x="96" :y="$themesY" :title="$themesTitle" :items="$themes" kind="ThemeCard"
            cardW="280" cardH="120" h="200" />
          <Text :content="$statsText" font="jakarta" size="20" color="#7d7a6c" x="96" :y="$themesY + 200" />
          </Element>
        </Element>
      </Element>
      <ExitDialog :show="$exiting" ref="exit" />
    </Element>
  `,
  state() {
    return {
      status: 'loading' as 'loading' | 'error' | 'ready',
      section: HERO,
      exiting: false,
      top: { setNum: '', name: '', theme: '', price: null as number | null, reference: null as number | null, shop: '', seller: '' },
      deals: [] as RowItem[],
      themes: [] as RowItem[],
      watched: [] as RowItem[],
      watchedTitle: t('watch.cheaper'),
      loadedAs: null as boolean | null, // signed in or not when the data was loaded
      loadedCurrency: 'RSD' as string,
      statsText: '',
      dealsTitle: t('home.deals.title'),
      themesTitle: t('home.themes.title'),
    }
  },
  computed: {
    themesY(): number {
      return this.watched.length ? 1620 : 1100
    },
    scrollY(): number {
      // keep the active section inside the safe zone; the rows after the deals live below the fold
      if (this.section === WATCHED) return -(1100 + 456 + 20 - safe.bottom)
      if (this.section === THEMES) return -(this.themesY + 200 + 40 - safe.bottom)
      return 0
    },
  },
  hooks: {
    ready() {
      this.$listen('select', (item: RowItem) => {
        if (item.setNum) this.$router.to(`/set/${item.setNum}`)
        else if (item.slug) this.$router.to(`/teme/${item.slug}`)
      })
      this.$listen('exit', () => platform().exit())
      this.$listen('stay', () => {
        this.exiting = false
        this.focusSection()
      })
      this.load()
    },
    focus() {
      if (this.exiting) this.$select('exit').$focus()
      else if (this.status === 'ready') {
        // signed in or out since the last load: members see other deals and their watched sets
        if (this.loadedAs !== signedIn() || this.loadedCurrency !== displayCurrency()) this.load()
        else this.focusSection()
      } else this.$select('nav').$focus()
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
      this.section = HERO
      try {
        const member = signedIn()
        const [deals, themes, stats, watchlist] = await Promise.all([
          api.deals(24),
          api.themes(),
          api.stats(),
          member ? api.watchlist().catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        ])
        this.loadedAs = member
        this.loadedCurrency = displayCurrency()
        this.watched = watchlist.items
          .filter((w) => w.best_price !== null && w.seen_price !== null && w.best_price < w.seen_price)
          .map(watchedToCard)
        const items = deals.items
        const top = items[0]
        if (top) {
          this.top = {
            setNum: top.set_num,
            name: top.name,
            theme: top.theme_name || '',
            price: top.best_price_rsd,
            reference: top.reference_price_rsd ?? top.rrp_rsd,
            shop: top.best_shop_name || '',
            seller: top.best_seller || '',
          }
        }
        this.deals = items.slice(1).map(dealToCard)
        this.themes = themes.map(themeToCard)
        this.statsText =
          t('home.stats', { sets: num(stats.sets_in_stock), offers: num(stats.offers_in_stock), shops: stats.shops }) +
          ' · ' +
          t('home.updated', { when: relativeDay(stats.last_update) })
        this.status = 'ready'
      } catch (e) {
        this.$log.error('home', e)
        this.status = 'error'
      }
    },
    focusSection() {
      const ref =
        this.section === NAV ? 'nav' : this.section === HERO ? 'hero' : this.section === DEALS ? 'deals' : this.section === WATCHED ? 'watched' : 'themes'
      const el = this.$select(ref)
      if (el && el.$focus) el.$focus()
    },
  },
  input: {
    up() {
      let prev = this.section - 1
      if (prev === WATCHED && this.watched.length === 0) prev--
      if (prev === DEALS && this.deals.length === 0) prev--
      if (prev >= NAV) this.section = prev
      else this.focusSection()
    },
    down() {
      if (this.status !== 'ready') return this.focusSection()
      let next = this.section + 1
      if (next === DEALS && this.deals.length === 0) next++
      if (next === WATCHED && this.watched.length === 0) next++
      if (next === THEMES && this.themes.length === 0) next = this.section
      if (next <= THEMES && next !== this.section) this.section = next
      else this.focusSection()
    },
    enter() {
      if (this.section === HERO && this.top.setNum) this.$router.to(`/set/${this.top.setNum}`)
      else if (this.status === 'error') this.load()
    },
    back() {
      this.exiting = true
      this.$select('exit').$focus()
    },
    exit() {
      platform().exit()
    },
    left() {},
    right() {},
  },
})
