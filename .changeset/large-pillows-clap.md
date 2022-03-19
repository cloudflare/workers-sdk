---
"wrangler": patch
---

fix: improve authentication logging and warnings

- If a user has previously logged in via Wrangler 1 with an API token, we now display a helpful warning.
- When logging in and out, we no longer display the path to the internal user auh config file.
- When logging in, we now display an initial message to indicate the authentication flow is starting.

Fixes [#526](https://github.com/cloudflare/wrangler2/issues/526)
