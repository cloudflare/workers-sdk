---
"wrangler": patch
"@cloudflare/workers-auth": patch
---

Extract the OAuth 2.0 + PKCE flow into a new `@cloudflare/workers-auth` package.

The OAuth login / logout / refresh logic, the auth-config TOML file IO, the OAuth token exchange + local callback server, and the Cloudflare Access detection helpers that previously lived in `packages/wrangler/src/user/` have moved to the new internal-only `@cloudflare/workers-auth` package. Wrangler now wires the OAuth flow up via a small glue module that injects its logger, browser opener, interactivity detector, and config cache via a dependency- injection context.

What stays in wrangler:

- The yargs `login` / `logout` / `whoami` / `auth token` commands
- Environment-based credential resolution (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY` / `CLOUDFLARE_EMAIL`, etc.)
- Cloudflare account selection (`requireAuth`, `getOrSelectAccountId`)
- The OAuth scope catalog (passed into the OAuth flow as a generic `string[]`)
- `whoami` / account fetching

No behavior change for end users. The on-disk TOML format and location remain identical, and all telemetry message labels are preserved verbatim.

`@cloudflare/workers-auth` is published with `prerelease: true` and is not intended for external use — its APIs may change without notice.
