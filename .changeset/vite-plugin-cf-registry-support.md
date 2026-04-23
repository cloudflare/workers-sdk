---
"@cloudflare/vite-plugin": patch
"@cloudflare/containers-shared": patch
---

Support Cloudflare-managed registry images in Vite plugin local dev

Previously, using a `registry.cloudflare.com` image in a `containers` binding would crash `vite dev` with an unsupported error. The Vite plugin now configures the Cloudflare API client using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` before pulling container images, matching the behavior of `wrangler dev`.
