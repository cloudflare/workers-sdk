---
"wrangler": patch
---

Fix `wrangler types --check` reporting types as out of date in multi-worker setups

Previously, running `wrangler types --check -c primary/wrangler.jsonc` in a multi-worker project would incorrectly report types as out of date, even when they were current. This happened because the secondary worker config paths (passed via additional `-c` flags during generation) were not stored in the generated types file header, so `--check` had no way to resolve the secondary workers' service bindings when verifying the hash.

The fix stores secondary config paths in the generated file's header comment so that `--check` can recover them automatically. Users no longer need to re-pass every `-c` flag when running `--check` — only the primary config is required.
