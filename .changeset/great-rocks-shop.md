---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

cleanup container images created during local dev if no changes have been made.

we now untag old images that were created by wrangler/vite if we find that the image content and configuration is unchanged. so that we don't keep accumulating image tags.
