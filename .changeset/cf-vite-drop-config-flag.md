---
"@cloudflare/vite-plugin": patch
---

Drop the `--config` flag from the experimental internal `cf-vite` delegate binary.

The wrangler config file is now discovered by `cloudflare()` itself rather than being passed through, keeping `cf-vite`'s flag surface (`--mode`, `--port`, `--host`, `--local`) in sync with the sibling `cf-wrangler` delegate. `cf-vite` is an internal integration point spawned by Cloudflare tooling and is not intended to be run directly by users.
