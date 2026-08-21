# HowNote Astro MVP v0.4

First working repository package for **hownote.net**.

## Implemented

- Astro static-site structure for Cloudflare
- Responsive HowNote shell and navigation
- Pipe Weight Calculator
  - Standard Size mode
  - Custom OD + wall or OD + ID mode
  - mm / inch, m / ft, kg / lb
  - kg/m, lb/ft, piece mass, total order mass
  - published nominal mass comparison
  - copy result, URL state, local preference state
- Pipe Size reference table and six Size detail pages
- ASME B36.10-2022 standard metadata page
- Source and evidence page
- Pipe-weight and nominal-size methodology pages
- Structured Catalog with 30 validated JSON records
- Cloudflare static-assets configuration
- sitemap, canonical, robots, and basic structured data

## First real data scope

The standard identity and 2022 edition metadata come from official ASME sources.

The first Schedule 40 reference subset contains:

- NPS 2 / DN 50 / regional alias 50A
- NPS 2 1/2 / DN 65 / regional alias 65A
- NPS 3 / DN 80 / regional alias 80A
- NPS 4 / DN 100 / regional alias 100A
- NPS 6 / DN 150 / regional alias 150A
- NPS 8 / DN 200 / regional alias 200A

OD, wall thickness, and nominal mass are cross-checked between Wheatland Tube and Nucor Tubular manufacturer publications. This limited subset is **not presented as a transcription of the copyrighted ASME table**.

## Evidence labels

- `OFFICIAL`: standard identity and edition metadata from ASME
- `Manufacturer cross-verified`: dimensions checked across two manufacturer publications
- `CALCULATED`: HowNote geometry, density assumption, and unit conversion
- `Regional alias`: A designation shown for convenience; not ASME terminology

## Run locally

Use Node 22.12.0 or later.

```bash
npm install
npm run test
npm run dev
```

Build:

```bash
npm run build
```

## Cloudflare

### Pages dashboard

- Production branch: `main`
- Build command: `npm run build`
- Build output: `dist`

### Workers static assets

The repository includes `wrangler.jsonc`.

```bash
npm run deploy
```

After the first successful deployment, connect `hownote.net` as the custom domain.

## Validation completed in this package

```text
Catalog validation: 30 records, 0 warnings, 0 errors
JSON Schema Draft 2020-12: 30/30 passed
Static route check: 16 routes, 6 Size routes, 0 broken literal internal links
pipe-weight.test.ts: passed
catalog-to-calculator.test.ts: passed
published-size-subset.test.ts: passed
Responsive static preview: rendered in Chromium at desktop and mobile widths
```

The current execution environment could not reach the npm registry, so dependency installation and the final `astro build` were not run here. The repository is prepared for that first connected-environment build.

## Important limitations

1. The official ASME 2022 dimension table has not been transcribed or stored.
2. Only six Schedule 40 reference rows are published in the MVP.
3. The A designations are regional convenience aliases and must not be described as ASME designations.
4. The 7,850 kg/m³ carbon-steel density is a theoretical reference assumption, not a grade guarantee.
5. Calculator output does not replace the governing standard, product specification, regulation, certification, MTC/MTR, supplier confirmation, or purchase contract.

## Next implementation gate

1. Install dependencies and run the first Astro v7 build.
2. Create the GitHub repository and push `main`.
3. Deploy to Cloudflare.
4. Connect `hownote.net`.
5. Perform desktop/mobile production smoke tests.
6. Add the DN–NPS–A converter only after the calculator URL is stable.
