import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

function staticOAuthCallback(): Plugin {
  return {
    name: 'lumiere-static-oauth-callback',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entry = bundle['index.html'];
        if (entry?.type !== 'asset') this.error('Missing built app entry for OAuth callback.');
        this.emitFile({ type: 'asset', fileName: 'auth/callback/index.html', source: entry.source });
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === 'pages'
    ? process.env.LUMIERE_PAGES_PREVIEW === 'true' ? '/lumiere-app/preview/' : '/lumiere-app/'
    : '/',
  plugins: [
    react(),
    {
      name: 'inline-page-transitions',
      transformIndexHtml: {
        order: 'pre',
        handler: html => html.replace('<!-- lumiere-transition-runtime -->',
          `<script>${readFileSync(new URL('./src/shared/transitions/runtime.js', import.meta.url), 'utf8')}</script>`),
      },
    },
    ...(mode === 'pages' ? [staticOAuthCallback()] : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
}));
