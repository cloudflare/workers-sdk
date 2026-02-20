---
"wrangler": minor
---

Add `wrangler api` command for making authenticated requests to the Cloudflare API

You can now make authenticated GET requests to any Cloudflare API endpoint using your existing Wrangler credentials:

```bash
wrangler api /zones
wrangler api /accounts/:account_id/workers/scripts
wrangler api /zones -H "X-Custom-Header: value"
```

The `:account_id` placeholder is automatically replaced with your resolved account ID. Custom headers can be passed with `-H`. This follows the pattern established by `gh api` and `glab api`, and is particularly useful for agents and one-off API calls.
