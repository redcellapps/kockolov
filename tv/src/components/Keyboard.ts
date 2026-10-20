import Blits from '@lightningjs/blits'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import { t } from '../i18n'

interface Key {
  id: string
  label: string
  x: number
  y: number
  w: number
  action: 'char' | 'space' | 'delete' | 'clear'
  value: string
}

const KEY = 76
const GAP = 10
// a-z and 0-9 in a 10-column block, then the three wide keys
const ROWS = ['1234567890', 'abcdefghij', 'klmnopqrst', 'uvwxyz']

export function layoutKeys(): Key[] {
  const keys: Key[] = []
  ROWS.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      keys.push({ id: ch, label: ch, x: i * (KEY + GAP), y: r * (KEY + GAP), w: KEY, action: 'char', value: ch })
    }
  })
  // last row: z ends at column 5; wide keys fill the rest of the row
  const y = 3 * (KEY + GAP)
  keys.push({ id: 'space', label: t('search.key.space'), x: 6 * (KEY + GAP), y, w: KEY * 2 + GAP, action: 'space', value: ' ' })
  keys.push({ id: 'delete', label: t('search.key.delete'), x: 8 * (KEY + GAP), y, w: KEY * 2 + GAP, action: 'delete', value: '' })
  return keys
}

/** Which key to land on when moving from `from` in a direction: nearest by position */
export function neighbour(keys: Key[], from: number, dir: 'left' | 'right' | 'up' | 'down'): number {
  const k = keys[from]
  const cx = k.x + k.w / 2
  const cy = k.y + KEY / 2
  let best = -1
  let bestD = Infinity
  keys.forEach((o, i) => {
    if (i === from) return
    const ox = o.x + o.w / 2
    const oy = o.y + KEY / 2
    const dx = ox - cx
    const dy = oy - cy
    const ok =
      (dir === 'left' && dx < -1 && Math.abs(dy) < KEY) ||
      (dir === 'right' && dx > 1 && Math.abs(dy) < KEY) ||
      (dir === 'up' && dy < -1) ||
      (dir === 'down' && dy > 1)
    if (!ok) return
    const d = dir === 'up' || dir === 'down' ? Math.abs(dy) * 10 + Math.abs(dx) : Math.abs(dx)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/**
 * On-screen keyboard: a–z, 0–9, space, delete. 10 columns × 4 rows, 850×334.
 * Emits 'key' with { action, value }. Up from the top row returns focus to the parent.
 */
export default Blits.Component('Keyboard', {
  template: `
    <Element w="850" h="334">
      <Element :for="(k, index) in $keys" :key="$k.id" :x="$k.x" :y="$k.y" :w="$k.w" h="76" rounded="14"
        :color="$$hasFocus && $focused === $index ? '#ffcf00' : ($k.action === 'char' ? '#23221a' : '#2f2d23')"
        :scale.transition="{value: $$hasFocus && $focused === $index ? 1.06 : 1, duration: 120}">
        <Text :content="$k.label" :font="$k.action === 'char' ? 'jakarta-bold' : 'jakarta-semibold'" :size="$k.action === 'char' ? 34 : 22"
          :color="$$hasFocus && $focused === $index ? '#16150f' : '#ffffff'" :x="$k.w / 2" :y="$k.action === 'char' ? 16 : 24" mount="{x: 0.5}" />
      </Element>
    </Element>
  `,
  state() {
    return { keys: layoutKeys(), focused: 10 } // start on "a"
  },
  methods: {
    move(dir: 'left' | 'right' | 'up' | 'down', e?: KeyboardEvent) {
      const next = neighbour(this.keys as Key[], this.focused, dir)
      if (next >= 0) this.focused = next
      else if ((dir === 'up' || dir === 'right') && e) this.$parent.$focus(e)
    },
  },
  input: {
    left() {
      this.move('left')
    },
    right(e) {
      this.move('right', e)
    },
    up(e) {
      this.move('up', e)
    },
    down() {
      this.move('down')
    },
    enter() {
      const k = (this.keys as Key[])[this.focused]
      this.$emit('key', { action: k.action, value: k.value })
    },
  },
})
