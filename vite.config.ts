import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `BASE_PATH` lets the same build serve from a GitHub Pages project subpath
 * (/comreg-freq/) or from a domain root on Cloudflare Pages.
 */
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
