---
"@cloudflare/workers-auth": minor
"wrangler": minor
---

Add support for OAuth 2.0 Device Authorization Grant to `wrangler login`

Run `wrangler login --device` to authenticate without a local callback server. Useful in containers, remote SSH sessions, Codespaces, and any other environment where `localhost:8976` is unreachable from your browser.

The new flow:

- prints the verification URL and user code to the terminal,
- attempts to open the verification URL in your default browser automatically (suppressed via `--browser=false`),
- and polls the token endpoint until you approve the request (with a 5-minute hard cap).

The verification URL is supplied by the authorization server, so it is rejected unless it is an `https` URL on the same auth domain the device code was requested from — it is never printed or opened otherwise.

`--callback-host` and `--callback-port` cannot be combined with `--device`, since this flow does not start a local callback server.
