// LG webOS package: dist/ + platforms/webos → build/webos/rs.kockolov.tv_<version>_all.ipk
//
//   node scripts/build-webos.mjs            # needs `npm run build` first
//
// Uses `ares-package` from @webos-tools/cli (installed globally or via npx). webOS packages are not
// signed by the developer: LG signs on submission to the Seller Lounge.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const dist = path.join(root, 'dist')
const stage = path.join(root, 'build', 'webos', 'app')
const out = path.join(root, 'build', 'webos')

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html missing: run `npm run build` first')
  process.exit(1)
}

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
cpSync(dist, stage, { recursive: true })
for (const f of ['icon.png', 'largeIcon.png', 'splash.png']) cpSync(path.join(root, 'platforms', 'webos', f), path.join(stage, f))
const appinfo = JSON.parse(readFileSync(path.join(root, 'platforms', 'webos', 'appinfo.json'), 'utf8'))
appinfo.version = pkg.version // one version for the app and both stores
writeFileSync(path.join(stage, 'appinfo.json'), JSON.stringify(appinfo, null, 2) + '\n')

const local = spawnSync('ares-package', ['--version'], { stdio: 'ignore' }).status === 0
const cmd = local ? 'ares-package' : 'npx'
const args = local ? [] : ['--yes', '--package', '@webos-tools/cli', 'ares-package']
execFileSync(cmd, [...args, '--no-minify', '--outdir', out, stage], { stdio: 'inherit' })
console.log(`package in ${out}`)
