import { describe, expect, it } from 'vitest'
import { clip, discountPct, num, relativeDay, rsd, savingText } from '../src/lib/format'
import { pluralForm, t, tn } from '../src/i18n'

describe('prices', () => {
  it('formats RSD like the site', () => {
    expect(rsd(4792)).toBe('4.792 RSD')
    expect(rsd(999)).toBe('999 RSD')
    expect(rsd(1234567)).toBe('1.234.567 RSD')
    expect(rsd(0)).toBe('0 RSD')
    expect(rsd(null)).toBe('—')
    expect(num(-1500)).toBe('−1.500')
  })
  it('discount against the LEGO Store price', () => {
    expect(discountPct(7799, 5752)).toBe(26)
    expect(discountPct(7799, 7799)).toBe(0)
    expect(discountPct(null, 5752)).toBe(0)
    expect(discountPct(7799, null)).toBe(0)
  })
  it('saving text', () => {
    expect(savingText(7799, 5752)).toBe('Ušteda 2.047 RSD (26%)')
    expect(savingText(5000, 5752)).toBe('')
  })
})

describe('plurals (ekavica)', () => {
  it('picks one / few / other', () => {
    expect(pluralForm(1)).toBe('one')
    expect(pluralForm(2)).toBe('few')
    expect(pluralForm(5)).toBe('other')
    expect(pluralForm(11)).toBe('other')
    expect(pluralForm(21)).toBe('one')
    expect(pluralForm(22)).toBe('few')
    expect(pluralForm(112)).toBe('other')
  })
  it('renders counts', () => {
    expect(tn('card.offers', 1)).toBe('1 ponuda')
    expect(tn('card.offers', 3)).toBe('3 ponude')
    expect(tn('card.offers', 7)).toBe('7 ponuda')
    expect(tn('card.sets', 13)).toBe('13 setova')
    expect(t('set.number', { num: '75192' })).toBe('Set 75192')
  })
})

describe('relative days', () => {
  const now = new Date('2026-10-20T10:00:00+02:00')
  it('today / yesterday / n days', () => {
    expect(relativeDay('2026-10-20T03:30:00Z', now)).toBe('danas')
    expect(relativeDay('2026-10-19T21:42:00Z', now)).toBe('juče')
    expect(relativeDay('2026-10-15T21:42:00Z', now)).toBe('pre 5 dana')
    expect(relativeDay(null, now)).toBe('—')
  })
})

describe('clip', () => {
  it('cuts on a word boundary', () => {
    expect(clip('Avanture sa interaktivnom LEGO® Breskvicom™', 30)).toBe('Avanture sa interaktivnom…')
    expect(clip('Game Boy™', 30)).toBe('Game Boy™')
  })
})
