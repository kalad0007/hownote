import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const failures = [];
const canonicalOrigin = 'https://hownote.net';
const expectedBuildSha =
  process.env.WORKERS_CI_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.COMMIT_SHA
  || 'local';

const fail = (message) => failures.push(message);
const routeCandidates = (route) => {
  if (route === '/') return [join(dist, 'index.html')];
  const clean = route.replace(/^\//, '').replace(/\/$/, '');
  return [join(dist, clean, 'index.html'), join(dist, `${clean}.html`)];
};
const routeExists = (route) => routeCandidates(route).some(existsSync);

const attributeValue = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
  return match ? match[1] : null;
};

const canonicalHref = (html) => {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => {
    const rel = attributeValue(candidate, 'rel');
    return rel?.split(/\s+/).some((value) => value.toLowerCase() === 'canonical');
  });
  return tag ? attributeValue(tag, 'href') : null;
};

const metaContent = (html, name) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => attributeValue(candidate, 'name')?.toLowerCase() === name.toLowerCase());
  return tag ? attributeValue(tag, 'content') : null;
};

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
  '/howspec',
  '/howspec/purchase-note',
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

const requiredOutputFiles = [
  'robots.txt',
  'sitemap-index.xml',
  '404.html',
  '_headers',
  '_redirects',
  'site.webmanifest',
];
for (const file of requiredOutputFiles) {
  if (!existsSync(join(dist, file))) fail(`Missing dist/${file}`);
}

const manifestPath = join(dist, 'site.webmanifest');
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== 'HowNote') fail('Web manifest name must be HowNote.');
    if (manifest.start_url !== '/') fail('Web manifest start_url must be /.');
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) fail('Web manifest must include an icon.');
  } catch (error) {
    fail(`Invalid site.webmanifest JSON: ${error.message}`);
  }
}

const headersPath = join(dist, '_headers');
if (existsSync(headersPath)) {
  const headers = readFileSync(headersPath, 'utf8');
  for (const requiredHeader of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
    if (!headers.includes(requiredHeader)) fail(`Missing ${requiredHeader} in _headers.`);
  }
  if (!headers.includes('/_astro/*') || !headers.includes('immutable')) {
    fail('Hashed Astro assets must have an immutable cache rule.');
  }
}

const redirectsPath = join(dist, '_redirects');
if (existsSync(redirectsPath)) {
  const redirects = readFileSync(redirectsPath, 'utf8');
  for (const target of ['/tools/pipe-weight-calculator', '/tools/dn-nps-a-converter']) {
    if (!redirects.includes(target)) fail(`Missing canonical tool redirect target: ${target}`);
  }
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

  if (!file.endsWith('404.html')) {
    const href = canonicalHref(html);
    if (!href) {
      fail(`Missing canonical URL: ${file}`);
    } else {
      try {
        const canonical = new URL(href, canonicalOrigin);
        if (canonical.origin !== canonicalOrigin) {
          fail(`Wrong canonical origin ${canonical.origin}: ${file}`);
        }
      } catch {
        fail(`Invalid canonical URL ${href}: ${file}`);
      }
    }

    if (!html.includes('rel="manifest"')) fail(`Missing web manifest link: ${file}`);

    const buildSha = metaContent(html, 'hownote-build');
    if (!buildSha) fail(`Missing hownote-build revision marker: ${file}`);
    else if (buildSha !== expectedBuildSha) {
      fail(`Build revision ${buildSha} does not match expected ${expectedBuildSha}: ${file}`);
    }
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

console.log(
  `HowNote build verification passed: ${expectedRoutes.length} routes, ${htmlFiles.length} HTML files, exact revision ${expectedBuildSha}, security headers, redirects and manifest.`,
);
