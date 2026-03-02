---
"wrangler": minor
---

Add `wrangler containers registries credentials` command for generating temporary push/pull credentials

This command generates short-lived credentials for authenticating with the Cloudflare managed registry (`registry.cloudflare.com`). Useful for CI/CD pipelines or local Docker authentication.

```bash
# Generate push credentials (for uploading images)
wrangler containers registries credentials registry.cloudflare.com --push

# Generate pull credentials (for downloading images)
wrangler containers registries credentials registry.cloudflare.com --pull

# Generate credentials with both permissions
wrangler containers registries credentials registry.cloudflare.com --push --pull

# Custom expiration (default 15)
wrangler containers registries credentials registry.cloudflare.com --push --expiration-minutes=30
```
