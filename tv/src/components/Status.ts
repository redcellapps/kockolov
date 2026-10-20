import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { t } from '../i18n'

/** Centered "Učitavanje…" / error text for a page that has no data yet. */
export default Blits.Component('Status', {
  template: `
    <Element w="1920" h="200" :y="$y">
      <Element :show="$state === 'loading'" x="960" y="40" mount="{x: 0.5}" w="48" h="48" rounded="12" color="#ffcf00"
        :rotation.transition="{value: $spin, duration: 900, easing: 'linear'}" />
      <Text :content="$text" font="jakarta-semibold" size="30" :color="$state === 'error' ? '#f87171' : '#b6b2a1'"
        x="960" y="120" mount="{x: 0.5}" />
    </Element>
  `,
  props: { state: 'loading', y: 380 },
  state() {
    return { spin: 0 }
  },
  computed: {
    text(): string {
      return this.state === 'error' ? t('common.error') : t('common.loading')
    },
  },
  hooks: {
    ready() {
      this.$setInterval(() => {
        if (this.state === 'loading') this.spin += 90
      }, 900)
    },
  },
})
