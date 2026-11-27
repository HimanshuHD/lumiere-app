import { defineConfig, type Plugin } from 'vite';
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
  base: mode === 'pages' ? '/lumiere-app/' : '/',
  plugins: mode === 'pages' ? [react(), staticOAuthCallback()] : [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react', 'pdfjs-dist'],
  },
}));
