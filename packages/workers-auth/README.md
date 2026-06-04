# @cloudflare/workers-auth

Internal OAuth 2.0 + PKCE flow for Cloudflare CLIs (wrangler and friends).

> **Not intended for external use.** APIs may change without notice. This package
> is consumed only by other packages inside this monorepo.

## What's in this package

- OAuth 2.0 Authorization Code flow with PKCE (RFC 6749 + RFC 7636)
- Cloudflare-flavored OAuth endpoints (`dash.cloudflare.com` / staging / `WRANGLER_*` overrides)
- Cloudflare Access detection + service-token / `cloudflared` integration for staging auth domains
- Persistent auth state stored as TOML in `<globalWranglerConfigPath>/config/<env>.toml`
- `login`, `logout`, `loginOrRefreshIfRequired`, `getOauthToken`, `getOAuthTokenFromLocalState`

What's **not** here (lives in wrangler):

- yargs `login` / `logout` / `whoami` / `auth token` commands
- Environment-based credential resolution (`CLOUDFLARE_API_TOKEN`, etc.)
- Cloudflare account selection (`requireAuth`, `getOrSelectAccountId`)
- The scope catalog (passed in as `string[]`)
- `whoami` / account fetching

## Attribution

Portions of this package are derived from
[BitySA/oauth2-auth-code-pkce](https://github.com/BitySA/oauth2-auth-code-pkce),
licensed under the Apache License 2.0. See the individual file headers for
the attribution and `LICENSE` for the full text.

The rest of the package is MIT-licensed.
