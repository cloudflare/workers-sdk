---
"wrangler": patch
---

fix: resolve "Failed to parse URL from /me" error in container dry-run deployments

Modified buildAndMaybePush to accept accountId as a parameter and skip account loading and disk limit validation in dry-run mode, maintaining the property that dry-run mode doesn't require API access while still allowing container building to proceed.
