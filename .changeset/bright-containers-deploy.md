---
"@cloudflare/autoconfig": minor
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Improve auto-configuration and Containers deployment feedback

`wrangler setup --yes --experimental-auto-config-containers` and explicit Dockerfile deploys can now configure Dockerfile-backed Containers in non-interactive environments. Deploying configured Container projects now reports container app changes in machine-readable output, suppresses expected registry preflight misses, explains when unchanged local images are skipped, shows readiness guidance, and includes health/status fields in container diagnostic JSON.

This also makes automatic configuration paths for Express apps and static HTML entrypoints clearer by preserving explicit entrypoint handling and returning targeted errors when a configured project is deployed with a Dockerfile target.
