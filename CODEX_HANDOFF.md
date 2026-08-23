# HowNote Codex Handoff — Stabilize Build, Deployment and Production

> Repository: `kalad0007/hownote`  
> Working branch: `handoff/codex-stabilization`  
> Base branch: `main`  
> Production domain: `https://hownote.net`  
> Main SHA at handoff preparation: `1a6496e06879650d8259d8ffdf4b41574a251d9d`

## Mission

Take ownership of the repository from this branch and make the current HowNote MVP **reliably buildable, deployable and verifiably live on `hownote.net`**.

Do not expand the standards database or add new product areas until the deployment path and current MVP are stable. The immediate objective is not more features; it is a trustworthy end-to-end release path:

```text
current source
→ local validation
→ GitHub PR validation
→ Cloudflare build/deploy
→ exact production revision verification
→ browser smoke tests
```

Read `AGENTS.md` before editing anything.

## Known repository state

All earlier product PRs through PR #7 were merged before this handoff branch was created.

Current `main` contains:

- Astro static site and Cloudflare Workers Static Assets configuration
- Pipe Weight Calculator
- DN ↔ NPS ↔ A Converter
- mm ↔ inch, kg ↔ lb and MPa ↔ psi converters
- Size, standard, source and methodology pages
- HowSpec landing page
- browser-only Purchase Note Builder
- calculator-to-Purchase-Note handoff
- policy pages and custom 404
- security headers, redirects, sitemap, robots and web manifest
- build, safety and state verification scripts
- exact revision marker in HTML
- `/version.json`
- production smoke workflow
- manual Cloudflare Deploy Hook workflow
- Cloudflare deployment recovery runbook

Current package version: `0.6.2`.

Current public pipe data is intentionally limited to six Schedule 40 rows:

- DN 50 / 50A / NPS 2
- DN 65 / 65A / NPS 2 1/2
- DN 80 / 80A / NPS 3
- DN 100 / 100A / NPS 4
- DN 150 / 150A / NPS 6
- DN 200 / 200A / NPS 8

## Why this handoff is needed

The repository accumulated several rapid fixes and workflow changes. GitHub PR validation passed on recent branches, but earlier production smoke runs showed that `hownote.net` was still serving older content after a newer commit was merged.

The old smoke log repeatedly failed because the production home page did not contain the expected newer heading. This indicated a likely **Cloudflare deployment or Git-integration problem**, not merely a calculator bug.

The current assistant environment could not independently resolve `hownote.net`, so the current production revision is **not verified in this handoff**. Do not assume production is current or broken. Measure it from the Codex environment.

The Deploy Hook workflow exists, but it is not confirmed whether the GitHub secret `CLOUDFLARE_DEPLOY_HOOK` has been configured.

## Start here

### 1. Establish the exact baseline

```bash
git status
git branch --show-current
git log --oneline --decorate -10
git diff main...HEAD
```

Confirm that this handoff branch is based on main SHA:

```text
1a6496e06879650d8259d8ffdf4b41574a251d9d
```

If `main` has advanced, rebase this branch and update this document's observed baseline in the final PR description.

### 2. Read the critical files

Read these before making changes:

```text
AGENTS.md
README.md
docs/PROJECT_CONTEXT.md
docs/CLOUDFLARE_DEPLOYMENT_RUNBOOK.md
docs/PURCHASE_NOTE_MVP.md
package.json
astro.config.mjs
wrangler.jsonc
public/_headers
public/_redirects
.github/workflows/validate.yml
.github/workflows/production-smoke.yml
.github/workflows/cloudflare-deploy-hook.yml
scripts/verify-build.mjs
scripts/verify-purchase-note-safety.mjs
scripts/verify-tool-state.mjs
scripts/smoke-production.mjs
src/layouts/BaseLayout.astro
src/pages/version.json.ts
```

Treat code and test behavior as authoritative when documentation conflicts with implementation. Reconcile stale documentation in the final change.

### 3. Run a clean local validation

Use Node 22.12 or newer.

```bash
rm -rf node_modules dist .astro
npm install --no-audit --no-fund
npm run validate
```

Record exact results. Do not weaken a test simply to obtain green output.

Audit for:

- TypeScript/Astro build errors
- duplicated or conflicting scripts
- routes referenced by tests but not generated
- environment-dependent path handling
- revision-marker behavior when no Cloudflare/GitHub SHA environment variable exists
- `version.json` output and cache behavior
- security-header assumptions that differ between local static output and Workers deployment

### 4. Verify the source revision marker locally

Build at a known SHA environment value and confirm both markers contain it:

```bash
WORKERS_CI_COMMIT_SHA=test-revision-123 npm run build
grep -R "test-revision-123" dist | head
cat dist/version.json
```

Expected:

- regular HTML pages contain `<meta name="hownote-build" content="test-revision-123">`
- `dist/version.json` contains `"build": "test-revision-123"`

If this contract is not deterministic, fix it and add a regression test.

### 5. Measure current production before changing deployment code

