---
"@cloudflare/codemods": patch
---

Upgrade Wrangler dependencies to a version supported by `cf dev` when Wrangler-to-cf migration generates `wrangler.config.ts`.

Affected projects receive the latest Wrangler release and an updated lockfile through their existing package manager. Compatible workspace links and existing dependency sections are preserved, and `--no-install` and `--dry-run` avoid package installation.
