---
"@cloudflare/autoconfig": minor
"wrangler": minor
"@cloudflare/workers-shared": patch
"@cloudflare/deploy-helpers": patch
---

Add expanded auto-configuration for deploy and setup flows

Wrangler can now auto-configure additional project shapes, including single HTML file deploys, Express-style Node HTTP servers, and experimental static asset and Containers paths behind explicit flags. Auto-configured deploys also include adapter metadata and live URLs in machine-readable output, while asset uploads skip Wrangler temporary files and output JSON files that would otherwise be uploaded accidentally.
