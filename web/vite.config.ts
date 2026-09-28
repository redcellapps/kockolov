import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) =>
  mode === 'demo'
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
