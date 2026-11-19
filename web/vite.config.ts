import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run build:app: the pages inside the Android/iOS app (mobile/), drawn up to the screen's edges
const appHtml = (): Plugin => ({
  name: 'kockolov-app-html',
  transformIndexHtml: (html) =>
    html
      .replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
      // no web manifest or install prompt inside the app
      .replace(/\s*<link rel="manifest"[^>]*>/, ''),
});

// The app and the in-browser preview never open the site's camera view (components/ScanButton.tsx drops
// it there), but its 1 MB barcode reader .wasm would still be copied into their builds
const noWebScanner = (): Plugin => ({
  name: 'kockolov-no-web-scanner',
  enforce: 'pre',
  resolveId: (id) => (id.startsWith('zxing-wasm/reader/zxing_reader.wasm') ? '\0no-zxing-wasm' : null),
  load: (id) => (id === '\0no-zxing-wasm' ? 'export default ""' : null),
});

export default defineConfig(({ mode }) =>
  mode === 'ssr'
    ? {
        // the server's page renderer (server/src/seo/ssr.ts): one self-contained file with React and the
        // app, because the server's Docker image has only the server's own dependencies
        plugins: [react(), tailwindcss(), noWebScanner()],
        ssr: { noExternal: true, target: 'node' },
        build: { ssr: 'src/entry-server.tsx', outDir: 'dist-ssr', emptyOutDir: true, sourcemap: false, copyPublicDir: false, rollupOptions: { output: { inlineDynamicImports: true } } },
      }
    : mode === 'app'
    ? {
        plugins: [react(), tailwindcss(), appHtml(), noWebScanner()],
        build: { outDir: 'dist-app', sourcemap: false },
      }
    : mode === 'demo'
    ? {
        // npm run build:demo: one self-contained HTML file with the app, data and pictures inside
        plugins: [react(), tailwindcss(), viteSingleFile(), noWebScanner()],
        publicDir: false,
        build: { outDir: 'dist-demo', rollupOptions: { input: 'demo.html' }, sourcemap: false },
      }
    : {
        plugins: [react(), tailwindcss()],
        server: {
          port: 5173,
          proxy: { '/api': process.env.API_URL ?? 'http://localhost:8080', '/media': process.env.API_URL ?? 'http://localhost:8080', '/flags': process.env.API_URL ?? 'http://localhost:8080' },
        },
        build: { outDir: 'dist', sourcemap: false },
      },
);
