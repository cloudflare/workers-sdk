---
"@cloudflare/workers-auth": minor
"wrangler": minor
---

Add experimental support for OAuth 2.0 Device Authorization Grant to `wrangler login`

Run `wrangler login --experimental-device` to authenticate without a local callback server. Useful in containers, remote SSH sessions, Codespaces, and any other environment where `localhost:8976` is unreachable from your browser.

The new flow:

- prints the verification URL and user code to the terminal,
- attempts to open the verification URL in your default browser automatically (suppressed via `--browser=false`),
- prints a QR code of the verification URL so you can scan it with a phone,
- and polls the token endpoint until you approve the request (with a 5-minute hard cap).

`--callback-host` and `--callback-port` cannot be combined with `--experimental-device`, since this flow does not start a local callback server.

The device-flow primitives live in `@cloudflare/workers-auth` (exposed via the existing `createOAuthFlow(...)` API as a `device` login option), so other Cloudflare CLIs that consume the package get the flow for free.
