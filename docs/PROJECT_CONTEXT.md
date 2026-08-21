# HowNote Project Context v1.5

> Updated: 2026-08-21  
> Repository: `kalad0007/hownote`  
> Production domain: `https://hownote.net`

## 1. Product definition

HowNote is a global practical reference and tools platform for calculating engineering values, converting units and nominal sizes, comparing industrial standards, and turning technical differences into safer purchasing and sourcing decisions.

The standards-focused product family is **HowSpec**. The practical output of a standards/product comparison is a **Purchase Note**, which should identify the transaction-specific items that must be confirmed with the supplier or written into the PO.

## 2. Core user ladder

```text
Calculator
  → Converter
  → Size / Standard Lookup
  → Standard Compare
  → Product Compare
  → Compatibility Analysis
  → Purchase Note
  → Supplier Confirmation / PO / Inspection
```

The front of the ladder is optimized for search entry and repeat use. The back of the ladder is intended to create high-value B2B sourcing and conformity workflows.

## 3. Current deployment and technical architecture

- Domain: `hownote.net`
- Registrar and edge platform: Cloudflare
- Source control: GitHub private repository
- Framework: Astro static output
- Deployment: Cloudflare Workers Static Assets through Git integration
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Build output: `dist`
- Database: not used in the current MVP

The MVP deliberately uses static source data, browser-side calculations and a browser-only Purchase Note draft. Supabase or another database should only be introduced when user accounts, saved projects, document uploads, real-time arbitrary comparisons, large graph traversal, collaboration or stored transaction-specific Purchase Notes require it.

## 4. Current feature set

### Engineering tools

- Pipe Weight Calculator
  - standard reference size or custom geometry
  - OD + wall thickness or OD + ID
  - mm / inch
  - m / ft
  - density presets and custom density
  - kg/m, lb/ft, piece weight and total order weight
  - published reference comparison
  - copy result and shareable URL state
- DN ↔ NPS ↔ A Converter
- mm ↔ inch Converter
- kg ↔ lb Converter
- MPa ↔ psi Converter

### HowSpec

- HowSpec product landing and evidence boundary
- browser-only Purchase Note Builder
  - project, destination and intended service
  - product and dimension standards kept separate
  - nominal size and actual geometry kept separate
  - quantity and tolerances
  - material, manufacturing route and delivery condition
  - inspection, testing and certificates
  - marking, packing, shipping mark and delivery term
  - unresolved supplier confirmations
  - automatic open-item flags
  - copy, TXT download and print output

The first Purchase Note is a drafting aid. It does not establish standard equivalence, product compatibility, regulatory compliance or supplier capability.

### Reference and trust pages

- Pipe Sizes
- Standards index
- ASME B36.10 reference page
- Sources register
- Pipe-weight methodology
- Nominal-size methodology
- About, Contact, Privacy, Terms, Disclaimer and custom 404

## 5. First verified pipe dataset

The current public subset contains six Schedule 40 reference rows:

- DN 50 / 50A / NPS 2
- DN 65 / 65A / NPS 2 1/2
- DN 80 / 80A / NPS 3
- DN 100 / 100A / NPS 4
- DN 150 / 150A / NPS 6
- DN 200 / 200A / NPS 8

The data model keeps the following separate:

- nominal designation
- actual OD
- wall thickness
- calculated ID
- material density assumption
- published nominal mass
- calculated mass
- governing standard and edition

The calculator, nominal-size converter and Purchase Note Builder reuse this one source module.

## 6. Evidence policy

Production pages must distinguish:

1. **OFFICIAL** — metadata or relationship stated by the standards organization
2. **Manufacturer cross-verified** — public manufacturer reference values checked across more than one source
3. **REGIONAL ALIAS** — convenient local naming such as the A designation; not presented as ASME terminology
4. **CALCULATED** — HowNote geometry, density and unit-conversion results
5. **UNRESOLVED** — missing or unverified transaction requirement
6. **DERIVED / AI SIMILAR** — future derived or AI-assisted relationships that must never be presented as official equivalence

A source link, evidence type and verification date should accompany published reference data whenever practical.

## 7. Whole-Spec reference boundary

Whole-Spec is used as a product and information-architecture reference for ideas such as product-family navigation, size-centered tables, unit switching, calculators and guide links.

HowNote must not copy Whole-Spec tables or treat it as the production authority for dimensions or standards relationships. Production data must be independently sourced and verified from official organizations and suitable primary/manufacturer references.

## 8. Validation baseline

Every pull request and push to `main` should run:

```bash
npm install
npm run build
npm run verify
```

The build verifier checks expected routes, internal links, canonical host, robots, sitemap, custom 404, security headers, redirects and manifest output. Cloudflare deployment is triggered only after a validated change is merged to `main`.

## 9. Security and SEO baseline

- canonical host: `https://hownote.net`
- Astro sitemap generation
- `robots.txt`
- Open Graph metadata
- WebSite JSON-LD
- web app manifest
- Cloudflare static-asset response headers
- hashed asset caching
- aliases redirected to canonical tool URLs
- footer policy pages
- `www` should redirect to the apex domain through a Cloudflare Redirect Rule after the `www` hostname is added

## 10. Next work order

1. Confirm the v0.6 production deployment on the HowSpec and Purchase Note routes.
2. Add a direct calculator-to-Purchase-Note handoff with current geometry, length and quantity.
3. Configure `www.hownote.net` → `https://hownote.net` permanent redirect.
4. Activate a working HowNote contact email and update the Contact page.
5. Register Google Search Console and Naver Search Advisor.
6. Submit `https://hownote.net/sitemap-index.xml`.
7. Add a measured production smoke test after each deployment.
8. Expand the pipe-size reference only through documented source verification.
9. Build the first evidence-backed cross-standard comparison case.
10. Draft Compatibility Analysis scoring and evidence rules.
11. Convert verified comparison gaps into prioritized Purchase Note risk points.

## 11. Non-negotiable principles

- Do not imply that a nominal pipe designation is an actual diameter.
- Do not state that two standards are equivalent without evidence for the exact editions and scope.
- Do not merge official relationships with AI similarity.
- Do not use a standard comparison alone to make a legal import, certification or conformity decision.
- Do not present the Purchase Note Builder as an automated compatibility or compliance decision.
- Do not build a large database before the product workflow is proven.
- Keep every data component reusable across tools, size pages, standards pages, comparison pages and Purchase Notes.
