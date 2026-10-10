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

export default defineConfig(({ mode }) =>
  mode === 'app'
    ? {
        plugins: [react(), tailwindcss(), appHtml()],
        build: { outDir: 'dist-app', sourcemap: false },
      }
    : mode === 'demo'
    ? {
        // npm run build:demo: one self-contained HTML file with the app, data and pictures inside
        plugins: [react(), tailwindcss(), viteSingleFile()],
        publicDir: false,
        build: { outDir: 'dist-demo', rollupOptions: { input: 'demo.html' }, sourcemap: false },
      }
    : {
        plugins: [react(), tailwindcss()],
        server: {
          port: 5173,
          proxy: { '/api': process.env.API_URL ?? 'http://localhost:8080' },
        },
        build: { outDir: 'dist', sourcemap: false },
      },
);
