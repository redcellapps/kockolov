import Blits from '@lightningjs/blits'
import { colors } from '../theme'
// colors and sizes are written literally in templates: the Blits precompiler reads templates before JS runs (see src/theme.ts)
import type { DayPoint } from '../lib/history'
import { niceRange } from '../lib/history'
import { num, shortDate } from '../lib/format'
import { t } from '../i18n'

interface Bar {
  key: string
  x: number
  y: number
  h: number
  color: string
}

/**
 * Price history as a column per day (lowest in-stock price that day) with a LEGO Store reference line.
 * Columns are plain rectangles: cheap to draw on a 2018 TV, no canvas or shader.
 */
export default Blits.Component('PriceChart', {
  template: `
    <Element :w="$w" :h="$h" rounded="20" color="#23221a">
      <Text :content="$title" font="jakarta-bold" size="26" color="#ffffff" x="24" y="18" />
      <Text :content="$legend" font="jakarta" size="18" color="#b6b2a1" x="24" y="52" />
      <Text :show="$bars.length === 0" :content="$emptyText" font="jakarta" size="22" color="#b6b2a1" :x="$w / 2" :y="$h / 2" mount="0.5" :maxwidth="$w - 60" />
      <!-- axis labels -->
      <Text :content="$maxLabel" font="jakarta-semibold" size="18" color="#b6b2a1" :x="$w - 24" :y="$plotY - 10" mount="{x: 1}" />
      <Text :content="$minLabel" font="jakarta-semibold" size="18" color="#b6b2a1" :x="$w - 24" :y="$plotY + $plotH - 10" mount="{x: 1}" />
      <Element :x="$plotX" :y="$plotY + $plotH" :w="$plotW" h="2" color="#3a382c" />
      <!-- bars -->
      <Element :for="bar in $bars" :key="$bar.key" :x="$bar.x" :y="$bar.y" :w="$barW" :h="$bar.h" :color="$bar.color" rounded="3" />
      <!-- LEGO Store reference -->
      <Element :show="$refY > 0" :x="$plotX" :y="$refY" :w="$plotW" h="3" color="#f87171" alpha="0.9" />
      <Text :show="$refY > 0" :content="$refLabel" font="jakarta-semibold" size="18" color="#f87171" :x="$plotX" :y="$refY - 26" />
      <!-- dates -->
      <Text :content="$firstDate" font="jakarta" size="18" color="#7d7a6c" :x="$plotX" :y="$plotY + $plotH + 8" />
      <Text :content="$lastDate" font="jakarta" size="18" color="#7d7a6c" :x="$plotX + $plotW" :y="$plotY + $plotH + 8" mount="{x: 1}" />
    </Element>
  `,
  props: {
    points: [] as DayPoint[],
    reference: 0 as number | null,
    w: 684,
    h: 330,
    days: 90,
  },
  state() {
    return { plotX: 24, plotY: 86, bars: [] as Bar[] }
  },
  hooks: {
    ready() {
      this.bars = this.makeBars()
    },
  },
  watch: {
    points() {
      this.bars = this.makeBars()
    },
    reference() {
      this.bars = this.makeBars()
    },
  },
  methods: {
    makeBars(): Bar[] {
      const pts = this.points as DayPoint[]
      const [lo, hi] = this.range as [number, number]
      const n = pts.length
      if (!n) return []
      const step = this.plotW / n
      const out: Bar[] = []
      let min = Infinity
      for (const p of pts) if (p.price < min) min = p.price
      const flat = pts.every((p) => p.price === min) // nothing to highlight when the price never moved
      for (let i = 0; i < n; i++) {
        const p = pts[i]
        const frac = (p.price - lo) / (hi - lo || 1)
        const h = Math.max(4, Math.round(frac * this.plotH))
        out.push({
          key: p.day,
          x: Math.round(this.plotX + i * step),
          y: this.plotY + this.plotH - h,
          h,
          color: p.price === min && !flat ? colors.green : colors.chart,
        })
      }
      return out
    },
  },
  computed: {
    title(): string {
      return t('set.history.title')
    },
    legend(): string {
      return t('set.history.legend', { days: this.days })
    },
    emptyText(): string {
      return t('set.history.empty')
    },
    plotW(): number {
      return this.w - 24 - 110
    },
    plotH(): number {
      return this.h - this.plotY - 44
    },
    range(): [number, number] {
      const pts = this.points as DayPoint[]
      if (!pts.length) return [0, 1]
      let min = Infinity
      let max = -Infinity
      for (const p of pts) {
        if (p.price < min) min = p.price
        if (p.price > max) max = p.price
      }
      const ref = this.reference as number | null
      if (ref && ref > max) max = ref
      if (ref && ref < min) min = ref
      return niceRange(min * 0.97, max * 1.03)
    },
    barW(): number {
      const n = Math.max(1, (this.points as DayPoint[]).length)
      return Math.max(2, Math.floor(this.plotW / n) - 1)
    },
    refY(): number {
      const ref = this.reference as number | null
      if (!ref || !(this.points as DayPoint[]).length) return 0
      const [lo, hi] = this.range as [number, number]
      const frac = (ref - lo) / (hi - lo || 1)
      return Math.round(this.plotY + this.plotH - frac * this.plotH)
    },
    refLabel(): string {
      return t('set.rrp', { amount: `${num(Number(this.reference))} RSD` })
    },
    maxLabel(): string {
      return (this.points as DayPoint[]).length ? num((this.range as readonly number[])[1]) : ''
    },
    minLabel(): string {
      return (this.points as DayPoint[]).length ? num((this.range as readonly number[])[0]) : ''
    },
    firstDate(): string {
      const pts = this.points as DayPoint[]
      return pts.length ? shortDate(pts[0].day) : ''
    },
    lastDate(): string {
      const pts = this.points as DayPoint[]
      return pts.length > 1 ? shortDate(pts[pts.length - 1].day) : ''
    },
  },
})
