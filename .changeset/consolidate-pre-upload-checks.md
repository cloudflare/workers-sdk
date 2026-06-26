---
"wrangler": minor
---

Add `--strict` flag to `wrangler versions upload` and improve pre-upload safety checks

`wrangler versions upload` now runs the same pre-upload checks as `wrangler deploy`:

- When the Worker was last edited via the Cloudflare Dashboard, the local and remote configurations are diffed and you are warned only if the diff is destructive (previously, an unconditional warning was shown).
- When local configuration values conflict with remote secrets, a warning is shown before proceeding.
- When deploying workflows that belong to a different Worker, a warning is shown before proceeding.

The new `--strict` flag (already available on `wrangler deploy`) causes `wrangler versions upload` to abort in non-interactive/CI environments when any of these conflicts are detected, instead of auto-continuing.
