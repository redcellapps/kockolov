import { describe, expect, it } from 'vitest'
import { cleanPath } from '../src/lib/analytics'

describe('statistics paths', () => {
  it('sends the route only, like the site addresses it', () => {
    expect(cleanPath('#/set/72046')).toBe('/set/72046')
    expect(cleanPath('#/')).toBe('/')
    expect(cleanPath('/pretraga?q=star%20wars')).toBe('/pretraga')
    expect(cleanPath('#/teme/Marvel')).toBe('/teme/marvel')
    expect(cleanPath('')).toBe('/')
  })
})
