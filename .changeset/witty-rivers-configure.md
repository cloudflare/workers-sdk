---
"@cloudflare/autoconfig": minor
"wrangler": minor
"@cloudflare/workers-shared": patch
"@cloudflare/deploy-helpers": minor
---

Add expanded auto-configuration and clearer Containers deploy feedback

Wrangler can now auto-configure additional project shapes, including single HTML file deploys, conservative no-write static directory deploys, Express-style Node HTTP servers, explicit Dockerfile-backed Containers deploys, and experimental static app paths behind an explicit flag. Auto-configured deploys also include adapter metadata and live URLs in machine-readable output, while asset uploads skip Wrangler temporary files and output JSON files that would otherwise be uploaded accidentally.

`wrangler setup --yes` and explicit Dockerfile deploys can now configure Dockerfile-backed Containers in non-interactive environments. Bare `wrangler deploy` can also fall back to a root Dockerfile when no stronger project detection applies. Deploying configured Container projects now reports container app changes in machine-readable output, suppresses expected registry preflight misses, explains when unchanged local images are skipped, shows readiness guidance, and includes health/status fields in container diagnostic JSON.
