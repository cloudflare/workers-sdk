---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

Cleanup container images created during local dev if no changes have been made.

We now untag old images that were created by Wrangler/Vite if we find that the image content and configuration is unchanged, so that we don't keep accumulating image tags.
