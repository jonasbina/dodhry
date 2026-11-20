import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dodhry.pages.dev',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: { build: { target: 'es2022' } },
});
