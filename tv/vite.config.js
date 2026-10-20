/// <reference types="vite/client" />
import { defineConfig } from 'vite'
import legacy from '@vitejs/plugin-legacy'
import blitsVitePlugins from '@lightningjs/blits/vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// One build for both TVs (Samsung 2018+ = Chromium 56, LG 2018+ = Chromium 53): ES5 + polyfills.
// `legacy` only runs on `vite build`; `vite dev` serves modern code for a desktop browser.
export default defineConfig(({ command }) => ({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // the packaged app loads from file:// (Tizen, webOS), so every asset path must be relative
  base: './',
  plugins: [
    ...blitsVitePlugins,
    ...(command === 'build'
      ? [
          legacy({
            targets: ['chrome >= 53'],
            modernPolyfills: true,
            // one ES5 bundle only: Chromium 53/56 have no <script type="module"> anyway
            renderModernChunks: false,
          }),
          {
            // the packaged app loads from file:// (null origin): a crossorigin attribute would make the
            // TV's web engine refuse the script
            name: 'kockolov-no-crossorigin',
            transformIndexHtml: { order: 'post', handler: (html) => html.replace(/ crossorigin(="[^"]*")?/g, '') },
          },
        ]
      : []),
  ],
  resolve: {
    mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
  },
  server: {
    fs: { allow: ['..'] },
  },
  // `vite preview` of a build made with VITE_API_BASE=/ (relative URLs): the live API answers through the proxy
  preview: {
    proxy: {
      '/api': { target: 'https://kockolov.rs', changeOrigin: true },
      '/media': { target: 'https://kockolov.rs', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2015',
    minify: 'terser',
    sourcemap: false,
  },
  worker: { format: 'es' },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
}))