From an environment with DNS and internet access, inspect:

```bash
curl -fsS https://hownote.net/version.json
curl -fsS https://hownote.net/ | grep -i hownote-build
curl -I https://hownote.net/
curl -I https://hownote.net/tools/dn-nps-a-converter
```

Compare the served build value to the latest `main` SHA.

Classify the state explicitly:

- **A. Current source and production SHA match** — deployment is working; investigate only remaining smoke/test defects.
- **B. Production serves an older SHA** — inspect Cloudflare Git build/deploy history and configuration.
- **C. Revision marker is missing** — production is older than the marker change, or the current build is not using the expected source/config.
- **D. Domain/route fails** — inspect Worker custom domain, build output and routing; do not immediately change DNS.

### 6. Inspect Cloudflare deployment configuration

Expected contract:

```text
Repository: kalad0007/hownote
Production branch: main
Root directory: /
Build command: npm run build
Deploy command: npx wrangler deploy
Wrangler config: wrangler.jsonc
Assets directory: ./dist
```

Check Cloudflare build logs for the exact commit SHA, dependency installation, Astro build and Wrangler deployment.

Fix the smallest actual cause. Likely categories include:

- Git integration no longer triggering on `main`
- wrong repository or production branch
- stale build/deploy commands
- missing permission/token for Wrangler deploy
- build succeeds but deploy step does not run
- wrong Worker project or custom-domain target
- Cloudflare build environment does not expose the expected revision variable
- production smoke begins before Cloudflare deployment completes

Do not assume the existing GitHub deploy-hook fallback is configured. Check first. Never reveal or commit the hook URL.

### 7. Verify key browser behavior

After local build and again after production deployment, test:

```text
/
/tools
/tools/pipe-weight-calculator
/tools/dn-nps-a-converter
/tools/mm-inch-converter
/tools/kg-lb-converter
/tools/mpa-psi-converter
/sizes
/standards
/standards/asme-b36-10
/howspec
/howspec/purchase-note
/version.json
/robots.txt
/sitemap-index.xml
```

Interactive regressions to cover:

1. Pipe calculator standard size selection updates OD/wall correctly.
2. Custom OD + wall and OD + ID modes reject impossible geometry.
3. mm/in and m/ft switching does not corrupt values.
4. Material preset and density remain synchronized after loading a share URL.
5. Invalid calculator state cannot copy a stale share URL.
6. Empty unit-converter input stays empty and is not coerced to zero.
7. Purchase Note handoff is disabled when active geometry, length or quantity is invalid.
8. ID-mode handoff uses the active ID field, not a stale hidden wall value.
9. Custom-size Purchase Note does not inherit ASME B36.10, Schedule 40 or sample geometry.
10. Supplier output excludes internal buyer-only notes.
11. Open-item count includes every unresolved field represented as unresolved in output.
12. Copy, TXT download and print output agree.

Use browser automation where practical and add durable tests for any defect found.

## Acceptance criteria

The task is complete only when all of the following are evidenced:

### Repository and CI

- `npm run validate` passes from a clean install.
- GitHub `Validate HowNote` passes on the final PR head.
- No secret or generated `dist` content is committed.
- Documentation matches actual implementation and current deployment steps.

### Production

- The final intended commit is deployed to `https://hownote.net`.
- `/version.json` reports the exact intended commit SHA.
- HTML `hownote-build` marker reports the same SHA.
- Production smoke passes for that exact SHA.
- Key routes return 200 with expected content.
- Canonical URLs use only `https://hownote.net`.
- No `workers.dev` hostname leaks into canonical or public metadata.
- CSP, `X-Content-Type-Options` and `Referrer-Policy` are present as intended.
- `robots.txt` points to the production sitemap.
- alternate tool routes redirect to canonical routes.

### Product safety

- Nominal size remains separate from actual dimensions.
- Current evidence labels remain intact.
- No unsupported standard-equivalence claim is introduced.
- No new public dimension data is added without documented evidence.
- No Supabase/database work is introduced.

## Expected deliverable

Work on this branch or create a clearly named successor branch. Submit one focused PR into `main` with:

1. concise root-cause statement
2. minimal code/config changes
3. regression tests
4. local validation evidence
5. GitHub Actions evidence
6. Cloudflare build/deploy evidence
7. production SHA before and after
8. browser smoke results
9. any remaining manual dashboard step, stated precisely

Do not merge the final PR until the exact-revision production acceptance criteria can be demonstrated, unless the only remaining blocker is a user-owned Cloudflare dashboard action. In that case, leave the PR ready and provide a one-screen manual action list.

## Final report format

Use this structure in the PR summary or final Codex response:

```text
Root cause
- ...

Changes
- ...

Validation
- npm run validate: PASS/FAIL
- GitHub Actions: PASS/FAIL
- Production SHA before: ...
- Production SHA after: ...
- Production smoke: PASS/FAIL

Manual action still required
- none / exact action

Risks or deferred work
- ...
```
