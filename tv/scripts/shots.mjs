// Screenshots of the app at 1920×1080 in headless Chromium (for review before merging).
// Usage: node scripts/shots.mjs [baseUrl] [outDir]   (default http://localhost:5174, shots/)
// Needs Playwright with Chromium (not a dependency of the app): npm i -D playwright && npx playwright install chromium
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const base = process.argv[2] || 'http://localhost:5174'
const out = process.argv[3] || 'shots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

const press = async (keys) => {
  for (const k of keys) {
    await page.keyboard.press(k)
    await page.waitForTimeout(260)
  }
}
const shot = async (name, keys = [], wait = 900) => {
  await press(keys)
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  console.log('shot', name)
  // headless screenshots stall the frame loop, which leaves renderer animations half-way: pump a few frames
  for (let i = 0; i < 6; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(0))))
  await page.waitForTimeout(400)
}

await page.goto(`${base}/#/`)
await page.waitForTimeout(2500)
await shot('01-home')
await shot('02-home-deals', ['ArrowDown', 'ArrowRight', 'ArrowRight'])
await shot('03-home-themes', ['ArrowDown', 'ArrowRight'])
await shot('04-home-nav', ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight'])
await shot('05-home-exit', ['ArrowDown', 'Escape'])
await press(['Escape'])
await press(['Enter']) // hero → set page
await page.waitForTimeout(2500)
await shot('06-set')
await shot('07-set-offers', ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'])
await shot('08-set-related', ['ArrowDown', 'ArrowDown'])
await shot('09-back-home', ['Escape'], 1500)

// search: nav → Pretraga, type "star" on the keyboard, then digits from the remote
await press(['ArrowUp', 'ArrowUp', 'ArrowRight', 'Enter'])
await page.waitForTimeout(1500)
await shot('10-search-empty')
await shot('11-search-typing', ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'Enter'], 1500) // "se"
await shot('12-search-results', ['ArrowRight'], 1200) // focus moves to the results
await page.goto(`${base}/#/pretraga`)
await page.waitForTimeout(800)
await shot('13-search-digits', ['7', '2', '0', '4', '6'], 1500)

// themes
await page.goto(`${base}/#/teme`)
await page.waitForTimeout(2000)
await shot('14-themes', ['ArrowRight', 'ArrowDown'])
await shot('15-theme-sets', ['Enter'], 2000)
await shot('16-theme-scroll', ['ArrowDown', 'ArrowDown'], 1200)

// about, through the top bar
await shot('17-about', ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight', 'Enter'], 2500)

// sign-in page: code + QR (the focus stays on the top bar, "Prijava" is the last item)
await shot('18-pair', ['ArrowRight', 'Enter'], 3000)
await browser.close()
