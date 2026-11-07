import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'inline-page-transitions',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html.replace('<!-- lumiere-transition-runtime -->',
        `<script>${readFileSync(new URL('./src/shared/transitions/runtime.js', import.meta.url), 'utf8')}</script>`),
    },
  }],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
});
