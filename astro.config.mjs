import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/',
  site: 'https://canonar.netlify.app',
  output: 'static',
  integrations: [react()],
  vite: {
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }
  }
});
