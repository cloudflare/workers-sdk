---
"wrangler": patch
---

fix: resolve "Failed to parse URL from /me" error in container dry-run deployments

Fixed an issue where `wrangler deploy --dry-run` with containers using local Dockerfiles would fail with "Failed to parse URL from /me" error. The fix modifies the `buildAndMaybePush` function to skip account loading and disk limit validation in dry-run mode, maintaining the property that dry-run mode doesn't require API access while still allowing container building to proceed.
