const baseUrl = (process.env.HOWNOTE_BASE_URL || 'https://hownote.net').replace(/\/$/, '');
const expectedSha = (process.env.EXPECTED_SHA || '').trim();
const maxAttempts = Number(process.env.SMOKE_ATTEMPTS || 30);
const intervalMs = Number(process.env.SMOKE_INTERVAL_MS || 12_000);
const requestTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 5_000);
const expectedOrigin = new URL(baseUrl).origin;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchPage = async (path, options = {}) => {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'HowNote-Production-Smoke/1.1',
      ...(options.headers || {}),
    },
    redirect: options.redirect || 'follow',
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const body = await response.text();
  return { url, response, body };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const attributeValue = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
  return match ? match[1] : null;
};

const linkHrefByRel = (html, relation) => {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => {
    const rel = attributeValue(candidate, 'rel');
    return rel?.split(/\s+/).some((value) => value.toLowerCase() === relation.toLowerCase());
  });
  return tag ? attributeValue(tag, 'href') : null;
};

const metaContent = (html, name) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => attributeValue(candidate, 'name')?.toLowerCase() === name.toLowerCase());
  return tag ? attributeValue(tag, 'content') : null;
};

const headingText = (html) => {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : 'missing h1';
};

const verifyHtml = ({ url, response, body }, path, expectedText) => {
  assert(response.ok, `${url} returned ${response.status}`);
  assert(body.includes(expectedText), `${url} did not contain expected text: ${expectedText}; h1=${headingText(body)}`);
  assert(!body.includes('workers.dev'), `${url} leaked a workers.dev reference`);

  const canonicalHref = linkHrefByRel(body, 'canonical');
  assert(canonicalHref, `${url} did not contain a canonical link`);
  const canonical = new URL(canonicalHref, baseUrl);
  const expectedCanonical = new URL(path, `${baseUrl}/`);
  assert(canonical.origin === expectedOrigin, `${url} canonical origin was ${canonical.origin}`);
  assert(canonical.pathname === expectedCanonical.pathname, `${url} canonical path was ${canonical.pathname}, expected ${expectedCanonical.pathname}`);

  return {
    response,
    body,
    buildSha: metaContent(body, 'hownote-build'),
  };
};

const checkHtmlRoute = async (path, expectedText) => verifyHtml(await fetchPage(path), path, expectedText);

const checkRedirect = async (source, target) => {
  const { url, response } = await fetchPage(source, { redirect: 'manual' });
  assert([301, 302, 307, 308].includes(response.status), `${url} did not redirect; status ${response.status}`);
  const location = response.headers.get('location') || '';
  const resolved = new URL(location, baseUrl);
  assert(resolved.origin === expectedOrigin, `${url} redirected to unexpected origin ${resolved.origin}`);
  assert(resolved.pathname === target, `${url} redirected to ${resolved.pathname}, expected ${target}`);
};

const runChecks = async () => {
  const root = await checkHtmlRoute('/', 'Practical engineering tools for real purchasing decisions.');
  if (expectedSha) {
    assert(root.buildSha, `Production is missing the hownote-build marker; expected ${expectedSha}`);
    assert(root.buildSha === expectedSha, `Production revision is ${root.buildSha}; waiting for ${expectedSha}`);
  }

  await checkHtmlRoute('/tools/pipe-weight-calculator', 'Pipe Weight Calculator');
  await checkHtmlRoute('/tools/dn-nps-a-converter', 'DN ↔ NPS ↔ A Pipe Size Converter');
  await checkHtmlRoute('/howspec', 'From a standard number to a safer purchasing decision.');
  const purchaseNote = await checkHtmlRoute('/howspec/purchase-note', 'Turn known requirements into a supplier-confirmation draft.');
  if (expectedSha) {
    assert(purchaseNote.buildSha === expectedSha, `Purchase Note revision is ${purchaseNote.buildSha || 'missing'}; expected ${expectedSha}`);
  }

  const csp = root.response.headers.get('content-security-policy') || '';
  const contentTypeOptions = root.response.headers.get('x-content-type-options') || '';
  const referrerPolicy = root.response.headers.get('referrer-policy') || '';
  assert(csp.includes("default-src 'self'"), 'Production response is missing the expected Content-Security-Policy');
  assert(contentTypeOptions.toLowerCase() === 'nosniff', 'Production response is missing X-Content-Type-Options: nosniff');
  assert(referrerPolicy === 'strict-origin-when-cross-origin', 'Production response is missing the expected Referrer-Policy');

  const robots = await fetchPage('/robots.txt');
  assert(robots.response.ok, `robots.txt returned ${robots.response.status}`);
  assert(robots.body.includes('https://hownote.net/sitemap-index.xml'), 'robots.txt does not reference the production sitemap');

  const sitemap = await fetchPage('/sitemap-index.xml');
  assert(sitemap.response.ok, `sitemap-index.xml returned ${sitemap.response.status}`);
  assert(sitemap.body.includes('<sitemapindex'), 'sitemap-index.xml is not a sitemap index');
  assert(sitemap.body.includes('hownote.net'), 'sitemap-index.xml does not reference hownote.net');

  await checkRedirect('/tools/pipe-weight', '/tools/pipe-weight-calculator');
  await checkRedirect('/tools/dn-nps-converter', '/tools/dn-nps-a-converter');
};

let lastError;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    console.log(`Production smoke attempt ${attempt}/${maxAttempts}: ${baseUrl}; expected revision=${expectedSha || 'not set'}`);
    await runChecks();
    console.log(`HowNote production smoke test passed for revision ${expectedSha || 'unversioned'}.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`Attempt ${attempt} failed: ${error.message}`);
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
}

console.error(`HowNote production smoke test failed after ${maxAttempts} attempts.`);
console.error(lastError);
process.exit(1);
