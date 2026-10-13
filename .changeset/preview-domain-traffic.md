---
"@cloudflare/config": minor
"@cloudflare/build-output-utils": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Add custom domain traffic settings to experimental programmatic Worker configuration

Domain objects accept `hostname`, `production`, and `previews` to serve production traffic, Preview traffic, or both. String domains continue to serve production traffic only. Apply hosting settings with a parent Worker or trigger deployment. Experimental Preview builds omit domains from Build Output and use the parent's existing hosting.
