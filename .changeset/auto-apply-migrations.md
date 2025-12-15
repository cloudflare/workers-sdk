---
"wrangler": patch
---

Add a new `--force-non-interactive` flag to `d1 migrations apply` which skips the interactive
confirmation and applies any pending migrations non-interactively. This is useful
for CI and automation.

Usage example:

wrangler d1 migrations apply <db> --remote --force-non-interactive

Fixes #5017
