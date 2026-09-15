# HowNote publisher OAuth

The private reader continues to use its two password identities. OAuth grants only
briefing read/write access; it cannot read comments or impersonate either reader.

## One-time connection

1. In the production hownote Worker, set `CARE_USERS` and `CARE_PUBLISH_TOKEN` as
   **Runtime variables and secrets**, type Secret. Build variables are unrelated.
2. In ChatGPT Plugins, use + to add HowNote with server URL
   `https://hownote.net/care/mcp` and authentication OAuth. No manually issued OAuth
   client ID/secret is needed: public clients register dynamically.
3. Review the connection's requested tools and permissions. In HowNote's first-party
   consent page, enter the existing publisher key and allow the requested scopes.
   Never enter the publisher key into the ChatGPT prompt, URL, or source code.
4. Verify `get_recent_briefings` first. Then use the existing complete daily report
   with `publish_briefing`, read it back, and compare full content and sources.
5. Verify that the existing scheduled task can use this connection without an
   interactive per-run approval. A successful manual call alone does not establish
   unattended scheduled publishing. Do not mark the task connected before this test.

## Contract and limits

- RFC 9728 resource metadata: `/.well-known/oauth-protected-resource/care/mcp`
  (root resource metadata alias also exists).
- RFC 8414 issuer metadata: `/.well-known/oauth-authorization-server`.
- Authorization code flow with mandatory S256 PKCE and resource binding.
- Public DCR clients use `token_endpoint_auth_method: none`. No CIMD fetch or SSRF.
- Allowed callbacks are exact registered HTTPS URLs on chatgpt.com at
  `/connector_platform_oauth_redirect` or `/connector/oauth/<callback_id>`.
  No query strings, fragments, credentials, arbitrary hosts or wildcard redirects.
- Authorization response includes issuer (`iss`).
- Consent requires the publisher key, same-origin POST, short-lived CSRF cookie
  and single-use pending request. A reader password cannot grant publication.
- Access tokens expire after one hour. Refresh tokens rotate; replay revokes the
  whole grant. A connection lasts at most 90 days, then needs consent again.
- Codes expire after two minutes; consent requests after ten minutes; unused DCR
  clients after one day. Expired OAuth records are cleaned on OAuth requests.
- Rotating `CARE_PUBLISH_TOKEN` invalidates all grants, pending approvals and codes.
  `/care/oauth/revoke` supports revocation using a token and its public client ID.
- Only token hashes are stored. The original publisher key is never returned.
- Existing direct Bearer publishing remains supported. MCP tools advertise OAuth
  security schemes and enforce their respective read/write scopes, as does REST.
- GET event streams are unsupported (405); MCP uses stateless POST JSON responses.
- No new database service, production password defaults or public report files.

## Verification

`npm run validate` checks the existing static site. The existing Care runtime suite
now imports `tests/care-oauth.mjs`, covering discovery, callback restrictions,
consent, CSRF, PKCE, concurrent code redemption, scopes, publication/read-back,
refresh rotation/replay, revocation and reader/publisher isolation. Run:

```
node scripts/care-local-setup.mjs
node scripts/care-test-runner.mjs
```

Use only generated local test credentials and fixtures. Never run these write tests
against production. On production, verify discovery, intended revision and the
consent screen; the account owner completes the real first connection.

## Browser form policy

The consent HTML uses `Referrer-Policy: same-origin`: `no-referrer` causes
HTML form POSTs to carry `Origin: null`, which correctly fails the server origin
check. JSON/token responses retain no-referrer. CSP permits same-origin form
submission and only the validated registered ChatGPT callback for its redirect.
The server still rejects null and cross-origin consent POSTs.
