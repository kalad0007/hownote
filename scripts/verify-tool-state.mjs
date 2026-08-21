import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};

const pipeCalculator = read('src/pages/tools/pipe-weight-calculator.astro');
requireText(pipeCalculator, "url.searchParams.set('material', material.value)", 'Calculator URLs must persist the selected material preset.');
requireText(pipeCalculator, "syncMaterialPreset(params.get('material'))", 'Calculator URL restore must synchronize the material preset.');
requireText(pipeCalculator, "Fix invalid inputs before copying a share link.", 'Calculator share-link copy must reject invalid state.');
requireText(pipeCalculator, "const result = calculate();", 'Calculator share actions must recalculate before copying.');

for (const path of [
  'src/pages/tools/mm-inch-converter.astro',
  'src/pages/tools/kg-lb-converter.astro',
  'src/pages/tools/mpa-psi-converter.astro',
]) {
  const source = read(path);
  requireText(source, "input.value.trim() === '' ? null", `${path} must preserve a blank input instead of coercing it to zero.`);
  requireText(source, 'Enter a valid value before copying.', `${path} must reject copy when either value is blank or invalid.`);
}

const astroConfig = read('astro.config.mjs');
requireText(astroConfig, 'WORKERS_CI_COMMIT_SHA', 'Cloudflare build revision environment support is missing.');
requireText(astroConfig, '__HOWNOTE_BUILD_SHA__', 'Astro must embed the exact source revision.');

const layout = read('src/layouts/BaseLayout.astro');
requireText(layout, 'name="hownote-build"', 'Built pages must expose the HowNote revision marker.');
requireText(layout, 'content={buildSha}', 'Build revision marker must use the embedded revision.');

const smoke = read('scripts/smoke-production.mjs');
requireText(smoke, 'EXPECTED_SHA', 'Production smoke must receive the exact expected revision.');
requireText(smoke, 'root.buildSha === expectedSha', 'Production smoke must compare the served and expected revisions.');
requireText(smoke, 'canonical.origin === expectedOrigin', 'Production smoke must parse and compare the exact canonical origin.');

const smokeWorkflow = read('.github/workflows/production-smoke.yml');
requireText(smokeWorkflow, 'EXPECTED_SHA: ${{ github.sha }}', 'Production smoke workflow must pass the pushed revision.');
requireText(smokeWorkflow, 'timeout-minutes: 15', 'Production smoke timeout must cover the configured retry budget.');

if (failures.length) {
  console.error('\nTool-state and revision verification failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Tool-state and deployment-revision verification passed.');
