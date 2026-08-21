const baseUrl = (process.env.HOWNOTE_BASE_URL || 'https://hownote.net').replace(/\/$/, '');
const maxAttempts = Number(process.env.SMOKE_ATTEMPTS || 24);
const intervalMs = Number(process.env.SMOKE_INTERVAL_MS || 20_000);
const requestTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchPage = async (path, options = {}) => {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'HowNote-Production-Smoke/1.0',
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

const checkHtmlRoute = async (path, expectedText) => {
  const { url, response, body } = await fetchPage(path);
  assert(response.ok, `${url} returned ${response.status}`);
  assert(body.includes(expectedText), `${url} did not contain expected text: ${expectedText}`);
  assert(!body.includes('workers.dev'), `${url} leaked a workers.dev reference`);
  assert(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/hownote\.net/i.test(body)
      || /<link[^>]+href=["']https:\/\/hownote\.net[^"']*["'][^>]+rel=["']canonical["']/i.test(body),
    `${url} did not contain a canonical hownote.net link`,
  );
  return response;
};

const checkRedirect = async (source, target) => {
  const { url, response } = await fetchPage(source, { redirect: 'manual' });
  assert([301, 302, 307, 308].includes(response.status), `${url} did not redirect; status ${response.status}`);
  const location = response.headers.get('location') || '';
  const resolved = new URL(location, baseUrl);
  assert(resolved.origin === baseUrl, `${url} redirected to unexpected origin ${resolved.origin}`);
  assert(resolved.pathname === target, `${url} redirected to ${resolved.pathname}, expected ${target}`);
};

const runChecks = async () => {
  const rootResponse = await checkHtmlRoute('/', 'Practical engineering tools for real purchasing decisions.');
  await checkHtmlRoute('/tools/pipe-weight-calculator', 'Pipe Weight Calculator');
  await checkHtmlRoute('/tools/dn-nps-a-converter', 'DN ↔ NPS ↔ A Pipe Size Converter');
  await checkHtmlRoute('/howspec', 'From a standard number to a safer purchasing decision.');
  await checkHtmlRoute('/howspec/purchase-note', 'Turn known requirements into a supplier-confirmation draft.');

  const csp = rootResponse.headers.get('content-security-policy') || '';
  const contentTypeOptions = rootResponse.headers.get('x-content-type-options') || '';
  const referrerPolicy = rootResponse.headers.get('referrer-policy') || '';
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
    console.log(`Production smoke attempt ${attempt}/${maxAttempts}: ${baseUrl}`);
    await runChecks();
    console.log('HowNote production smoke test passed.');
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
