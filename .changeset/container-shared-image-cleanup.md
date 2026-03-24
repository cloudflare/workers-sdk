---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Fix local dev incorrectly removing image tags for other container classes that share the same Docker image

When multiple container classes were built from the same Dockerfile, starting a dev session would remove image tags belonging to sibling classes that were still in use. Tag cleanup now only removes stale tags from the same repository (class name) as the one being rebuilt.
