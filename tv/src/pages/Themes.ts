import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { api } from '../api/client'
import { t } from '../i18n'
import TopBar from '../components/TopBar'
import Grid from '../components/Grid'
import Status from '../components/Status'
import type { RowItem } from '../components/Row'
import { themeToCard } from './Home'

const NAV = 0
const GRID = 1

/** All themes with sets in stock, 6 tiles per row. */
export default Blits.Component('Themes', {
  components: { TopBar, Grid, Status },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <TopBar ref="nav" current="themes" />
      <Text :content="$title" font="jakarta-extrabold" size="44" color="#ffffff" x="96" y="140" />
      <Text :content="$subtitle" font="jakarta" size="24" color="#b6b2a1" x="96" y="198" />
      <Status :show="$status !== 'ready'" :state="$status" />
      <Grid ref="grid" :show="$status === 'ready'" x="96" y="250" :items="$items" kind="ThemeCard" cols="6" cardW="268" cardH="120" gap="24" width="1728" height="782" />
    </Element>
  `,
  state() {
    return {
      status: 'loading' as 'loading' | 'error' | 'ready',
      section: GRID,
      items: [] as RowItem[],
      title: t('themes.title'),
      subtitle: t('themes.subtitle'),
    }
  },
  hooks: {
    ready() {
      this.$listen('select', (item: RowItem) => {
        if (item.slug) this.$router.to(`/teme/${item.slug}`)
      })
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
        this.items = (await api.themes()).map(themeToCard)
        this.status = 'ready'
      } catch (e) {
        this.$log.error('themes', e)
        this.status = 'error'
      }
    },
    focusSection() {
      const el = this.$select(this.section === NAV || this.status !== 'ready' ? 'nav' : 'grid')
      if (el && el.$focus) el.$focus()
    },
  },
  input: {
    up() {
      if (this.section === GRID) this.section = NAV
      else this.focusSection()
    },
    down() {
      if (this.section === NAV && this.status === 'ready') this.section = GRID
      else this.focusSection()
    },
    enter() {
      if (this.status === 'error') this.load()
    },
    left() {},
    right() {},
  },
})
