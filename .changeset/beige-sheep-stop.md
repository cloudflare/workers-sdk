---
"wrangler": patch
---

Use `WRANGLER_CF_AUTHORIZATION_TOKEN` environment variable for Cloudflare Access authentication

When using `wrangler dev --remote` or remote bindings with Workers protected by Cloudflare Access, Wrangler now checks for a `WRANGLER_CF_AUTHORIZATION_TOKEN` environment variable before falling back to the interactive `cloudflared access token` command. This enables non-interactive environments like CI to authenticate with Access-protected Workers.
