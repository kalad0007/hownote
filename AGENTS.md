# HowNote Repository Instructions for Codex

These instructions apply to the entire repository.

## 1. Source of truth

Use the following priority order:

1. The current Git branch, source code, tests, workflow files and deployment configuration.
2. `docs/PROJECT_CONTEXT.md`.
3. `docs/CLOUDFLARE_DEPLOYMENT_RUNBOOK.md` and other repository documentation.
4. Official standards-organization or manufacturer sources linked from the repository.

Old chat summaries, downloaded ZIP archives and earlier generated handoff packages are historical references only. Do not assume they match the current repository.

## 2. Product identity

- **HowNote** is the parent platform and brand.
- **HowSpec** is the standards comparison, compatibility and sourcing-intelligence product layer.
- **Purchase Note** is a supplier/PO drafting output, not proof of equivalence, compatibility, conformity or legal compliance.
- Production domain: `https://hownote.net`.

## 3. Non-negotiable data and trust rules

- Never imply that a nominal pipe designation is an actual diameter.
- Keep DN, NPS and regional A aliases separate from OD, wall thickness and calculated ID.
- Keep product standard and dimension standard separate.
- Keep evidence classes visibly separate:
  - `OFFICIAL`
  - manufacturer cross-verified
  - regional alias
  - `CALCULATED`
  - `UNRESOLVED`
  - future derived or AI-similar relationships
- Never state that two standards are equivalent without evidence for the exact editions, scope and product conditions.
- Whole-Spec may be used only as a user-interface and information-architecture reference. Do not copy its tables or treat it as the authority for production data.
- Do not reproduce a complete paid standards table.
- Do not add new public dimension rows unless their source and evidence classification are documented.

## 4. Current architecture

- Astro static output.
- Browser-side calculations.
- Cloudflare Workers Static Assets.
- GitHub repository: `kalad0007/hownote`.
- Production branch: `main`.
- Node.js: 22.12.0 or later.
- Build command: `npm run build`.
- Full local validation: `npm run validate`.
- Wrangler config: `wrangler.jsonc`.
- Static output: `dist`.

Supabase or another database is **not required for the current MVP**. Do not introduce a database to solve a deployment, static-data, calculator or routing problem.

## 5. Change discipline

- Diagnose before changing code.
- Prefer the smallest root-cause fix over a rewrite.
- Preserve existing public URLs unless a redirect and migration reason are documented.
- Do not weaken evidence labels, safety checks, validation scripts or security headers to make a test pass.
- Do not expose Cloudflare tokens, Deploy Hook URLs, API keys or other secrets in source, issues, PRs, logs or screenshots.
- Do not edit generated `dist` output as a source fix.
- Do not edit production files manually in Cloudflare.
- Update or add a regression test for every bug fixed.
- Keep documentation aligned with the code actually shipped.

## 6. Required validation

Before requesting merge, run:

```bash
npm install --no-audit --no-fund
npm run validate
```

Also verify the relevant browser interactions. For deployment work, compare the served production revision with the intended Git revision using:

- `<meta name="hownote-build" content="…">`
- `https://hownote.net/version.json`

## 7. Production acceptance rule

A Worker URL responding is not sufficient. Production is accepted only when:

1. `https://hownote.net` serves the intended commit.
2. `/version.json` and the HTML build marker identify that same revision.
3. Key routes return the expected page.
4. The production smoke workflow is green for that exact revision.
5. Canonical URLs use `https://hownote.net`.
6. Security headers, robots and sitemap checks pass.

## 8. Pull request requirements

The final PR must include:

- root cause
- files changed
- commands run and results
- production revision observed before and after
- browser routes/interactions tested
- remaining manual Cloudflare action, if any
- explicit statement that no secret was committed
