import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api } from '../api/client'
import { t, tn } from '../i18n'
import TopBar from '../components/TopBar'
import Grid from '../components/Grid'
import Status from '../components/Status'
import type { RowItem } from '../components/Row'
import { summaryToCard } from './Set'

const NAV = 0
const GRID = 1
const PAGE = 36 // 6 columns × 6 rows per request

/** The sets of one theme, best deals first, 6 cards per row; more pages load as the focus nears the end. */
export default Blits.Component('ThemeSets', {
  components: { TopBar, Grid, Status },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <TopBar ref="nav" current="themes" />
      <Text :content="$name" font="jakarta-extrabold" size="44" color="#ffffff" x="96" y="140" maxwidth="1400" maxlines="1" />
      <Text :content="$countText" font="jakarta" size="24" color="#b6b2a1" x="96" y="198" />
      <Status :show="$status !== 'ready'" :state="$status" />
      <Text :show="$status === 'ready' && $items.length === 0" :content="$emptyText" font="jakarta" size="26" color="#b6b2a1" x="96" y="280" />
      <Grid ref="grid" :show="$status === 'ready'" x="96" y="250" :items="$items" kind="SetCard" cols="6" cardW="268" cardH="360" gap="24" width="1728" height="782" />
    </Element>
  `,
  props: { slug: '' },
  state() {
    return {
      status: 'loading' as 'loading' | 'error' | 'ready',
      section: GRID,
      items: [] as RowItem[],
      total: 0,
      page: 0,
      loading: false,
      name: '',
      emptyText: t('theme.empty'),
    }
  },
  computed: {
    countText(): string {
      return this.status === 'ready' ? tn('theme.sets', this.total) : ''
    },
  },
  hooks: {
    ready() {
      this.$listen('select', (item: RowItem) => {
        if (item.setNum) this.$router.to(`/set/${item.setNum}`)
      })
      this.$listen('more', () => this.loadMore())
      this.load()
    },
    focus() {
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
      this.status = 'loading'
      try {
        const slug = String(this.slug)
        const r = await api.search({ theme: slug, sort: 'deal', size: PAGE, page: 1 })
        this.items = r.items.map(summaryToCard)
        this.total = r.total
        this.page = 1
        // the facet carries only slug + count; the theme's name comes with every set
        this.name = (r.items[0] && r.items[0].theme_name) || slug
        this.status = 'ready'
      } catch (e) {
        this.$log.error('theme', e)
        this.status = 'error'
      }
    },
    async loadMore() {
      if (this.loading || this.items.length >= this.total) return
      this.loading = true
      try {
        const r = await api.search({ theme: String(this.slug), sort: 'deal', size: PAGE, page: this.page + 1 })
        this.items = [...this.items, ...r.items.map(summaryToCard)]
        this.page += 1
      } catch (e) {
        this.$log.error('theme more', e)
      } finally {
        this.loading = false
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
