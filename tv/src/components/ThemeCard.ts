import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { tn } from '../i18n'

/** A theme tile: name and how many sets are in stock. 280×120. */
export default Blits.Component('ThemeCard', {
  template: `
    <Element :w="$w" :h="$h" rounded="18" :color="$$hasFocus ? '#ffcf00' : '#23221a'"
      :scale.transition="{value: $$hasFocus ? 1.04 : 1, duration: 160}">
      <Element x="22" y="22" w="14" h="14" rounded="4" :color="$$hasFocus ? '#16150f' : '#ffcf00'" />
      <Element x="22" y="40" w="14" h="14" rounded="4" :color="$$hasFocus ? '#16150f' : '#e0b500'" />
      <Text :content="$name" font="jakarta-bold" size="28" :color="$$hasFocus ? '#16150f' : '#ffffff'" x="52" y="20" :maxwidth="$w - 70" maxlines="1" />
      <Text :content="$countText" font="jakarta" size="20" :color="$$hasFocus ? '#16150f' : '#b6b2a1'" x="52" y="62" />
    </Element>
  `,
  props: { slug: '', name: '', count: 0, w: 280, h: 120 },
  computed: {
    countText(): string {
      return tn('card.sets', Number(this.count))
    },
  },
})
