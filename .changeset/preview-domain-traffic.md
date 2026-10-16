---
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/vite-plugin": minor
---

Add custom domain traffic settings to experimental programmatic Worker configuration

Domain objects accept `hostname`, `production`, and `previews` to serve production traffic, Preview traffic, or both. String domains continue to serve production traffic only. Apply hosting settings with a parent Worker or trigger deployment.
