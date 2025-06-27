---
"wrangler": patch
---

fix: resolve "Failed to parse URL from /me" error in container dry-run deployments

Fixes an issue where `wrangler deploy --dry-run` with containers using local Dockerfiles would fail with "Failed to parse URL from /me" error. The fix ensures OpenAPI configuration is properly set up before making API calls during container building in dry-run mode.

This change only affects the specific error scenario and maintains backward compatibility.
