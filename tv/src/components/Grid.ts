import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import SetCard from './SetCard'
import ThemeCard from './ThemeCard'
import type { RowItem } from './Row'

/**
 * Cards in a grid of `cols` columns. Arrows move the focus; the grid scrolls by rows so the focused
 * row stays inside the visible height. Enter emits 'select' with the item; 'up' on the first row
 * hands focus back to the parent; nearing the end emits 'more' so the page can load the next page.
 */
export default Blits.Component('Grid', {
  components: { SetCard, ThemeCard },
  template: `
    <Element :w="$width + 40" :h="$height" x="-20" clipping="true">
      <Element :y.transition="{value: $gridY, duration: 220, easing: 'ease-out'}" x="20">
        <Component is="$kind" :for="(item, index) in $items" :key="$item.key" ref="card" :item="$item"
          :x="($index % $cols) * ($cardW + $gap)" :y="Math.floor($index / $cols) * ($cardH + $gap)"
          :setNum="$item.setNum" :name="$item.name" :price="$item.price" :reference="$item.reference"
          :discount="$item.discount" :offers="$item.offers" :slug="$item.slug" :count="$item.count" :note="$item.note" :cheaper="$item.cheaper"
          :w="$cardW" :h="$cardH" />
      </Element>
    </Element>
  `,
  props: {
    items: [] as RowItem[],
    kind: 'SetCard',
    cols: 6,
    cardW: 280,
    cardH: 360,
    gap: 24,
    width: 1728,
    height: 800,
  },
  state() {
    return { focused: 0 }
  },
  computed: {
    rowH(): number {
      return this.cardH + this.gap
    },
    visibleRows(): number {
      return Math.max(1, Math.floor((this.height - 20) / this.rowH))
    },
    gridY(): number {
      const row = Math.floor(this.focused / this.cols)
      const totalRows = Math.ceil((this.items as RowItem[]).length / this.cols)
      const maxFirst = Math.max(0, totalRows - this.visibleRows)
      const first = Math.min(Math.max(0, row - (this.visibleRows - 1)), maxFirst)
      return 10 - first * this.rowH
    },
  },
  hooks: {
    focus() {
      this.$trigger('focused')
    },
  },
  watch: {
    focused(v: number) {
      const el = this.$select('card' + v)
      if (el && el.$focus) el.$focus()
      const n = (this.items as RowItem[]).length
      if (n && v >= n - this.cols * 2) this.$emit('more')
    },
    items(items: RowItem[]) {
      if (this.focused >= items.length) this.focused = Math.max(0, items.length - 1)
    },
  },
  methods: {
    reset() {
      this.focused = 0
    },
  },
  input: {
    left(e) {
      if (this.focused % this.cols > 0) this.focused--
      else this.$parent.$focus(e)
    },
    right() {
      if (this.focused % this.cols < this.cols - 1 && this.focused < (this.items as RowItem[]).length - 1) this.focused++
    },
    up(e) {
      if (this.focused >= this.cols) this.focused -= this.cols
      else this.$parent.$focus(e)
    },
    down() {
      const n = (this.items as RowItem[]).length
      if (this.focused + this.cols < n) this.focused += this.cols
      else if (Math.floor(this.focused / this.cols) < Math.floor((n - 1) / this.cols)) this.focused = n - 1
    },
    enter() {
      const item = (this.items as RowItem[])[this.focused]
      if (item) this.$emit('select', item)
    },
  },
})
