---
"wrangler": patch
---

fix: gracefully fail if we can't create `~/.wrangler/reporting.toml`

In some scenarios (CI/CD, docker, etc), we won't have write access to `~/.wrangler`. We already don't write a configuration file there if one passes a `CF_API_TOKEN`/`CLOUDFLARE_API_TOKEN` env var. This also adds a guard when writing the error reporting configuration file.
