import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// An independent fixture: never import the application or its Supabase configuration.
const root = fileURLToPath(new URL('./site/', import.meta.url));
export default defineConfig({
  root,
  base: '/lumiere-app/',
  build: {
    outDir: fileURLToPath(new URL('../../dist/pages-contract/', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./site/index.html', import.meta.url)),
        callback: fileURLToPath(new URL('./site/auth/callback/index.html', import.meta.url)),
      },
    },
  },
});
