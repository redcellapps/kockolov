import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api } from '../api/client'
import { t, tn } from '../i18n'
import TopBar from '../components/TopBar'
import Keyboard from '../components/Keyboard'
import Grid from '../components/Grid'
import type { RowItem } from '../components/Row'
import { summaryToCard } from './Set'

const NAV = 0
const KEYS = 1
const RESULTS = 2
const PAGE = 24 // 4 columns × 6 rows per request
const DEBOUNCE = 350

/**
 * Search: keyboard on the left, results in a 4-column grid on the right. Digits typed on the remote
 * go straight into the query (set numbers). Results refresh while typing.
 */
export default Blits.Component('Search', {
  components: { TopBar, Keyboard, Grid },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <TopBar ref="nav" current="search" />
      <!-- query box -->
      <Element x="96" y="140" w="850" h="84" rounded="20" :color="$section === 1 ? '#2f2d23' : '#23221a'"
        :border="{w: 3, color: $section === 1 ? '#ffcf00' : '#3a382c'}">
        <Text :show="$query === ''" :content="$placeholder" font="jakarta" size="30" color="#7d7a6c" x="28" y="22" />
        <Text :content="$query" font="jakarta-bold" size="34" color="#ffffff" x="28" y="20" maxwidth="770" maxlines="1" textoverflow="" @loaded="$queryLoaded" />
        <Element :show="$section === 1" :x="$caretX" y="22" w="4" h="40" color="#ffcf00" :alpha="$caretAlpha" />
      </Element>
      <Keyboard ref="keys" x="96" y="256" />
      <Text :content="$hint" font="jakarta" size="20" color="#7d7a6c" x="96" y="610" maxwidth="850" />
      <!-- results -->
      <Text :content="$countText" font="jakarta-bold" size="28" color="#ffffff" x="1000" y="140" />
      <Text :content="$message" font="jakarta" size="26" color="#b6b2a1" x="1000" y="150" maxwidth="820" lineheight="36" />
      <Grid ref="grid" x="1000" y="196" :items="$items" kind="SetCard" cols="3" cardW="256" cardH="340" gap="20" width="808" height="836" />
    </Element>
  `,
  state() {
    return {
      section: KEYS,
      query: '',
      items: [] as RowItem[],
      total: 0,
      page: 0,
      loading: false,
      searched: '',
      error: false,
      caretX: 28,
      caretAlpha: 1,
      placeholder: t('search.placeholder'),
      hint: t('search.hint'),
      timer: null as ReturnType<typeof setTimeout> | null,
    }
  },
  computed: {
    countText(): string {
      return this.searched && !this.loading && this.total > 0 ? tn('search.results', this.total) : this.searched && this.loading ? t('common.loading') : ''
    },
    message(): string {
      if (this.error) return t('common.error')
      if (!this.searched) return t('search.start')
      if (!this.loading && this.total === 0) return t('search.empty', { q: this.searched })
      return ''
    },
  },
  hooks: {
    ready() {
      this.$listen('key', (k: { action: string; value: string }) => this.onKey(k))
      this.$listen('select', (item: RowItem) => {
        if (item.setNum) this.$router.to(`/set/${item.setNum}`)
      })
      this.$listen('more', () => this.loadMore())
      this.$setInterval(() => {
        if (this.section === KEYS) this.caretAlpha = this.caretAlpha ? 0 : 1
      }, 500)
      this.focusSection()
    },
    focus() {
      this.focusSection()
    },
  },
  watch: {
    section() {
      this.focusSection()
    },
    query(q: string) {
      if (q === '') this.caretX = 28
      if (this.timer) clearTimeout(this.timer)
      this.timer = this.$setTimeout(() => this.search(), DEBOUNCE)
    },
  },
  methods: {
    queryLoaded(dim: { w: number }) {
      this.caretX = 28 + Math.round(dim.w) + 4
    },
    focusSection() {
      const ref = this.section === NAV ? 'nav' : this.section === KEYS ? 'keys' : 'grid'
      const el = this.$select(ref)
      if (el && el.$focus) el.$focus()
    },
    onKey(k: { action: string; value: string }) {
      if (k.action === 'char' || k.action === 'space') {
        if (this.query.length < 40 && !(k.action === 'space' && (this.query === '' || this.query.endsWith(' ')))) this.query += k.value
      } else if (k.action === 'delete') {
        this.query = this.query.slice(0, -1)
      } else if (k.action === 'clear') {
        this.query = ''
      }
    },
    async search() {
      const q = this.query.trim()
      this.searched = q
      this.error = false
      if (!q) {
        this.items = []
        this.total = 0
        return
      }
      this.loading = true
      try {
        const r = await api.search({ q, size: PAGE, page: 1 })
        if (this.searched !== q) return // a newer query is on its way
        this.items = r.items.map(summaryToCard)
        this.total = r.total
        this.page = 1
        const grid = this.$select('grid') as unknown as { reset?: () => void }
        if (grid && grid.reset) grid.reset()
      } catch (e) {
        this.$log.error('search', e)
        this.error = true
      } finally {
        if (this.searched === q) this.loading = false
      }
    },
    async loadMore() {
      if (this.loading || this.items.length >= this.total) return
      const q = this.searched
      this.loading = true
      try {
        const r = await api.search({ q, size: PAGE, page: this.page + 1 })
        if (this.searched !== q) return
        this.items = [...this.items, ...r.items.map(summaryToCard)]
        this.page += 1
      } catch (e) {
        this.$log.error('search more', e)
      } finally {
        if (this.searched === q) this.loading = false
      }
    },
  },
  input: {
    up() {
      if (this.section === KEYS) this.section = NAV
      else if (this.section === RESULTS) this.section = NAV
      else this.focusSection()
    },
    down() {
      if (this.section === NAV) this.section = KEYS
      else this.focusSection()
    },
    right() {
      if (this.section === KEYS && this.items.length) this.section = RESULTS
      else this.focusSection()
    },
    left() {
      if (this.section === RESULTS) this.section = KEYS
      else this.focusSection()
    },
    any(e) {
      // digits from the remote go into the query from anywhere on the page (keyCode: old TV engines
      // report e.key as "Unidentified"); letters only from a real keyboard during development
      const ev = e as KeyboardEvent
      const code = ev.keyCode
      const digit = code >= 48 && code <= 57 ? code - 48 : code >= 96 && code <= 105 ? code - 96 : -1
      if (digit >= 0) {
        if (this.query.length < 40) this.query += String(digit)
        if (this.section !== KEYS) this.section = KEYS
        return
      }
      if (this.section === KEYS && ev.key && /^[a-z]$/i.test(ev.key) && this.query.length < 40) {
        this.query += ev.key.toLowerCase()
        return
      }
      // anything else (back, …) continues up to the router
      this.$parent.$input(ev)
    },
  },
})
