---
"@cloudflare/codemods": patch
---

Upgrade incompatible Wrangler dependencies during Wrangler-to-cf migration.

Migrated projects now receive a compatible Wrangler range and an updated lockfile through their existing package manager. Existing dependency sections are preserved, and `--no-install` and `--dry-run` avoid package installation.
