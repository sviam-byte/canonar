// canonar/astro.config.mjs
import { defineConfig } from 'astro/config';
export default defineConfig({
  base: '/',                 // обязательно
  // либо вообще без site, либо:
  site: 'https://canonar.netlify.app',
  output: 'static'
});
