import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const fixture=JSON.parse(readFileSync('tests/fixtures/ib-research.json','utf8'));
for(const route of ['ib','ib/research','ib/edit','ib/subjects']) {
  const html=readFileSync(`dist/${route}/index.html`,'utf8');
  assert(html.includes('noindex, nofollow'),`${route}: private robots metadata`);
  assert(html.includes(`https://hownote.net/${route}`),`${route}: canonical host`);
  assert(!html.includes(fixture.title),`${route}: no research data baked into assets`);
}
for(const file of readdirSync('dist').filter(file=>/^sitemap.*\.xml$/.test(file)))assert(!/<loc>[^<]*\/ib(?:\/|<)/.test(readFileSync(`dist/${file}`,'utf8')),'IB private routes excluded from sitemap');
assert(readFileSync('dist/robots.txt','utf8').includes('Disallow: /ib'));
const headers=readFileSync('dist/_headers','utf8');assert(/^\/ib\r?$/m.test(headers)&&/^\/ib\/\*\r?$/m.test(headers),'Private IB asset header rules included');
console.log('IB build verification passed: 4 private shells, canonical host, no fixture data, sitemap and robots protection.');
