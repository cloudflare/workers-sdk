---
"wrangler": minor
---

When the `WRANGLER_HIDE_BANNER` environment variable is provided, Wrangler will no longer display a version banner. This applies to all commands.

For instance, previously running `wrangler docs` would give the following output:

```
> wrangler docs
 ⛅️ wrangler 4.47.0
───────────────────
Opening a link in your default browser: https://developers.cloudflare.com/workers/wrangler/commands/
```

With `WRANGLER_HIDE_BANNER`, this is now:

```
> WRANGLER_HIDE_BANNER=true wrangler docs
Opening a link in your default browser: https://developers.cloudflare.com/workers/wrangler/commands/
```
