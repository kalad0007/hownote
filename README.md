# HowNote Astro MVP v0.6

Production repository for **https://hownote.net**.

HowNote is a practical standards, engineering tools and sourcing-intelligence platform. The current MVP connects a small pipe/tube workflow to the first HowSpec Purchase Note drafting tool:

```text
Unit conversion
  → DN / NPS / A cross-reference
  → Actual OD and wall reference
  → Pipe weight calculation
  → Standard identity and evidence
  → Purchase Note draft
```

## Live pages

### Tools

- `/tools/pipe-weight-calculator`
  - Reference-size and custom-geometry modes
  - OD + wall or OD + ID input
  - mm / inch and m / ft input
  - kg/m, lb/ft, piece mass and total order mass
  - Density presets and custom density
  - Published-reference comparison
  - Shareable URL state and copy result
  - Dynamic handoff to a Purchase Note draft with current size, geometry, length and quantity
- `/tools/dn-nps-a-converter`
- `/tools/mm-inch-converter`
- `/tools/kg-lb-converter`
- `/tools/mpa-psi-converter`

### HowSpec

- `/howspec`
  - Product boundary and evidence model
  - Current and planned HowSpec workflow stages
- `/howspec/purchase-note`
  - Browser-only preliminary Purchase Note Builder
  - Product and dimension standards kept separate
  - Nominal size and actual geometry kept separate
  - Material, inspection, certificate, marking, packing and delivery sections
  - Automatic open-item flags
  - Copy, TXT download and print output

The Purchase Note MVP is a drafting aid. It does not establish standard equivalence, product compatibility, regulatory compliance or supplier capability.

### References

- `/sizes`
- `/standards`
- `/standards/asme-b36-10`
- `/sources`
- `/methodology/pipe-weight`
- `/methodology/nominal-pipe-size`

### Trust and policy

- `/about`
- `/contact`
- `/privacy`
- `/terms`
- `/disclaimer`
- custom `/404`

## Initial pipe-size scope

The first Schedule 40 reference subset contains:

- NPS 2 / DN 50 / regional alias 50A
- NPS 2 1/2 / DN 65 / regional alias 65A
- NPS 3 / DN 80 / regional alias 80A
- NPS 4 / DN 100 / regional alias 100A
- NPS 6 / DN 150 / regional alias 150A
- NPS 8 / DN 200 / regional alias 200A

The shared source module is `src/data/pipe.ts`. The calculator, nominal-size converter and Purchase Note Builder use the same subset.

## Evidence labels

- `OFFICIAL`: standard identity, edition and scope from ASME
- `MANUFACTURER`: limited OD, wall and nominal-mass cross-checks
- `CALCULATED`: HowNote geometry, density and unit-conversion results
- `Regional alias`: A designation shown for convenience; not ASME terminology
- `UNRESOLVED`: missing or unverified transaction requirement
- `INTERFACE REFERENCE`: workflow research that is not used as production dimension data

HowNote does not reproduce the complete paid ASME dimension table.

## Local development

Use Node.js 22.12.0 or later.

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run validate
```

The zero-dependency verifier checks expected routes, the sitemap, robots.txt, the 404 page, internal links, deployment metadata, security files and the canonical `hownote.net` host.

## Cloudflare Workers deployment

The site is a static Astro build deployed with Workers Static Assets.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- Output directory: `dist`
- Config: `wrangler.jsonc`

Manual deployment:

```bash
npm run deploy
```

Pushes to `main` should trigger the connected Cloudflare Workers Build. GitHub Actions also validates every push to `main` and every pull request.

## Current architecture

```text
hownote.net
  → Cloudflare Workers Static Assets
  → Astro static generation
  → TypeScript source data
  → browser-side calculations and Purchase Note drafting
```

No Supabase database is required at this stage. A database becomes relevant when the product needs user accounts, saved projects, arbitrary standards graph queries, document uploads, live AI analysis or stored transaction-specific Purchase Notes.

## Project source documents

- `docs/PROJECT_CONTEXT.md`
- `docs/SECURITY_AND_SEO.md`
- `docs/PURCHASE_NOTE_MVP.md`

## Next product gates

1. Confirm the production deploy and GitHub validation for v0.6.
2. Validate calculator-to-Purchase-Note handoff on desktop and mobile.
3. Activate a working HowNote contact email before public outreach.
4. Add `www.hownote.net` and redirect it to the canonical apex domain.
5. Register Google Search Console and Naver Search Advisor.
6. Expand pipe data only after each new source set is documented.
7. Build the first evidence-backed Standard Compare case.
8. Convert verified comparison gaps into Purchase Note risk points.
