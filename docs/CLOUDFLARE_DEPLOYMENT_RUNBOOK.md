# Cloudflare Deployment Recovery Runbook

> Production: `https://hownote.net`  
> Repository: `kalad0007/hownote`  
> Production branch: `main`

## Current deployment contract

Cloudflare must build and deploy the exact `main` revision with these settings:

```text
Build command: npm run build
Deploy command: npx wrangler deploy
Root directory: /
Wrangler config: wrangler.jsonc
Static assets directory: ./dist
```

The Astro build embeds the source revision in two places:

- `<meta name="hownote-build" content="…">` on HTML pages
- `https://hownote.net/version.json`

Cloudflare Workers Builds provides the repository commit as `WORKERS_CI_COMMIT_SHA`. GitHub validation uses `GITHUB_SHA`. The production smoke workflow passes only when the served build matches the exact pushed SHA.

## Symptom: GitHub is current but production is old

This means the source and CI are healthy but the Cloudflare build/deploy did not publish the latest `main` revision.

Do not change DNS, the custom domain or Supabase. Check the deployment pipeline in this order.

## 1. Verify the Cloudflare Git connection

In the Cloudflare dashboard:

1. Open **Workers & Pages**.
2. Open the `hownote` Worker.
3. Open **Settings → Builds**.
4. Confirm the connected repository is `kalad0007/hownote`.
5. Confirm the production branch is `main`.
6. Confirm automatic builds are enabled for pushes to the production branch.
7. Confirm the build and deploy commands match the contract above.

A successful build log should identify the current commit, install dependencies, run the Astro build and finish the Wrangler deployment without an authentication or asset-directory error.

## 2. Retry the latest build

From the Cloudflare build history, retry or redeploy the latest `main` revision.

After Cloudflare reports success, verify:

```text
https://hownote.net/version.json
https://hownote.net/tools/pipe-weight-calculator
https://hownote.net/howspec
https://hownote.net/howspec/purchase-note
```

The `build` value in `version.json` must equal the current GitHub `main` SHA.

## 3. Deploy-hook fallback

If ordinary push builds remain unreliable, create a Cloudflare Deploy Hook for the `main` branch.

Treat the hook URL as a secret. Do not paste it into source files, issues, chat messages or build logs.

Add the hook URL to the GitHub repository as an Actions secret named:

```text
CLOUDFLARE_DEPLOY_HOOK
```

Then run the manual GitHub Actions workflow:

```text
Trigger Cloudflare deployment
```

The workflow only sends a POST request to the stored secret URL. Cloudflare performs the configured repository build and deployment.

## 4. Acceptance criteria

Deployment is complete only when all of the following are true:

1. `version.json` returns the expected `main` SHA.
2. The production smoke workflow is green for that same SHA.
3. The Pipe Weight Calculator loads and calculates.
4. The DN–NPS–A Converter loads.
5. HowSpec and Purchase Note pages load.
6. Response headers include the configured CSP, `X-Content-Type-Options` and `Referrer-Policy`.
7. `robots.txt` references the production sitemap.
8. Canonical URLs use `https://hownote.net` and never the preview hostname.

## 5. What not to do

- Do not edit production files directly in Cloudflare.
- Do not disconnect `hownote.net` while diagnosing a build problem.
- Do not create a database to solve a deployment problem.
- Do not expose an API token or deploy-hook URL in the repository.
- Do not mark the deployment complete merely because the Worker URL responds; verify the exact revision.
