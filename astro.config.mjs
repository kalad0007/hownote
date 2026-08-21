import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const buildSha =
  process.env.WORKERS_CI_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.COMMIT_SHA
  || 'local';

export default defineConfig({
  site: 'https://hownote.net',
  output: 'static',
  integrations: [sitemap()],
  trailingSlash: 'never',
  vite: {
    define: {
      __HOWNOTE_BUILD_SHA__: JSON.stringify(buildSha),
    },
  },
});
