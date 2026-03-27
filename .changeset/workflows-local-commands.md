---
"wrangler": minor
---

Add `--local` flag to Workflows commands for interacting with local dev

All Workflows CLI commands now support a `--local` flag that targets a running `wrangler dev` session instead of the Cloudflare production API. This uses the `/cdn-cgi/explorer/api/workflows` endpoints served by the local dev server.

```
wrangler workflows list --local
wrangler workflows trigger my-workflow '{"key":"value"}' --local
wrangler workflows instances describe my-workflow latest --local
wrangler workflows instances pause my-workflow <id> --local --port 9000
```

By default, commands continue to hit remote (production). Pass `--local` to opt in, and optionally `--port` to specify a custom dev server port (defaults to 8787).
