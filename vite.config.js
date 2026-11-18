import { defineConfig } from 'vite';

// base './' lets the built game run from any folder or host
// (GitHub Pages, Cloudflare Pages, itch.io, a portal's iframe).
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  server: { host: true }, // lets a phone on the same wifi open the dev server
});
