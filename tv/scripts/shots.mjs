// Screenshots of the app at 1920×1080 in headless Chromium (for review before merging).
// Usage: node scripts/shots.mjs [baseUrl] [outDir]   (default http://localhost:5174, shots/)
// Needs Playwright with Chromium: `npx playwright install chromium` (not a dependency of the app).
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

const shot = async (name, keys = [], wait = 900) => {
  for (const k of keys) {
    await page.keyboard.press(k)
    await page.waitForTimeout(260)
  }
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  console.log('shot', name)
  await page.waitForTimeout(500) // headless screenshots stall the frame loop; let animations settle
}

await page.goto(`${base}/#/`)
await page.waitForTimeout(2500)
await shot('01-home')
await shot('02-home-deals', ['ArrowDown', 'ArrowRight', 'ArrowRight'])
await shot('03-home-themes', ['ArrowDown', 'ArrowRight'])
await shot('04-home-nav', ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight'])
await shot('05-home-exit', ['ArrowDown', 'Escape'])
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.keyboard.press('Enter') // hero → set page
await page.waitForTimeout(2500)
await shot('06-set')
await shot('07-set-offers', ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'])
await shot('08-set-related', ['ArrowDown', 'ArrowDown'])
await shot('09-back-home', ['Escape'], 1500)

await browser.close()
