import Blits from '@lightningjs/blits'
import { safe } from '../theme'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import SetCard from './SetCard'
import ThemeCard from './ThemeCard'

export interface RowItem {
  key: string
  [prop: string]: unknown
}

/**
 * A titled horizontal list of cards (SetCard or ThemeCard). Left/right move the focus; the strip
 * slides so the focused card stays in view. Enter emits 'select' with the item.
 */
export default Blits.Component('Row', {
  components: { SetCard, ThemeCard },
  template: `
    <Element :w="$width" :h="$h">
      <Text :content="$title" font="jakarta-bold" size="34" color="#ffffff" x="0" y="0" />
      <Element y="56" x="-20" :w="$width + 40" :h="$h - 56" clipping="true">
        <Element :x.transition="{value: $stripX, duration: 220, easing: 'ease-out'}" :y="$pad" x="20">
          <Component is="$kind" :for="(item, index) in $items" :key="$item.key" ref="card" :item="$item" :index="$index"
            :x="$index * ($cardW + $gap)"
            :setNum="$item.setNum" :name="$item.name" :price="$item.price" :reference="$item.reference"
            :discount="$item.discount" :offers="$item.offers" :slug="$item.slug" :count="$item.count"
            :w="$cardW" :h="$cardH" />
        </Element>
      </Element>
    </Element>
  `,
  props: {
    title: '',
    items: [] as RowItem[],
    kind: 'SetCard',
    cardW: 280,
    cardH: 360,
    gap: 24,
    width: safe.w,
    h: 440,
    pad: 10, // room above and below for the focus scale
  },
  state() {
    return { focused: 0 }
  },
  computed: {
    stripX(): number {
      const items = this.items as RowItem[]
      const step = this.cardW + this.gap
      const perView = Math.floor((this.width - this.pad * 2) / step)
      const maxFirst = Math.max(0, items.length - perView)
      const first = Math.min(Math.max(0, this.focused - 1), maxFirst)
      return this.pad - first * step
    },
  },
  hooks: {
    focus() {
      this.$trigger('focused')
    },
  },
  watch: {
    focused(value: number) {
      const el = this.$select('card' + value)
      if (el && el.$focus) el.$focus()
    },
    items() {
      if (this.focused >= (this.items as RowItem[]).length) this.focused = 0
    },
  },
  input: {
    left() {
      if (this.focused > 0) this.focused--
    },
    right() {
      if (this.focused < (this.items as RowItem[]).length - 1) this.focused++
    },
    enter() {
      const item = (this.items as RowItem[])[this.focused]
      if (item) this.$emit('select', item)
    },
  },
})
