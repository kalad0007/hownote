# Private Care journal

The owner requested a mobile-first private welfare-equipment briefing reader at `/care`, with two password-only identities, full-report and topic comments, and automatic publication of the existing scheduled report. Task management is out of scope.

## Implemented

- Astro page contains only an empty reader/login shell. Private reports and comments are never compiled into static assets or Git.
- Existing public routes remain static. `/care` requests run through the Worker; `/care/api/*` and `/care/mcp` use one SQLite-backed Durable Object.
- Two salted PBKDF2-SHA256 credential hashes (100,000 iterations, compatible with Workers Web Crypto) in the `CARE_USERS` secret. No real credential defaults.
- Random server-side sessions, HttpOnly/Secure/SameSite=Strict cookie, 30-day expiry, logout revocation, credential-rotation invalidation, same-origin writes, login throttling.
- Markdown is rendered with raw HTML disabled, safe links and mobile scrolling tables. Comments use textContent.
- Stable date and topic IDs preserve comments across report updates. Removed topic comments are still displayed. Comment retries use client-generated IDs.
- Search and date pagination. Private responses are no-store/noindex; `/care` excluded from sitemap.
- Authenticated `POST /care/api/publish` and stateless JSON-response MCP endpoint `POST /care/mcp`, exposing `publish_briefing` and `get_recent_briefings`. Publishing credentials cannot impersonate readers or read partner comments.

## Real automation status

**Not live / not connected to the scheduled task.** The local Workers runtime passed publish → read back → authenticated reader tests, including MCP initialize/tool listing/tool calls. This is a protocol/integration test, not a successful ChatGPT scheduled run.

The existing `복지용구 사업 브리핑` task was inspected read-only. It generates a report but has no publication step. The shared conversation URL could not be fetched; do not scrape it or claim it is a live feed. No task was modified.

Remaining owner-environment operations:

1. Merge and deploy the reviewed code through the existing GitHub → Cloudflare pipeline.
2. On a Cloudflare-authenticated owner machine run `npm run care:credentials` to enter each person's password and a separate publishing token without printing them. The command uploads only the hashed user records and the publishing token to Worker secrets.
3. Connect `/care/mcp` using an authenticated connector that supports a securely stored Bearer token. Never put the token in a chat, task prompt, public repository, URL query or user-facing page. If the available ChatGPT connector requires OAuth rather than stored headers, implement OAuth before connecting; this server currently implements Bearer authentication, not OAuth discovery.
4. Verify tool discovery and a harmless read in the actual scheduled-task environment. Send one owner-approved real report, read it back, then check it through the reader login.
5. Only then append `docs/CARE_AUTOMATION_APPENDIX.ko.md` to the existing task without replacing its research instructions or schedule. Run one real scheduled execution before reporting automatic publication as active.

This workspace had GitHub access but no Cloudflare credential or callable HowNote publishing connector. No production secret, live database, main branch, deployment or task was changed during development.

## Local verification

```bash
npm install --no-audit --no-fund
npm run validate
node scripts/care-local-setup.mjs
npm run care:dev
# Separate terminal, same machine/network namespace:
npm run test:care
```

The local setup writes random test credentials only to ignored `.dev.vars` and `.care-local-credentials.json`. The test refuses non-local hostnames and seeds a clearly marked fictional screen fixture. It does not publish market claims to production.

Browser checks should cover 390px and 360px phone widths, 1280px desktop, both logins, topic and whole-report comments, search, logout and reload, and malicious Markdown/comments. `docs/care-preview.html` is a self-contained demonstration with sample data only; it deliberately skips production authentication and persistence. Do not deploy this preview as the private reader.

## Deployment acceptance

Run the existing production smoke workflow for the exact merged revision, preserving public route/header/canonical checks. Verify `/care` no-store/noindex, anonymous API 401, both reader identities, comments, and authenticated publish/read-back. The production revision observed before development was `main` with generatedAt `2026-08-24T09:01:00.245Z`; this does not identify the current repository SHA. Do not claim the intended code is live until `/version.json` and HTML build markers match the deployed commit.

References: https://developers.cloudflare.com/workers/static-assets/binding/ , https://developers.cloudflare.com/durable-objects/get-started/ , https://learn.chatgpt.com/docs/automations

## Verification performed in this workspace

- `npm install --no-audit --no-fund` and `npm run validate`: passed, including all existing route/safety/state checks.
- Local Cloudflare Workers + real Durable Object runtime: 31 integration checks passed. Request body buffering was repaired after early-rejection stream errors; the final run completed without those errors.
- Chromium/Playwright: 360/390/1280px overflow checks, both password identities, topic/whole-report comments, reload persistence, search, logout, HTML-like comment text, and the standalone HTML preview passed. No page errors.
- Visual inspection: `care-mobile.png`, `care-login.png`, `care-desktop.png`. Only clearly labelled sample content is pictured.
- Production unchanged; actual scheduled publishing not enabled. No secret committed.
