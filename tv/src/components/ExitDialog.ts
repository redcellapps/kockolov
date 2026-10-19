import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { t } from '../i18n'

/** "Izlaz iz Kockolova?" — left/right pick Ostani / Izađi, enter confirms, back = stay. Emits 'exit' / 'stay'. */
export default Blits.Component('ExitDialog', {
  template: `
    <Element w="760" h="320" x="960" y="540" mount="0.5" rounded="28" color="#2f2d23"
      :border="{w: 2, color: '#3a382c'}">
      <Text :content="$title" font="jakarta-extrabold" size="44" color="#ffffff" x="380" y="52" mount="{x: 0.5}" />
      <Text :content="$text" font="jakarta" size="26" color="#b6b2a1" x="380" y="118" mount="{x: 0.5}" />
      <Element x="110" y="200" w="250" h="72" rounded="36" :color="$focused === 0 ? '#ffcf00' : '#23221a'">
        <Text :content="$no" font="jakarta-bold" size="30" :color="$focused === 0 ? '#16150f' : '#ffffff'" x="125" y="17" mount="{x: 0.5}" />
      </Element>
      <Element x="400" y="200" w="250" h="72" rounded="36" :color="$focused === 1 ? '#ffcf00' : '#23221a'">
        <Text :content="$yes" font="jakarta-bold" size="30" :color="$focused === 1 ? '#16150f' : '#ffffff'" x="125" y="17" mount="{x: 0.5}" />
      </Element>
    </Element>
  `,
  state() {
    return { focused: 0, title: t('exit.title'), text: t('exit.text'), yes: t('exit.yes'), no: t('exit.no') }
  },
  hooks: {
    focus() {
      this.focused = 0
    },
  },
  input: {
    left() {
      this.focused = 0
    },
    right() {
      this.focused = 1
    },
    enter() {
      this.$emit(this.focused === 1 ? 'exit' : 'stay')
    },
    back() {
      this.$emit('stay')
    },
    up() {},
    down() {},
  },
})
