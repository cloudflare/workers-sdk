---
"wrangler": minor
---

Graduate SQL, Catalog, and Pipelines under `wrangler basin` out of beta to stable

Basin SQL is now available under `wrangler basin sql`, Basin Catalog operations are available under `wrangler basin catalog`, and Pipelines operations are available under `wrangler basin pipelines`. These commands are now stable, while the previous `wrangler r2 sql`, `wrangler r2 bucket catalog`, and `wrangler pipelines` command paths remain available as hidden compatibility aliases.

The Basin SQL authentication environment variable is now `WRANGLER_BASIN_SQL_AUTH_TOKEN`. Update any existing `WRANGLER_R2_SQL_AUTH_TOKEN` configuration to use the new name. The fallback to `CLOUDFLARE_API_TOKEN` remains available.
