// Deployment acceptance only: no real PIN, credentials, publishing or data writes.
import assert from 'node:assert/strict';

const base = 'https://hownote.net';
const expected = process.env.EXPECTED_SHA?.trim();
assert.match(expected || '', /^[a-f0-9]{40}$/, 'Set EXPECTED_SHA to the deployed main commit.');
const evidence = [];
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { 'Cache-Control': 'no-cache', ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: base }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.text() };
}
function privateHeaders(response, path) {
  assert.match(response.headers.get('cache-control') || '', /no-store/i, path + ' must not be cached');
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/i, path + ' must not be indexed');
}
const version = await request('/version.json');
assert.equal(version.response.status, 200);
assert.equal(JSON.parse(version.body).build, expected);
for (const path of ['/ib', '/ib/research', '/ib/subjects', '/ib/edit']) {
  const { response, body } = await request(path);
  assert.equal(response.status, 200, path);
  assert.ok(body.includes('4자리 PIN'), path + ' must retain the reader gate');
  assert.equal(body.match(/name="hownote-build"\s+content="([^"]+)/)?.[1], expected, path);
  assert.ok(!body.includes('sample-linear-model'), path + ' must contain no local seed');
  assert.ok(!body.includes('synthetic-ib-publish-only-for-isolated-tests'), path + ' must contain no test credentials');
  privateHeaders(response, path);
  evidence.push({ path, status: response.status, privateShell: true });
}
const protectedReads = [
  '/ib/api/me', '/ib/api/subjects', '/ib/api/subjects/mathematics-aa/history',
  '/ib/api/research?projectKey=ib-research',
  '/ib/api/research/sample-linear-model?projectKey=ib-research',
  '/ib/api/research/sample-linear-model/revisions/1?projectKey=ib-research',
];
for (const path of protectedReads) {
  const { response, body } = await request(path);
  assert.ok([401, 503].includes(response.status), path + ' must deny anonymous reading');
  assert.ok(Object.keys(JSON.parse(body)).every(key => ['error', 'retryAfter'].includes(key)), path + ' must not return research');
  assert.equal(response.headers.get('set-cookie'), null, path);
  privateHeaders(response, path);
  evidence.push({ path, status: response.status, denied: true });
}
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  for (const path of ['/ib/api/research', '/ib/api/subjects', '/ib/api/setup', '/ib/api/pin', '/ib/api/register']) {
    const { response, body } = await request(path, method, {});
    assert.ok([401, 403, 404, 503].includes(response.status), method + ' ' + path + ' must deny anonymous changes');
    assert.ok(Object.keys(JSON.parse(body)).every(key => ['error', 'retryAfter'].includes(key)), path);
    assert.equal(response.headers.get('set-cookie'), null, path + ' must not allow first claim');
    privateHeaders(response, path);
    evidence.push({ path, method, status: response.status, denied: true });
  }
}
for (const path of ['/ib/api/publish', '/ib/api/publish-subject', '/ib/mcp']) {
  const { response, body } = await request(path, 'POST', {});
  assert.equal(response.status, 401, path + ' requires separate publishing credentials');
  assert.deepEqual(Object.keys(JSON.parse(body)), ['error'], path);
  assert.equal(response.headers.get('set-cookie'), null, path);
  privateHeaders(response, path);
  evidence.push({ path, method: 'POST', status: response.status, denied: true });
}
for (const path of ['/care/api/me', '/care/api/briefings']) {
  const { response } = await request(path);
  assert.equal(response.status, 401, path + ' must remain private');
  evidence.push({ path, status: response.status, denied: true });
}
const robots = await request('/robots.txt');
assert.equal(robots.response.status, 200);
assert.match(robots.body, /Disallow:\s*\/ib/);
const sitemapIndex = await request('/sitemap-index.xml');
assert.equal(sitemapIndex.response.status, 200);
for (const url of [...sitemapIndex.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])) {
  assert.equal(new URL(url).origin, base);
  const sitemap = await request(new URL(url).pathname);
  assert.equal(sitemap.response.status, 200);
  assert.ok(!/<loc>[^<]*\/ib(?:[\/<]|$)/.test(sitemap.body), 'Private IB routes must not enter the sitemap');
}
console.log(JSON.stringify({ service: 'hownote-ib', build: expected, status: 'PASS', authenticatedReaderTest: 'Pending owner PIN configuration; no actual PIN submitted', probes: evidence }, null, 2));
