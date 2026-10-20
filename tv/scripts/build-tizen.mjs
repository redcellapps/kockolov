// Samsung Tizen package: dist/ + platforms/tizen → build/tizen/Kockolov.wgt
//
//   node scripts/build-tizen.mjs            # needs `npm run build` first
//   TIZEN_PACKAGE_ID=AbCdEfGhIj TIZEN_PROFILE=kockolov node scripts/build-tizen.mjs
//
// With the Tizen Studio CLI on PATH (`tizen`) and a certificate profile (TIZEN_PROFILE), the package
// is signed with `tizen package`. Without it, an unsigned .wgt (a plain zip) is written — good for
// inspecting the contents, not installable on a TV.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const dist = path.join(root, 'dist')
const stage = path.join(root, 'build', 'tizen', 'app')
const out = path.join(root, 'build', 'tizen')
const packageId = process.env.TIZEN_PACKAGE_ID || 'kockolovTV'
const profile = process.env.TIZEN_PROFILE || ''

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html missing: run `npm run build` first')
  process.exit(1)
}
if (!/^[A-Za-z0-9]{10}$/.test(packageId)) {
  console.error(`TIZEN_PACKAGE_ID must be 10 letters/digits (got "${packageId}")`)
  process.exit(1)
}

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
cpSync(dist, stage, { recursive: true })
cpSync(path.join(root, 'platforms', 'tizen', 'icon.png'), path.join(stage, 'icon.png'))
const config = readFileSync(path.join(root, 'platforms', 'tizen', 'config.xml'), 'utf8')
  .replace(/__VERSION__/g, pkg.version)
  .replace(/__PACKAGE__/g, packageId)
writeFileSync(path.join(stage, 'config.xml'), config)

const wgt = path.join(out, 'Kockolov.wgt')
rmSync(wgt, { force: true })

const hasTizen = spawnSync('tizen', ['version'], { stdio: 'ignore' }).status === 0
if (hasTizen && profile) {
  // `tizen package` writes <name>.wgt next to the project; -o moves it
  execFileSync('tizen', ['package', '-t', 'wgt', '-s', profile, '-o', out, '--', stage], { stdio: 'inherit' })
  console.log(`signed package: ${wgt}`)
} else {
  if (!hasTizen) console.warn('tizen CLI not found')
  if (!profile) console.warn('TIZEN_PROFILE not set')
  console.warn('writing an UNSIGNED .wgt (zip) — fine for inspection, not installable on a TV')
  execFileSync('zip', ['-qr', wgt, '.'], { cwd: stage, stdio: 'inherit' })
  console.log(`unsigned package: ${wgt}`)
}
