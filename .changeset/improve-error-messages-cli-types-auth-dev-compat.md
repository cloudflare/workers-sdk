---
"wrangler": patch
---

Improve error messages for CLI flags, type generation, auth scopes, dev server tunnels, and compatibility flags

Error messages across several areas now name the exact flags or values involved and suggest how to fix the problem:

- KV commands (`kv key put`, `kv key get`, `kv key delete`): error messages now include `--` prefixes and clear "Missing required option" / "Conflicting options" phrasing instead of the vague "Exactly one of the arguments ... is required".
- `wrangler types --include-env=false --include-runtime=false`: the error now names both flags and explains what each does.
- `wrangler login --scopes`: invalid scopes are individually identified instead of dumping the entire array.
- `wrangler dev --tunnel --remote`: the error now explains why tunnels require local mode and suggests two concrete fixes.
- Conflicting compatibility flags (`nodejs_compat_populate_process_env` / `nodejs_compat_do_not_populate_process_env`, `global_navigator` / `no_global_navigator`): errors now name the specific conflicting flags.
