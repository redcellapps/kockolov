import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api } from '../api/client'
import type { WatchedSet } from '../api/types'
import { t } from '../i18n'
import { money } from '../lib/format'
import TopBar from '../components/TopBar'
import Grid from '../components/Grid'
import Status from '../components/Status'
import type { RowItem } from '../components/Row'
import { summaryToCard } from './Set'

const NAV = 0
const GRID = 1

/** "Jeftinije za 1.200 RSD" / "Skuplje za …" / "Ista cena" / "Nema na stanju" against the price when the set was last noticed */
export function changeText(w: WatchedSet): string {
  if (w.best_price === null || w.best_price === undefined) return t('watch.noStock')
  if (w.seen_price === null || w.seen_price === undefined) return ''
  const d = w.best_price - w.seen_price
  if (d < 0) return t('watch.cheaperOne', { amount: money(-d) })
  if (d > 0) return t('watch.dearerOne', { amount: money(d) })
  return t('watch.sameOne')
}

export function watchedToCard(w: WatchedSet): RowItem {
  return { ...summaryToCard(w), note: changeText(w), cheaper: w.best_price !== null && w.seen_price !== null && w.best_price < w.seen_price }
}

export default Blits.Component('Watchlist', {
  components: { TopBar, Grid, Status },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <TopBar ref="nav" current="watchlist" />
      <Text :content="$title" font="jakarta-extrabold" size="44" color="#ffffff" x="96" y="140" />
      <Text :content="$subtitle" font="jakarta" size="24" color="#b6b2a1" x="96" y="198" />
      <Status :show="$status !== 'ready'" :state="$status" />
      <Text :show="$status === 'ready' && $items.length === 0" :content="$emptyText" font="jakarta" size="26" color="#b6b2a1" x="96" y="280" maxwidth="1400" lineheight="36" />
      <Grid ref="grid" :show="$status === 'ready'" x="96" y="250" :items="$items" kind="SetCard" cols="6" cardW="268" cardH="360" gap="24" width="1728" height="782" />
    </Element>
  `,
  state() {
    return {
      status: 'loading' as 'loading' | 'error' | 'ready',
      section: GRID,
      items: [] as RowItem[],
      title: t('watch.title'),
      subtitle: t('watch.subtitle'),
      emptyText: t('watch.empty'),
    }
  },
  hooks: {
    ready() {
      this.$listen('select', (item: RowItem) => {
        if (item.setNum) this.$router.to(`/set/${item.setNum}`)
      })
      this.load()
    },
    focus() {
      // kept alive: reload on every return, the watchlist changes on set pages
      if (this.status === 'ready') this.load()
      this.focusSection()
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
      if (this.status !== 'ready') this.status = 'loading'
      try {
        const r = await api.watchlist()
        this.items = r.items.map(watchedToCard)
        this.status = 'ready'
      } catch (e) {
        this.$log.error('watchlist', e)
        this.status = 'error'
      }
    },
    focusSection() {
      const el = this.$select(this.section === NAV || this.status !== 'ready' || this.items.length === 0 ? 'nav' : 'grid')
      if (el && el.$focus) el.$focus()
    },
  },
  input: {
    up() {
      if (this.section === GRID) this.section = NAV
      else this.focusSection()
    },
    down() {
      if (this.section === NAV && this.status === 'ready' && this.items.length) this.section = GRID
      else this.focusSection()
    },
    enter() {
      if (this.status === 'error') this.load()
    },
    left() {},
    right() {},
  },
})
