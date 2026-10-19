import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import TopBar from '../components/TopBar'
import { t } from '../i18n'

/** Stands in for the search, themes and about pages until they are built (step 3). */
export default Blits.Component('Placeholder', {
  components: { TopBar },
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <TopBar ref="nav" :current="$current" />
      <Text :content="$title" font="jakarta-extrabold" size="48" color="#ffffff" x="960" y="480" mount="{x: 0.5}" />
      <Text :content="$back" font="jakarta" size="26" color="#b6b2a1" x="960" y="560" mount="{x: 0.5}" />
    </Element>
  `,
  props: { slug: '' },
  state() {
    const path = this.$router.currentRoute?.path || ''
    const current = path.startsWith('/pretraga') ? 'search' : path.startsWith('/teme') ? 'themes' : 'about'
    const title = current === 'search' ? t('search.title') : current === 'themes' ? t('themes.title') : t('about.title')
    return { current, title, back: t('common.back') }
  },
  hooks: {
    focus() {
      this.$select('nav').$focus()
    },
  },
  input: {
    down() {},
  },
})
