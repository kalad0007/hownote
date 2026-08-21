import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dist = join(root, 'dist');
const failures = [];

const fail = (message) => failures.push(message);
const routeCandidates = (route) => {
  if (route === '/') return [join(dist, 'index.html')];
  const clean = route.replace(/^\//, '').replace(/\/$/, '');
  return [join(dist, clean, 'index.html'), join(dist, `${clean}.html`)];
};
const routeExists = (route) => routeCandidates(route).some(existsSync);

const expectedRoutes = [
  '/',
  '/tools',
  '/tools/pipe-weight-calculator',
  '/tools/dn-nps-a-converter',
  '/tools/mm-inch-converter',
  '/tools/kg-lb-converter',
  '/tools/mpa-psi-converter',
  '/sizes',
  '/standards',
  '/standards/asme-b36-10',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/methodology/pipe-weight',
  '/methodology/nominal-pipe-size',
  '/sources',
];

if (!existsSync(dist)) fail('dist directory does not exist. Run npm run build first.');
for (const route of expectedRoutes) {
  if (!routeExists(route)) fail(`Missing built route: ${route}`);
}

for (const file of ['robots.txt', 'sitemap-index.xml', '404.html']) {
  if (!existsSync(join(dist, file))) fail(`Missing dist/${file}`);
}

const htmlFiles = [];
const walk = (directory) => {
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.html')) htmlFiles.push(path);
  }
};
walk(dist);

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  if (html.includes('workers.dev')) fail(`workers.dev leaked into built HTML: ${file}`);
  if (!file.endsWith('404.html') && !/rel=["']canonical["'][^>]+hownote\.net|hownote\.net[^>]+rel=["']canonical["']/.test(html)) {
    fail(`Missing hownote.net canonical URL: ${file}`);
  }

  for (const match of html.matchAll(/href=["'](\/[^"]*?)["']/g)) {
    const href = match[1];
    if (href.startsWith('//')) continue;
    const pathname = href.split(/[?#]/, 1)[0];
    if (!pathname || pathname.startsWith('/_astro/') || pathname.includes('.')) continue;
    if (!routeExists(pathname)) fail(`Broken internal link ${href} found in ${file}`);
  }
}

if (failures.length) {
  console.error('\nHowNote build verification failed:\n');
  for (const message of [...new Set(failures)]) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`HowNote build verification passed: ${expectedRoutes.length} routes, ${htmlFiles.length} HTML files.`);
