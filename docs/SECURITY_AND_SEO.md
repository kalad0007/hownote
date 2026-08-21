# Security and SEO Baseline

This document records the repository-managed controls used by the current static HowNote deployment.

## Repository-managed controls

### Canonical and discovery

- Canonical host: `https://hownote.net`
- Canonical URL is emitted by `BaseLayout.astro`.
- `@astrojs/sitemap` generates `sitemap-index.xml`.
- `public/robots.txt` points crawlers to the production sitemap.
- The web manifest identifies HowNote and its production start URL.
- Aliases in `public/_redirects` resolve to one canonical tool URL.

### Response headers

`public/_headers` configures:

- `X-Content-Type-Options`
- `X-Frame-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- Content Security Policy
- long-lived immutable caching for hashed `/_astro/` assets

The CSP intentionally allows inline scripts and styles because the current Astro output includes inline calculator scripts and structured data. The policy should be tightened only after those scripts are moved to hashed external assets or nonce-based execution.

### Build verification

`scripts/verify-build.mjs` fails CI when it finds:

- a missing production route
- a broken internal link
- a missing custom 404 page
- a missing robots file or sitemap
- a canonical URL that does not use `hownote.net`
- a `workers.dev` URL leaked into built HTML
- a missing manifest, headers or redirect output
- an invalid web manifest
- missing baseline security headers

## Cloudflare dashboard controls still required

The following cannot be completed by repository files alone:

1. Add `www.hownote.net` as a hostname.
2. Create a permanent redirect from `www.hownote.net/*` to `https://hownote.net/$1`.
3. Confirm HTTPS and certificate status for both hostnames.
4. Confirm the Workers preview hostname is not submitted to search engines.
5. Add Search Console and Naver verification values when issued.
6. Review Cloudflare security analytics after production traffic begins.

## Change rule

Any new external script, stylesheet, image host, API call, analytics product or embedded content must be reviewed against the Content Security Policy before deployment. Do not weaken the policy globally to solve one isolated integration problem.
