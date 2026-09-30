---
"@cloudflare/codemods": patch
---

Upgrade incompatible Wrangler dependencies when Wrangler-to-cf migration generates `wrangler.config.ts`.

Affected projects receive a compatible Wrangler range and an updated lockfile through their existing package manager. Compatible workspace links and existing dependency sections are preserved, and `--no-install` and `--dry-run` avoid package installation.
